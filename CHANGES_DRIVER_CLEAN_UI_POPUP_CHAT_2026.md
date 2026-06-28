# Driver Clean UI + Popup Chat - 2026

Implemented a full clean redesign of the Driver mobile page only.

## Changed
- Rebuilt `public/driver.html` into a light, minimal, driver-friendly screen.
- Removed crowded dashboard layout and reduced the main view to one clear current-load card.
- Moved secondary actions into collapsible panels: Upload Document, Availability, My Documents, Finished Loads.
- Kept existing backend APIs and load/document/availability logic.
- Kept Admin, Dispatch, ITS iframe and Create Load capture unchanged.
- Replaced floating Chat link behavior with an in-page popup chat window.
- Floating chat button is emoji-only: `💬`.
- Clicking the floating button opens the dispatcher chat popup.
- Clicking it again closes the popup.
- Popup supports dispatcher/contact selection, message history and sending messages.

## Files changed
- `public/driver.html`
- `public/assets/driver-mobile-pro.css`

## Validation
- `npm run check` passed.
