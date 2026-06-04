# JTS Enterprise Features Final

Added without removing existing functionality:

- Load lifecycle timeline for every load.
- Driver Accept / Reject Load actions, including required reject reason.
- Driver trip status updates: picked up, in transit, delivered.
- Admin/Dispatcher load status flow extended with assigned, accepted, rejected, in progress, picked up, in transit, delayed, delivered, closed, cancelled.
- Load details page now shows the status timeline and document checklist.
- Broker bid status workflow: submitted, reviewed, accepted, rejected, booked, completed.
- Admin and Dispatcher can update bid status directly from Bids.
- Broker receives notification when bid status changes.
- Driver performance endpoint with total, active, completed, rejected, missing docs and score.
- Admin reports export endpoints for users, loads, bids and documents in CSV format.
- Admin dashboard metrics enhanced with missing docs and submitted bids.
- Driver active loads table added with accept/reject/status update/details.
- Public web assets synchronized to Android/Capacitor assets.
- Existing push notification de-duplication preserved.

Validation performed:

- npm run check
- frontend inline JavaScript syntax check
- local API flow test: admin login, create dispatcher, create driver with dispatcher, create load, driver accept, driver status update, create broker, submit bid, update bid status, export CSV, driver performance.

Default admin:

admin@jtslogistics.local / admin123
