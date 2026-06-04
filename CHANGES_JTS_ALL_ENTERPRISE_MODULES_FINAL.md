# JTS Logistics - All Enterprise Modules Final

This build keeps the existing dispatch, driver, broker, chat, GPS, bids, loads, documents and push-notification functionality and adds a complete enterprise operations layer.

## Added modules

- Enterprise Center page: `/enterprise.html`
- Fleet Management: trucks, trailers, VIN, plates, registration, insurance and inspection expiry tracking
- Maintenance reminders: service, oil change, tires, registration, insurance and DOT inspection reminders
- Driver Availability Calendar: available, busy, off duty, vacation, sick leave and out of service
- Broker / Customer profiles: company contacts, MC number, phone, email, rating and payment terms
- Document expiration / compliance records: CDL, insurance, W9, carrier agreement, medical card, registration and inspection
- Rate Confirmation generator: creates printable HTML rate confirmation documents
- Invoice generator: invoice number, customer, due date, amount and status
- Payment tracking: unpaid, pending, paid and overdue tracking
- Global search: users, loads, bids, fleet units, invoices, customers, phone, email, MC and DOT
- Full JSON backup download
- CSV exports for new enterprise tables
- Notification preferences endpoint
- Forgot password / reset password endpoints
- Driver self availability form

## API endpoints

- `/api/enterprise/dashboard`
- `/api/enterprise/search?q=`
- `/api/enterprise/fleet`
- `/api/enterprise/maintenance`
- `/api/enterprise/availability`
- `/api/enterprise/customers`
- `/api/enterprise/compliance-docs`
- `/api/enterprise/rate-confirmations`
- `/api/enterprise/invoices`
- `/api/enterprise/payments`
- `/api/enterprise/backup`
- `/api/enterprise/export/:table.csv`
- `/api/auth/forgot-password`
- `/api/auth/reset-password`

## Tested

- `npm run check`
- Local server startup
- Admin login
- Create dispatcher
- Create driver and assign dispatcher
- Dispatcher creates load for assigned driver
- Enterprise dashboard
- Fleet create/list
- Maintenance create/list
- Customer profile create/list
- Invoice create/list
- Payment create/list
- Availability create/list
- Compliance document create/list
- Rate confirmation create/list
- Global search
- Forgot password request

## Notes

- Operational data files are clean in this ZIP. Only the default admin remains.
- Default admin: `admin@jtslogistics.local` / `admin123`
- Do not commit `.env` or real secrets.
