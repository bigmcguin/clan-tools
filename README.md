# clan-tools

Tools for the ƬƁ CODM clan at **https://clan.stridlabs.com** (GitHub Pages):

- **Members** — live roster with UIDs, join/leave history and character
  reference images. Admins update it from CODM screenshots (clan log, member
  list, player profiles) read by Claude, or edit members by hand.
- **Loadouts** — searchable build library. Members add a gunsmith screenshot and
  Claude fills in the weapon, attachments, stats and build code; each loadout
  keeps its date, and anyone can copy the build code.
- **Callouts**, **Time Converter**, **Tournament Ideas**.

The pages talk to a small PHP **clan API** on Hostinger
(`hostinger/clan-api`), which holds the roster, images, passwords and the Claude
API key. Loadouts and callouts text still lives in Firebase Firestore.

- First-time setup: [SETUP.md](SETUP.md)
- API reference: [hostinger/README.md](hostinger/README.md)
- Tests: `npm test` (needs PHP 8.1+, Composer deps in `hostinger/clan-api/vendor`, Playwright)
