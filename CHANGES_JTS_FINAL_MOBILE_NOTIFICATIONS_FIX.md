# JTS Final Mobile + Notifications Fix

This package was audited and cleaned as a final production-ready UI/functionality pass.

## Fixed
- Replaced the unstable stacked UI/navigation behavior with one clean button-based JTS menu.
- Removed duplicated menu entries in the generated navigation; GPS is the single canonical menu item instead of GPS + Live Map.
- Kept `/live-map.html` available for compatibility, but the UI redirects menu usage to `/gps.html`.
- Rebuilt the light/dark contrast rules so light theme uses dark text and dark theme uses light text.
- Added stable mobile/tablet card layout for tables.
- Added stable mobile header sizing and prevented overlapping menus, floating panels and bottom docks.
- Ensured the Enable Notifications banner cannot be hidden by legacy CSS.
- Fixed a JavaScript issue in `push.js` where browsers without Notification support could fail before showing the banner.
- Updated the service worker to use a new cache name and network-first behavior for HTML/CSS/JS so old broken UI is not kept in cache.
- Hardened the backend push route so invalid VAPID keys return a safe JSON error instead of crashing the server.
- Added Android notification permissions (`POST_NOTIFICATIONS`, `WAKE_LOCK`) to the Android manifest.
- Synced the final UI/service worker/push files into the Android asset bundle.

## Important production note
Push notifications require valid VAPID keys on the server:

```bash
node generate-vapid.js
```

Then set:

```bash
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@jtslogistics.net
```

and redeploy.
