# Hostinger image host (`clan-img`)

Screenshots for the Loadouts and Callouts pages are stored here instead of
Firebase Storage, so the clan site needs no Google billing account. Firestore
(free plan) still holds the text; it only stores the image URL.

## Install (once)

1. In hPanel open **Files → File Manager** for the site you want to use
   (e.g. `stridlabs.com`) and go to `public_html`.
2. Upload `clan-img.zip` from this directory, select it and choose
   **Extract**. In the dialog type `clan-img` as the folder name, keep
   `public_html` as the destination, tick *Overwrite existing files* (for
   updates) and extract. The zip holds the files at its top level, so you
   end up with this structure:
   ```
   public_html/clan-img/
     upload.php  delete.php  _common.php  config.php  .htaccess
     files/.htaccess  files/loadouts/  files/callouts/
   ```
3. Edit `config.php`:
   - `CLAN_UPLOAD_KEY` must equal `CLAN_PASSWORD` in `loadouts.html` /
     `callouts.html` (currently `Bubbles`).
   - `ALLOWED_ORIGINS` must list the site's origin(s), e.g.
     `https://clan.stridlabs.com`.
4. Make sure `files/` is writable by PHP (Hostinger's default `755` is fine).
5. Test in a browser: `https://stridlabs.com/clan-img/upload.php` should show
   `{"ok":false,"error":"POST only"}` and
   `https://stridlabs.com/clan-img/config.php` should be a 404 / forbidden.
6. In `loadouts.html` and `callouts.html`, set `IMAGE_HOST` to the folder's
   public URL with no trailing slash, e.g. `https://stridlabs.com/clan-img`.
   Commit and push.

## Moving the old screenshots off Google (optional)

The 34 existing images are behind a Google billing hold. To keep them:

1. Reinstate billing on the `tbloadout` Google Cloud project just long
   enough for Storage to serve files again.
2. From a machine with Node 18+:
   ```
   node scripts/migrate-images.mjs --host https://stridlabs.com/clan-img --key Bubbles --dry-run
   node scripts/migrate-images.mjs --host https://stridlabs.com/clan-img --key Bubbles
   ```
   Each image is downloaded, uploaded to Hostinger and its Firestore record
   repointed. A log lands in `out/migrate-images-log.json`.
3. Close the Google billing account. Nothing on the site uses Storage any more.

If you'd rather not, skip this: members can simply re-upload their
screenshots by editing the loadout. Cards whose image is gone show a small
"Screenshot unavailable" placeholder.

## Security notes

- Uploads and deletes require the clan password in an `X-Clan-Key` header.
  It is friction, not real security (the password is in the page source), same
  as the rest of the site.
- Files are MIME-sniffed (JPEG/PNG/WebP only), size-capped (6 MB), renamed to
  `timestamp-random.ext`, and `files/.htaccess` blocks any script execution.
- `delete.php` only removes files matching that naming pattern inside
  `files/<loadouts|callouts>/`.
