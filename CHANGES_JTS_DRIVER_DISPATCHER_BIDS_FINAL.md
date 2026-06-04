# JTS Driver / Dispatcher / Bids Final Fix

Implemented in this build:

- Admin can assign a dispatcher while creating a new Driver account.
- Driver sees only their assigned dispatcher in chat by default.
- All dispatchers can see and start chat with all drivers.
- If a non-assigned dispatcher sends a message to a driver, the driver receives a chat notification and that dispatcher appears in the driver's chat list so the conversation can continue.
- Admin and Dispatcher Loads screens include an iframe section for www.time.mk above the load creation/list workspace.
- Admin and Dispatcher now have a Bids section/tab visible only to those roles.
- Bids tab shows a red count badge for submitted broker bids.
- Broker bid form requires broker contact name, email, phone, route, truck/driver and price.
- Broker bids are visible to all admins and all dispatchers.
- Public registration driver-only equipment fields are forcibly hidden unless the requested role is Driver.
- Admin Create/Edit user screens hide driver-only fields unless role is Driver.

Validation performed:

- npm run check
- frontend inline module script syntax checks
- local API flow for admin create dispatcher, admin create driver with dispatcher assignment, dispatcher-to-driver chat, driver chat visibility, broker bid submission.
