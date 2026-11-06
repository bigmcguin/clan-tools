# Clan API (`hostinger/clan-api`)

PHP backend for the clan tools site, hosted on Hostinger as its own website
and extracted into `public_html/api` (`https://clan-api.stridlabs.com/api`). Installation steps for humans are in
[`../SETUP.md`](../SETUP.md); this file is the technical reference.

The static site (GitHub Pages) talks to it through `assets/clan-api.js`.

## Endpoints

| File | Method | Who | What |
|---|---|---|---|
| `status.php` (also `/`) | GET | anyone | Health check: PHP, SDK, writable folders, which secrets are set (never their values). |
| `auth.php` | POST `{role}` | clan / admin | Checks a password; used by the unlock dialog. |
| `roster.php` | GET | anyone | `{ roster: { version, updatedAt, summary, members } \| null }` |
| `roster.php` | POST `{ baseVersion, members, summary }` | admin | Saves the next version. `409` + current roster if `baseVersion` is stale. |
| `history.php` | GET / POST `{ restoreVersion, baseVersion }` | admin | Lists saved versions / restores one as the newest. |
| `ai.php` | POST multipart `kind`, `image` | `clan`/`profile`: admin · `loadout`: anyone (`loadout_add_role`) | Claude reads a screenshot and returns structured JSON. |
| `upload.php` | POST multipart | loadouts: anyone (`loadout_add_role`) · callouts: clan · member images: `member_images_role` | Stores an image, returns its URL. |
| `delete.php` | POST `{url}` | loadouts: admin (`loadout_delete_role`) · callouts: clan · member images: `member_images_role` | Deletes an image this API stored. |
| `list.php` | GET | anyone | Member reference images: `{ "<member id>": { slot: url } }`. |
| `usage.php` | GET | admin | Screenshot reads, tokens and estimated cost (today / 7 / 30 days). |

Passwords arrive in `X-Clan-Key` / `X-Admin-Key` headers. The admin password
also counts as the clan password. The clan password is case-insensitive.
Eight wrong passwords from one device in 15 minutes locks that device out for
the rest of the window.

## Claude

- Official Anthropic PHP SDK (`anthropic-ai/sdk`, vendored by Composer) with a
  Guzzle transport, `claude-opus-5-5` by default (`anthropic_model`).
- Screenshots are downscaled to 2576 px on the long side (GD) before sending.
- Answers use **structured outputs** (`output_config.format` with a JSON
  schema per kind, in `lib/prompts.php`), then get cleaned in `lib/claude.php`
  (UIDs digits-only, roster ids verified, stats clamped 0–100, …).
- Roster reads include a compact roster (id, name, aliases, status, UID) so
  Claude can suggest which member each clan-log row or profile belongs to. The
  site re-checks every suggestion with its own matcher (`assets/clan-match.js`)
  and the admin confirms before anything is saved.
- Server-side refusal fallbacks (`fallbacks: "default"`) are sent for models
  that support them; set `anthropic_fallbacks` to `false` to stop that.
- Limits: `ai_daily_limit` reads per 24 h for clan/admin, a separate
  `public_ai_daily_limit` for password-free loadout reads, and
  `ai_hourly_per_ip` per device. Password-free screenshot uploads have
  `public_upload_hourly_per_ip` and `public_upload_daily_limit`. Each read is
  logged to `data/ai-usage.jsonl` (tokens, outcome).

## Storage

`data/` (blocked from the web):

- `roster.json` — the live roster,
- `history/roster-v000123.json` — every saved version (newest `history_keep`),
- `changelog.jsonl`, `ai-usage.jsonl`, `limits/`, `locks/`, `error.log`.

`files/` (public, scripts disabled): `loadouts/` and `callouts/` screenshots
(random names) and `members/<member id>/<slot>.<ext>` reference images.

Member ids are stable: UID for members who had one when the roster moved here,
otherwise `m-<name>` or `m-<random>`. Images stay attached when a name or UID
changes.

## Settings and secrets

- `config.php` — non-secret settings (allowed origins, model, effort per kind,
  limits, slots). Safe to commit.
- `secrets.php` — created on the server from `secrets.example.php`; never
  committed (`.gitignore`) and not in the zip. Any `config.php` key can be
  overridden there. The API first looks for `clan-api-secrets.php` in the
  folder above the API folder (outside the web root only when the API is
  installed at the site root rather than in `public_html/api`).

## Building the zip

```
bash scripts/build-clan-api.sh
```

Runs `composer install --no-dev`, strips git metadata/tests/docs from
`vendor/`, checks the SDK loads, and writes `hostinger/clan-api.zip` (files at
the top level; Hostinger's Extract dialog puts them in the folder you name,
`api`). The API works from any folder: URLs are worked out per request.

## Tests

```
npm test
```

- `tests/api.test.mjs` — the PHP API (`php -S`) against a mock Anthropic server
  (`tests/mock-anthropic.mjs`, answers in `tests/fixtures/claude-answers.json`).
- `tests/match.test.mjs` — name matching and roster-change planning, replaying
  real clan-log reads against `data/members.json`.
- `tests/e2e.test.mjs` — the real pages in Chromium (Playwright) against the
  API, mock Claude and an in-memory Firestore stand-in (`tests/stubs/`).

Set `CLAN_API_DIR=/path/to/extracted/zip` to run the API tests against a built
bundle instead of the source folder.
