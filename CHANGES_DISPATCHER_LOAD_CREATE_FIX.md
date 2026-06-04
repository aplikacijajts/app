# Dispatcher Load Creation Fix

## Fixed
- Dispatcher workspace now includes a Create Load panel inside the Loads section.
- Dispatcher can create a load and assign it only to drivers assigned to that dispatcher.
- Assigned driver dropdown is populated from `/api/users?role=driver` with assignment metadata.
- `/api/users` now returns `assignedDispatcherId` and `isAssignedToMe` for driver rows when relevant.
- `/api/loads` now enforces dispatcher ownership for load creation, preventing dispatchers from assigning loads to unassigned drivers.
- Created loads automatically set `dispatcherId` to the logged-in dispatcher.
- Public web assets synchronized to Android/Capacitor asset folders.

## Tested
- `npm run check`
- Admin login
- Admin creates dispatcher
- Admin creates driver and assigns dispatcher
- Dispatcher login
- Dispatcher sees assigned driver with metadata
- Dispatcher creates load for assigned driver
- Dispatcher sees created load
