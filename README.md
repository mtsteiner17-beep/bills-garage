# Bill's Garage — Maintenance Tracker

A working maintenance tracker for Bill's machines (mower, generator, truck, and anything else).
Built from Masen's Figma "IOT project" hifi designs — same dark design system.

## How Bill uses it

1. **Host it** — enable GitHub Pages on this repo (Settings → Pages → Deploy from branch → `main` → `/ (root)`).
   The app then lives at `https://<you>.github.io/bills-garage/`.
2. **On Bill's iPhone** (in Safari): open the link → Share → **Add to Home Screen**.
   It installs like an app and works **fully offline in the garage** after the first load
   (service worker caches everything; all data stays on his phone in the browser).
3. **First run**: a short welcome, then it starts with Bill's demo machines (Cub Cadet XT1, Predator 3500, F-150).
   Tapping any of them opens the real flow. "Reset to demo data" lives in Profile.

## What's in the app

- **Garage home**: machine cards with status chips, "Upcoming maintenance" sorted by urgency,
  red overdue cards with quick **Log / Snooze / Mark done**, stale-reading nudge ("Update hours?"),
  warranty-expiry warnings.
- **Machine page**: current reading with big-number update pad, Upcoming / History / Notes tabs,
  spec sheet (oil, filters, part numbers), seasonal checklists (spring startup / winter storage),
  quick-add menu (service, maintenance, receipt, warranty, note, fill-up).
- **Quick log**: prefilled with today's date and the predicted reading — under 10 seconds to log an oil change.
- **Due engine**: hours/miles/months rules, whichever-comes-first, severe-duty toggle, usage-rate
  prediction ("In ~3 uses or 8 hrs", estimated date), snooze, skip (logged honestly), undo.
- **Maintenance database**: bundled JSON with category defaults + model overrides
  (Cub Cadet XT1, Predator 3500, Honda EU2200i, F-150, Kubota BX, Ninja 400, …).
  Everything is tagged "general guideline" and says to check the owner's manual.
- **Add machine flow**: category → make/model → reading → suggested schedule (toggle, edit, skip).
  VIN decode (NHTSA) for vehicles when online.
- **Receipts** (photo + optional on-device OCR when online), **warranties** with expiry countdown,
  **fuel log + MPG**, **expense reports** (per machine/year, cost per mile/hour), **CSV export**,
  **backup/restore** (JSON), printable **service history report**, calendar (.ics) export, search.

## Technical

- One self-contained `index.html` (no build step, no backend). Fonts load from Google Fonts when
  online and fall back gracefully offline.
- Storage: `localStorage` under key `bills-garage-v1`. Backups: Profile → Export backup (JSON).
- Offline: `sw.js` caches the app shell (cache-first). Increment the `CACHE` name in `sw.js`
  if you change assets and want clients to refresh.
- Interval data is a starting point — verify against each machine's owner's manual.
