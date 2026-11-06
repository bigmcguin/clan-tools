#!/usr/bin/env bash
# Build hostinger/clan-api.zip — the clan API plus its Composer dependencies
# (official Anthropic PHP SDK + Guzzle), ready to upload with Hostinger's File
# Manager and extract straight into the API site's public_html.
#
#   bash scripts/build-clan-api.sh
#
# Needs PHP 8.1+, Composer and zip. Never includes secrets.php or runtime data.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/hostinger/clan-api"
OUT="$ROOT/hostinger/clan-api.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "→ Installing Composer dependencies (no dev packages)"
(cd "$SRC" && COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction --quiet)

echo "→ Staging files"
mkdir -p "$STAGE/api"
cd "$SRC"
# Everything tracked for the API, minus secrets, runtime data and uploads.
find . -type f \
  ! -path './secrets.php' ! -path './clan-api-secrets.php' \
  ! -path './data/*' ! -path './files/*/*' ! -path './vendor/*' \
  ! -name 'composer.json' ! -name 'composer.lock' \
  -print0 | while IFS= read -r -d '' f; do
    mkdir -p "$STAGE/api/$(dirname "$f")"
    cp "$f" "$STAGE/api/$f"
  done
for keep in data/.htaccess data/.gitkeep files/loadouts/.gitkeep files/callouts/.gitkeep files/members/.gitkeep; do
  mkdir -p "$STAGE/api/$(dirname "$keep")"
  cp "$keep" "$STAGE/api/$keep"
done

# Composer packages without git metadata, tests, docs or other languages' code.
cp -a vendor "$STAGE/api/vendor"
V="$STAGE/api/vendor"
find "$V" -name .git -type d -prune -exec rm -rf {} +
find "$V" -mindepth 3 -maxdepth 3 -type d \
  \( -name tests -o -name test -o -name Tests -o -name examples -o -name fixtures -o -name docs -o -name .github -o -name scripts \) \
  -prune -exec rm -rf {} +
find "$V/standard-webhooks/standard-webhooks/libraries" -mindepth 1 -maxdepth 1 ! -name php -exec rm -rf {} +
find "$V" -type f \( -name '*.md' -o -name 'phpunit*.xml*' -o -name 'phpstan*.neon*' -o -name '.gitattributes' -o -name '.editorconfig' \) -delete

echo "→ Checking the SDK loads from the staged copy"
php -r '
  require $argv[1] . "/vendor/autoload.php";
  $c = new Anthropic\Client(apiKey: "sk-ant-build-check", requestOptions: Anthropic\RequestOptions::with(transporter: new GuzzleHttp\Client()));
  echo "  SDK OK (API version " . Anthropic\Client::ANTHROPIC_API_VERSION . ")\n";
' "$STAGE/api"
for f in "$STAGE"/api/*.php "$STAGE"/api/lib/*.php; do php -l "$f" > /dev/null; done

echo "→ Zipping"
rm -f "$OUT"
(cd "$STAGE/api" && zip -q -r -X "$OUT" .)
echo "✓ $(du -h "$OUT" | cut -f1)  $OUT  ($(unzip -l "$OUT" | tail -1 | awk '{print $2}') files)"
