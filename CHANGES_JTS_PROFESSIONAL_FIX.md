# JTS Logistics - Professional Account Approval Fix

## What was improved

- Added a complete account request flow with mandatory fields:
  - first name
  - last name
  - phone
  - email
  - requested role
  - owner/operator status
  - trailer type
  - password
- Added optional carrier/equipment fields:
  - company name
  - address
  - truck/unit number
  - trailer number
  - MC number
  - DOT number
  - notes
- Admin approval now creates the approved user only after review.
- Pending approval records no longer expose password hashes through the admin API.
- Admin panel now shows owner/operator status, trailer type and equipment details.
- Admin users page now has a professional create-user form and edit-user modal.
- Backend validation was strengthened for registration and admin-created users.
- Login stores the user object in local storage and gives clearer approval messages.
- Web public files were synced to the Android/Capacitor asset folders.

## Important backend endpoints

- `POST /api/auth/register` - creates pending account request.
- `GET /api/admin/approvals?status=pending` - admin approval list.
- `POST /api/admin/approvals/:id/approve` - admin approves and creates the user.
- `POST /api/admin/approvals/:id/reject` - admin rejects request.
- `POST /api/admin/users` - admin creates an approved user directly.
- `PATCH /api/admin/users/:id` - admin edits user profile fields.

## Test status

The following checks were run successfully:

```bash
npm run check
```

Also tested through local API flow:

1. admin login
2. invalid registration validation
3. valid pending registration
4. admin approval list without password hash leakage
5. approve account
6. login with newly approved account
7. admin-created user
8. user profile patch/update

## Deployment notes

For Render/GitHub deployment:

```bash
npm install
npm start
```

Make sure these environment variables are configured in Render instead of committing secrets:

- `JWT_SECRET`
- `PORT` if needed by your host
- push/VAPID keys if push notifications are used

Default local admin remains:

- email: `admin@jtslogistics.local`
- password: `admin123`

Change the default password before real production use.
