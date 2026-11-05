# Setting up the clan server (one-off, about 20 minutes)

The site at **clan.stridlabs.com** stays on GitHub Pages. What's new is a small
**clan server** on Hostinger that:

- keeps the **live roster** (so changes show on the site straight away — no more
  editing `members.html` on GitHub),
- sends screenshots to **Claude** to read clan logs, player profiles (UIDs) and
  gunsmith loadouts — your Claude API key lives only on this server, never in
  the website,
- stores **screenshots and character reference images**,
- checks the **clan** and **admin passwords** (they're no longer in the page
  source).

> The old image host at `stridlabs.com/clan-img` never went live —
> `stridlabs.com` is a Node.js site, so PHP files there just return its 404
> page. That's why the server below gets its own subdomain.

---

## 1. Claude API key

1. Go to <https://console.anthropic.com> → **API keys** → **Create key**. Copy it
   (it starts with `sk-ant-`). Keep it private — don't paste it into GitHub,
   Discord or a chat.
2. **Billing**: make sure the account has credit.
3. Optional but sensible: **Limits** → set a monthly spend limit (e.g. US$10).

Cost guide: each screenshot is roughly **3–6 US cents** with the default model
(Claude Opus 5.5). The server caps reads at 150 a day. To spend less, set
`'anthropic_model' => 'claude-sonnet-5-5'` (about half) or
`'claude-haiku-5-5'` (much cheaper, less accurate) in `secrets.php`.

## 2. Create the API site on Hostinger

1. hPanel → **Websites** → **Add website** → choose an **empty / custom PHP**
   website (not WordPress, not Node.js) → domain **`clan-api.stridlabs.com`**
   (a subdomain of the domain you already own). Pick PHP 8.2 or newer if asked.
2. hPanel → **Security → SSL**: check `clan-api.stridlabs.com` shows an active
   certificate (press **Install** if not — it can take a few minutes).
3. Download **`hostinger/clan-api.zip`** from this repo (open it on GitHub →
   **Download raw file**).
4. hPanel → the new site → **File Manager** → open **`public_html`** → delete the
   placeholder `default.php` / `index.html` if there is one → **Upload**
   `clan-api.zip` → right-click it → **Extract** → extract into `public_html`
   itself (not a sub-folder). You should see `status.php`, `config.php`,
   `lib/`, `vendor/`, … directly inside `public_html`. Delete the zip.

> Using a different name than `clan-api.stridlabs.com`? Change `DEFAULT_API`
> at the top of `assets/clan-api.js` to match.

## 3. Add your secrets

In File Manager, inside `public_html`:

1. Right-click **`secrets.example.php`** → **Copy** → name the copy
   **`secrets.php`**.
2. Edit `secrets.php` and fill in:
   - `anthropic_api_key` — the key from step 1,
   - `clan_password` — a **new** clan password for members (the old one,
     "Bubbles", sat in the public page source, so treat it as known),
   - `admin_password` — a different, stronger password just for you.
3. Save.

Re-uploading the zip later never overwrites `secrets.php`, your roster or
images. (Extra-safe option: put the file one folder **above** `public_html`
and name it `clan-api-secrets.php` — the server looks there first.)

## 4. Check it

Open **<https://clan-api.stridlabs.com/status.php>**. You want `"ok": true` and
every item under `"checks"` showing `true`:

| Check | If it's `false` |
|---|---|
| `secretsFile` | `secrets.php` isn't in `public_html` (or is misnamed). |
| `anthropicKey` / `clanPassword` / `adminPassword` | That value is blank in `secrets.php`. |
| `claudeSdk` | The `vendor/` folder is missing — extract the zip again. |
| `dataWritable` / `filesWritable` | In File Manager set `data/` and `files/` permissions to 755. |
| `phpVersionOk` | hPanel → **Advanced → PHP Configuration** → PHP 8.1 or newer. |

Also open <https://clan-api.stridlabs.com/secrets.php> — it must show an error
or a blank page, never your values.

## 5. Put the new pages live

The changes are on the branch `claude/clan-tools-revamp-9pvh1y`. Merge it into
`main` (GitHub → **Pull requests → New** → base `main`, compare that branch →
**Create** → **Merge**). GitHub Pages updates within a couple of minutes.

## 6. First run

1. **clan.stridlabs.com/members.html → ⚙ Manage Roster → Unlock** with the admin
   password.
2. Tap **Publish roster to the clan server** (one time — it uploads the current
   list).
3. **📸 Clan log screenshots**: in CODM go to *Clan → Member → Clan Log*,
   screenshot each page, add them. Claude lists every join/leave with the
   roster member it thinks it is (★ = its suggestion). Change any that are wrong,
   untick anything you don't want, tap **Apply**.
4. **🪪 Profile screenshots**: screenshot each new member's *Player Profile*
   (with the UID) and add them. Point any unmatched ones at the right member
   (e.g. *Masonakk7* → *TB | DRƐW*) and **Apply**. The UID is shown next to the
   screenshot so you can double-check the digits.
5. **🖼 on any member** → upload character reference sheets (CODM, Minecraft,
   Roblox, poster).
6. Give the clan the new clan password. On **Loadouts → Add a Loadout** they
   pick a gunsmith screenshot, enter the password once, and Claude fills in the
   weapon, attachments and stats. The loadout date comes from the screenshot
   (file name/date) or today, and can be changed.

Every roster save is versioned: **🕘 History & undo** restores any earlier
version, and **⇩ Download backup** saves a JSON copy. Committing that file as
`data/members.json` refreshes the offline copy the site falls back to.

## If something goes wrong

- **"Can't reach the clan server"** — check `status.php` opens, SSL is active,
  and `DEFAULT_API` in `assets/clan-api.js` matches the address.
- **"Origin … is not allowed"** — add the site's address to `allowed_origins`
  (in `secrets.php` you can override it: `'allowed_origins' => ['https://clan.stridlabs.com']`).
- **"The Claude API key on the server was rejected"** — re-copy the key into
  `secrets.php`.
- **"out of credit"** — top up in the Anthropic Console.
- **Reads time out** — hPanel → **Advanced → PHP Configuration → PHP options**
  → set `max_execution_time` to 180.
- **"Too many wrong passwords"** — that device is locked out for 15 minutes.
