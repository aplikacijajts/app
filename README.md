# Trucking Portal (Express + JSON Store)

## Run
1. `npm i`
2. `npm start`
3. Open: http://localhost:4000

## Required local environment

This app needs `JWT_SECRET` for login tokens. A local `.env` file is included for development:

```env
JWT_SECRET=local_dev_jwt_secret_change_before_production_2026
PORT=4000
```

For production, replace `JWT_SECRET` with a long random value.

## Default admin (auto-created on first start)
- Email: admin@local
- Password: admin123

## Notes
- Data is stored in `/data/*.json`
- Uploaded files are stored in `/uploads/documents/YYYY/MM/`
- Files are served securely via: `/api/documents/:id/file` (permission-checked)
- Required docs for loads: POD + BOL (computed in `/api/loads/all`)


## Web Push Notifications (role-based)

### Local setup
1. Generate VAPID keys:
   - `node generate-vapid.js`
2. Copy the keys into `.env` (or use `.env.example` as a template):
   - `VAPID_PUBLIC_KEY=...`
   - `VAPID_PRIVATE_KEY=...`
   - `VAPID_SUBJECT=mailto:you@example.com`
3. Start the server and log in. On role pages you will see an **Enable notifications** banner.
4. Important:
   - Web Push requires **HTTPS** (except `http://localhost`).
   - On Render you will have HTTPS automatically.

### Deploy on Render (via GitHub)
1. Push this repository to GitHub (do **not** commit `.env` or `node_modules`).
2. Create a new **Web Service** on Render and connect the repo.
3. Build command: `npm ci`
4. Start command: `npm start`
5. Set Environment Variables on Render:
   - `JWT_SECRET` (generate a long random value)
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (e.g. `mailto:you@example.com`)
6. After deploy, open your Render URL (HTTPS), log in and enable notifications.

### Persistence note
Subscriptions are stored in `data/push-subs.json`. On Render free plan without a persistent disk, local files may reset on deploy/restart.
For production, store push subscriptions in a database or attach a persistent disk.
