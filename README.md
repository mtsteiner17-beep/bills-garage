# Bill's Garage

A maintenance tracker for trucks, cars, motorcycles, mowers, tractors, generators, pressure washers, log splitters and anything else with an engine. Built from the "IOT project" Figma design (same dark look, Bebas Neue + Public Sans, red overdue cards).

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

## Files
`index.html`, `styles.css`, `data.js` (the maintenance database), `app.js`, `sw.js` (offline), `manifest.webmanifest`, icons.
Optional: add `lineup.jpg` (the machine lineup image from Figma) to show the panning photo on the welcome screen.

Intervals are general starting points. Check each owner's manual and edit them in the app.
