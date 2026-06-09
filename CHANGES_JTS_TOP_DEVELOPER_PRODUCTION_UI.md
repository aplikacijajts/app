# JTS Top Developer Production UI Cleanup

This package was cleaned and rebuilt into a single stable production UI layer.

## Main fixes

- Removed the external Tailwind CDN dependency from all HTML pages.
- Added a local JTS Apex production design system in `/public/assets/jts-apex-production-ui.css`.
- Rebuilt the global navigation as one clean menu button with a role-based drawer.
- Removed overlapping sidebar, bottom navigation, floating quick panels and duplicate UI shells.
- Fixed light theme contrast: dark text on light cards, forms, tables and modals.
- Fixed dark theme contrast: light text on dark cards, forms, tables and modals.
- Improved desktop, tablet and mobile responsive layouts.
- Reworked tables for mobile card rendering using automatic data labels.
- Normalized buttons, forms, inputs, modals, headers, hero panels, enterprise panels, chat, notifications and GPS/map frames.
- Updated the service worker cache to use the final local UI assets.
- Synced the same final UI assets into the Android Capacitor public bundle.

## Business logic preserved

The UI layer does not change the existing backend/API business logic. Auth, roles, users, loads, bids, documents, chat, notifications, GPS, enterprise modules and settings routes remain connected to the existing implementation.

## Validation performed

- `node --check` on the final UI JavaScript.
- `node --check` on all public asset JavaScript files.
- `npm run check` for server and source routes.
- CSS parsing with `tinycss2` with zero parse errors.
- Local API smoke test over 55 checks including auth login, protected API routes and static HTML pages.
- Verified no remaining `cdn.tailwindcss.com` references.
- Verified no missing `/assets/...` or `/icons/...` references in public HTML pages.
