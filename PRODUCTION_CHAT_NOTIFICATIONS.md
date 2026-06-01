# JTS Logistics - Production Chat & Notifications

This build uses dependency-light Server-Sent Events (SSE) for live notifications and chat alerts.

## Chat rules
- Admins and dispatchers can see and message all approved users.
- Drivers can message only their assigned dispatchers.
- Brokers can message only admins.

## Notifications
- Every chat message creates an in-app notification.
- The notification stream updates live while the browser is open.
- Web push is optional and works only after VAPID keys are configured.

## Render
Use Node 22.11.0 and the included render.yaml.
Build command: npm install --omit=dev --no-audit --no-fund
Start command: npm start
