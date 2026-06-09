# JTS Chat/UI/Table Final Polish

## Updated
- Rebuilt the main JTS Apex UI stylesheet as a single clean production design system.
- Improved light/dark readability across cards, forms, tables, modals, headers, chat and notifications.
- Removed sticky table header behavior that could overlap with the page header.
- Added robust mobile table card rendering with live `data-label` updates for dynamically generated rows.
- Improved chat UI:
  - sender/receiver bubbles are visually different;
  - sender name, role, initials/avatar and message status are shown;
  - date dividers are shown between days;
  - contacts have search, unread counters and role badges;
  - chat layout is responsive for desktop, tablet and mobile.
- Deduplicated GPS/Live Map presentation so Live Map is treated as the GPS module, and `live-map.html` now redirects to the canonical GPS page.
- Kept the existing menu behavior: one menu button, one controlled slide-out menu.
- Updated the service worker cache version so browsers do not keep the older CSS/JS.
- Synced all changed web assets into the Android asset bundle.

## Files changed
- `public/assets/jts-apex-production-ui.css`
- `public/assets/jts-apex-production-ui.js`
- `public/assets/chat.js`
- `public/chat.html`
- `public/sw.js`
- `public/live-map.html`
- `android/app/src/main/assets/public/assets/jts-apex-production-ui.css`
- `android/app/src/main/assets/public/assets/jts-apex-production-ui.js`
- `android/app/src/main/assets/public/assets/chat.js`
- `android/app/src/main/assets/public/chat.html`
- `android/app/src/main/assets/public/sw.js`
- `android/app/src/main/assets/public/live-map.html`

## Verification
- `npm run check` passed.
- `node --check` passed for all public JavaScript assets and `public/sw.js`.
- Smoke tests passed for login, admin summary, users, approvals, loads, notifications, chat contacts, GPS config, settings and main HTML pages.
