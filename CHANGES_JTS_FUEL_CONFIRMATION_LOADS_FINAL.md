# JTS Fuel / Confirmation / Loads Final Polish

Final production cleanup based on the requested mobile, table, button and workflow fixes.

## UI and readability

- Fixed unreadable button text on light backgrounds.
- Added dark/light contrast overrides so light theme uses dark text and dark theme uses light text.
- Removed Logout buttons from page headers; logout remains available only inside the JTS menu.
- Disabled problematic sticky table headers that caused overlap.
- Preserved the mobile table card layout so headers do not cover rows on phones.
- Added responsive grid fixes for Fuel and Confirmation pages.

## Loads iframe / captured load data

- Added a load data capture panel directly under the iframe in Admin Loads and Dispatcher.
- The capture panel remembers typed values locally and through `/api/loads/draft`.
- Values are automatically mirrored into the Create Load form below.
- Cross-origin iframe data cannot be read directly by the browser, so the synchronized form under the iframe is the safe production approach.
- If a compatible embedded tool sends `postMessage` load data, the app can receive and mirror that data too.

## Fuel module

- Added `/fuel.html` as a new Fuel/Gorivo tab for admin, dispatcher, driver and broker.
- Added gas station dropdown with common station brands.
- Added browser/GPS location support for the driver.
- Added Google Maps iframe that searches for the selected fuel brand near the current driver location.
- Added open-in-Google-Maps action.
- Enabled geolocation in the server permissions policy and Android manifest.

## Confirmation module

- Added `/confirmation.html` only for Admin and Dispatcher roles.
- Added professional confirmation form.
- Added server-side `/api/confirmations` routes.
- Added branded PDF generation with JTS logo.
- Added in-app PDF preview and Download PDF button.
- Added recent confirmations list.
- Added `data/confirmations.json` storage.

## Technical checks performed

- `npm run check`
- `node --check` for all `src` JavaScript files
- `node --check` for all `public/assets` JavaScript files and `public/sw.js`
- inline HTML script syntax check across public HTML pages
- missing local assets check
- service worker asset check
- API smoke test for login, users, loads, GPS config, chat contacts and confirmations
- PDF smoke test: generated PDF starts with `%PDF` and returns `application/pdf`
- HTML smoke test for key pages including mobile-relevant pages
- Android public asset bundle synchronized

