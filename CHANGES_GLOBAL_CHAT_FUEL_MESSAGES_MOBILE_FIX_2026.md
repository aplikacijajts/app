# Global Chat + Fuel/Messages Mobile Fix 2026

UI-only mobile polish update.

## Changed
- Added a global floating Chat button on authenticated pages.
- Floating Chat button uses an emoji-only icon (no text).
- Added unread chat badge above the floating button.
- Badge is calculated from `/api/chat/contacts` unread counts.
- Badge refreshes periodically and reacts to chat notification stream events.
- Driver floating chat button now also uses the emoji-only style with unread badge.
- Fuel mobile page now starts directly with the fuel tools/actions instead of the large intro/hero block.
- Messages mobile page now starts directly with the chat workspace instead of the large intro/header block.
- Improved mobile spacing and readability for Fuel and Messages.
- Kept the existing desktop-aligned JTS colors while adapting them for mobile.

## Not changed
- No backend changes.
- No API route changes.
- No authentication, authorization, role or permission changes.
- No database or business logic changes.
- No payload/endpoint changes.
