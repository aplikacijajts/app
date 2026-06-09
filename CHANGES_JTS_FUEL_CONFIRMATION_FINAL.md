# JTS Fuel + Confirmation Production Fix

Final production-focused pass for the JTS Logistics portal.

## UI and readability
- Locked button contrast for light and dark themes.
- Fixed unreadable text on white/light buttons.
- Kept Logout only in the controlled menu; legacy header logout buttons are hidden/removed by the UI shell.
- Disabled sticky table headers that caused overlapping on mobile and desktop.
- Preserved mobile card layout for tables.
- Synchronized web and Android asset bundles.

## Loads iframe/data capture
- Added a load data capture panel below the iframe in Admin Loads and Dispatcher.
- The panel saves drafts locally and through `/api/loads/draft`.
- Data is auto-synced into the Create Load form.
- Added pickup, delivery, rate and notes to Create Load.
- Added backend draft persistence in `data/loadDrafts.json`.

## Гориво module
- Added `/fuel.html` and `/assets/fuel.js`.
- Added the Гориво tab for admin, dispatcher, driver and broker.
- Uses browser/device geolocation and a station dropdown.
- Shows Google Maps iframe for the selected fuel station near the current driver location.
- Added Android location permissions.

## Confirmation module
- Added `/confirmation.html` and `/assets/confirmation.js`.
- Available only for admin and dispatcher.
- Added `/api/confirmations` backend routes.
- Confirmation data is saved in `data/confirmations.json`.
- Added professional branded PDF generation with JTS logo.
- Generated PDF can be previewed inside the app and downloaded.

## Checks performed
- `npm run check`
- `node --check` for all public JS assets and `sw.js`
- Inline HTML script syntax check
- Missing asset reference check
- API smoke test for key pages and APIs
- PDF generation smoke test
