# JTS Premium TMS Modules Final

Added and tested premium logistics/TMS modules:

- Smart Driver Matching
  - Ranks approved drivers by availability, trailer type, active load count, compliance risk, dispatcher assignment and optional pickup distance.
  - Endpoint: `GET /api/enterprise/driver-matching`.

- Fuel / Profit Calculator
  - Calculates fuel cost, total cost, estimated profit and margin.
  - Stores calculation history and supports CSV export.
  - Endpoints: `POST/GET /api/enterprise/profit-calculations`.

- Driver Settlement
  - Creates printable driver settlement records with gross rate, percentage or flat pay, deductions, bonuses and net pay.
  - Drivers can view their own settlements.
  - Endpoints: `POST/GET/PATCH /api/enterprise/settlements` and printable HTML.

- Broker Rating
  - Rates brokers by payment speed, communication, reliability and rate quality.
  - Calculates overall score from 1-100.
  - Endpoints: `POST/GET/PATCH /api/enterprise/broker-ratings`.

- Super Admin / Multi-company
  - Adds company profiles with plan/status/branding details.
  - Supports `superadmin` role and keeps existing admin behavior.
  - Endpoints: `POST/GET/PATCH /api/enterprise/companies`.

- Enterprise Center UI
  - Added professional sections for all new modules on `/enterprise.html`.
  - Synced web assets to Android/Capacitor public assets.

Tested with:
- `npm run check`
- server startup
- admin login
- create dispatcher
- create driver and assign dispatcher
- smart driver matching
- profit calculation
- driver settlement creation
- broker rating creation
- company creation
