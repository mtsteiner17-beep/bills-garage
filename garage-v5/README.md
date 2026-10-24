# Garage

A maintenance tracker for trucks, cars, camper vans (diesel Sprinter), RVs, motorcycles, e-bikes, electric dirt bikes, mowers, tractors, generators, pressure washers, log splitters and anything else with an engine. Built from the "IOT project" Figma design (same dark look, Bebas Neue + Public Sans, red overdue cards).

Live at: https://mtsteiner17-beep.github.io/bills-garage/

## Putting it on a phone
- **iPhone:** open the link in Safari → Share → **Add to Home Screen**. Open it from the home screen icon from then on (that's also what lets reminders work).
- **Android:** open in Chrome → menu → **Install app**.
It works with no signal after the first load. Everything is saved on the phone itself.

## What it does
- Machines with miles, km, engine hours, or date-only tracking
- Built-in maintenance list for each machine type (editable, "whichever comes first", break-in first service, severe-duty mode)
- Home screen sorted by what's due, big red cards for overdue items, quick log, snooze or skip
- Estimates due dates from how much each machine actually gets used
- Log a service in a few taps, mark other jobs done at the same time, attach a receipt photo
- History, notes, receipts (with optional "read the receipt for me"), warranties with countdowns
- Specs & part numbers per machine that show up on the job that needs them
- VIN lookup and safety recall check for vehicles (free NHTSA data)
- Fuel log with MPG, spending per machine, printable service report, CSV export
- Spring and winter checklists, calendar export, backup & restore
- Name your own garage during setup (shows on the Home Screen icon too)
- Backup reminder that shows up like a maintenance item (every 2 weeks / month / 3 months / off)
- Import history from VMT, Fuelly, Drivvo or any spreadsheet CSV (auto-matches columns and maintenance items)
- Quick schedule editor: change the interval or when it was last done in two taps
- Add to Home Screen walkthrough for iPhone (Safari/Chrome) and Android
- Cats and bird feeders (day-based reminders like seed refills)
- Pre-trip / before-you-use checklists per machine type
- Swipe a task left to snooze a week, right to skip
- Backup & data page: one place for backup, restore, import, PDF, CSV and calendar
- Automatic backups: restore points saved on the phone each day (and before any restore or import), plus a backup file packed up on a schedule so saving it is one tap
- Garage log: a printable PDF of every machine with photos, schedule, history, fuel, specs, warranties, notes and receipt photos (Save PDF or Print)
- "How your data stays safe" page, also shown during setup
- Feedback form (bugs, ideas). Paste a Web3Forms access key into `WEB3FORMS_KEY` at the top of `more.js` to have it send directly; without one it opens an email
- Four garage themes: Shop, Pegboard, Diamond plate, Pole barn
- Loading screen: Masen's "m" mark (loader.mp4 / loader.webm)
- Icons from Lucide (ISC license)

## Files
`index.html`, `styles.css`, `data.js` (the maintenance database), `app.js`, `more.js` (backup & data, garage log, feedback), `vendor/` (jsPDF + AutoTable, MIT, for the PDF), `sw.js` (offline), `manifest.webmanifest`, icons.
Optional: add `lineup.jpg` (the machine lineup image from Figma) to show the panning photo on the welcome screen.

Intervals are general starting points. Check each owner's manual and edit them in the app.

Made by Masen · https://masen.site
