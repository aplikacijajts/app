# Driver mobile UI + ITS Dispatch capture update

## Driver phone UI
- Added a professional mobile-first Driver layout.
- Added sticky compact Driver header.
- Added clean hero/work-board section.
- Improved My Active Loads card layout for phone screens.
- Improved document upload, documents, availability and finished-load cards.
- Added bottom mobile navigation for Loads, Fuel, Alerts and Chat.
- Changed floating Chat button to an emoji-only button: 💬.
- Kept existing workflow logic for active loads, BOL approval locks, documents and notifications.

## Admin / Dispatcher ITS iframe
- Replaced the old time.mk iframe with:
  https://app.itsdispatch.com/login.php
- Added a professional ITS capture panel below the iframe.
- Added Paste from clipboard and Parse & mirror actions.
- Pasted/copied ITS load text is parsed into:
  - Load Number
  - Customer
  - Pickup
  - Delivery
  - Rate
  - Notes
- The parsed data is automatically mirrored into the Create Load form.
- The admin/dispatcher only needs to select/confirm the driver and click Create Load.

## Technical note
Direct reading of typed values inside the ITS iframe is restricted by browser cross-origin security unless ITS itself sends data via postMessage/API. The implementation includes postMessage support if ITS ever provides it, plus a production-safe paste/parse/mirror workflow that works immediately.

## Validation
- `npm run check` passed successfully.
