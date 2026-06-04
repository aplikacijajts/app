# JTS Logistics - Chat, Broker Workspace and Push Notifications Fix

## Implemented

- Driver chat contacts now show the driver's assigned dispatcher.
- If an admin sends a message to a driver, that admin automatically appears in the driver's chat contacts and the driver can reply.
- Admin Users page now includes Dispatcher -> Driver assignments.
- Broker workspace was redesigned with a map-first layout:
  - GPS map on the left
  - route offer form on the right
  - truck/driver dropdown
  - From / To fields
  - Price field
  - Notes field
  - Submit route offer button
- Broker submitted route offers are stored as broker bids and notify admins and dispatchers.
- Admin and Dispatcher bid tables now show route, truck, driver, broker contact, price and status.
- Broker can now see approved drivers/trucks in the dropdown and fleet list.
- Map vehicles API now returns truck/trailer metadata and role-aware vehicle lists.
- Push notifications package dependency added: `web-push`.
- VAPID keys are normalized server-side to avoid copy/paste whitespace issues.
- Push UI now shows clearer errors for missing VAPID keys or missing package.
- Public web files were synchronized into the Android/Capacitor assets folders.
- Volatile sample data was reset; default admin remains.

## Verified

- `npm run check` passes.
- Frontend inline scripts pass syntax checks.
- API flow verified locally:
  - admin login
  - create dispatcher, driver and broker
  - assign driver to dispatcher
  - driver sees dispatcher in chat
  - admin messages driver, admin appears in driver's chat
  - broker sees driver dropdown and fleet vehicles
  - broker submits route offer
  - admin and dispatcher see the offer
  - push public key endpoint works when VAPID keys are set
