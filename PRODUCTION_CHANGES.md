# Production changes - v2.4.0

## v2.4.0 — ITS-Dispatch-style financial reporting and Dashboard analytics

- Added a per-load financial breakdown: **Gross Revenue** (rate) is now split into **Gross for Driver**, **Dispatch Cut** (configurable `Dispatch cut %` per load, defaulting to the new company-wide **Default dispatch cut %** in Settings) and **Net Profit** (cut minus optional other costs).
- The Load create/edit form now includes Empty miles, Dispatch cut % and Other costs fields, with a live-updating Gross/Cut/Net Profit preview as you type.
- Load Details now shows the full financial breakdown (Gross for driver, Cut, Net profit, Revenue/mile) for admin and dispatcher accounts. Driver and Broker accounts continue to see only their own relevant figures; cut percentage/amount and net profit are never exposed to Driver or Broker accounts (enforced server-side).
- **Brokers / Customers** page now includes a Customer profit report: Gross (Driver) / Cut / Net Profit / Open / Delivered / Completed loads per customer, with a Ship-Date range filter (Today, Yesterday, This Week, Last Week, This Month-To-Date, Last Month, This Year, All Time, Custom).
- **Drivers** page now includes a Driver payout & mileage report: # of Loads / Gross (Driver) / Cut / Miles / Empty Miles / Revenue-per-Mile per driver, with the same date range filter and a SUMMARY totals row — matching the TruckStop ITS Dispatch "Drivers" report tab.
- Added a new **Dispatchers** page (administrator-only) showing # of Loads / Gross (Driver) / Cut / Net Profit / Open Loads per dispatcher, aggregated from the loads of each dispatcher's assigned drivers, with a SUMMARY totals row — matching the ITS Dispatch "Dispatchers" report tab.
- Dashboard now opens with an ITS-Dispatch-style analytics section: an **Open Loads** gauge, a **Net Margin %** gauge, and **Load Volume** / **Gross Revenue** / **Truck Miles** line charts (all pure inline SVG, no external chart library/CDN required), plus a fleet status panel (Trailers / Trucks / Carriers / Drivers), all driven by the same shared Ship-Date range filter.
- All new financial/report data is computed from real load records already in `data/db.json`; no new external services or dependencies were introduced.

## v2.3.7 — Admin/dispatcher chat, mobile floating Chat polish and Fuel Help

- Dispatchers can now see and communicate with active Admin accounts in Chat.
- Admins can see and communicate with active Dispatcher accounts.
- Admin–Dispatcher conversations use isolated direct staff threads with the same server-side access controls, notifications, attachments and voice calls.
- Mobile floating Chat now uses a fixed, always-visible header and composer; the Call and Close buttons remain accessible even with long conversations.
- Added Driver **Fuel Help** with live browser geolocation, preferred-chain filters, configurable radius, nearest-station sorting and one-tap navigation.
- Fuel results are retrieved server-side from OpenStreetMap/Overpass and include diesel/truck-friendly indicators when available.
- All previous v2.3.6 voice-call, attachment, notification and dedicated Driver–Dispatcher rules remain unchanged.

## v2.3.6 — Role-scoped WebRTC voice calls

- Added real browser-to-browser WebRTC audio calls inside the existing Chat module.
- Driver calls are limited to the assigned Dedicated dispatcher.
- Dispatcher calls are limited to assigned Driver accounts.
- Administrators can call either participant from supervised conversations.
- Added full-screen incoming-call controls on every app page with Answer and Decline.
- Added outgoing ringing, answered state, microphone mute, End Call and live/final duration.
- Each call is recorded once in Chat as Start calling, Answered, End Call, Missed, Declined or Cancelled with duration.
- Added account-scoped call signaling endpoints and participant-only authorization for offers, answers and ICE candidates.
- Added distinct Web Push voice-call notifications with persistent display, vibration and Answer/Decline actions.
- Added in-app ringtone and vibration for active sessions.
- Added configurable STUN/TURN servers and call timeout limits.
- Incoming notification records are updated after answer, decline, miss, cancel or call end.
- Initial seven accounts and their dedicated Dispatcher assignment are retained; all operational records, chats, calls, notifications and subscriptions are empty.
- Service Worker cache advanced to v6.

API verification covered dedicated Driver-to-Dispatcher access, unrelated-user blocking, administrator participant selection, offer/answer/ICE/end signaling, missed/declined status and Chat duration persistence.

## v2.3.5 — Dedicated dispatcher-driver Chat scope

- Added a required Dedicated dispatcher assignment to Driver user accounts.
- Driver Chat shows only the assigned Dispatcher.
- Dispatcher Chat shows only Driver accounts assigned to that Dispatcher.
- Admin Chat shows and can participate in all dispatcher-driver conversations.
- Broker Chat remains isolated to administrator support.
- Chat authorization is enforced on text send, attachment upload, read, read-all and data retrieval endpoints.
- Unauthorized manual API attempts return HTTP 403.
- Chat notifications are sent only to the actual counterpart account; Admin messages notify the assigned Driver and Dispatcher.
- Changing or disabling a Dispatcher with linked Drivers is blocked until reassignment.
- Legacy Chat keys are migrated to canonical account-thread keys when possible, while unknown legacy threads remain admin-only.
- The initial Driver account is assigned to Angel Ivanovski; all other operational collections remain empty.
- Service Worker cache bumped to v5.

API verification covered Driver-to-Dispatcher messaging, Dispatcher-to-Driver messaging, Admin supervision, unauthorized Dispatcher isolation, attachment upload authorization, required dispatcher selection and dispatcher reassignment protection.

## v2.3.3 - Role and account scoped notifications

- Exact account targeting now takes precedence over broad role targeting.
- Driver notifications are delivered only to the assigned driver account, not every driver account.
- Broker notifications are delivered only to the broker account linked to the load.
- Admin and dispatcher accounts no longer receive every notification automatically; they receive only notifications addressed to their role or account.
- Duplicate notifications with the same audience, content and related record are suppressed within a 30-second safety window.
- Push subscriptions are deduplicated by browser endpoint before delivery.
- A single assignment no longer produces both a status notification and an assignment notification.
- The user who performs an automated action is excluded from the role-wide notification created by that same action.
- Driver issue reports are routed to dispatchers only.
- Chat alerts from operations users are routed to the exact selected account.
- The Add Notification form now requires either a role or an exact account audience.
- Initial driver accounts remain available in assignment selectors even while the operational driver profile collection is empty.
- Service-worker cache was advanced so mobile devices receive the corrected notification code.

Automated API tests verified role isolation, exact-account isolation, duplicate suppression, single assignment alerts, driver self-notification suppression and exact chat targeting.

## Current Load

- Driver accounts open directly in the real mobile workspace.
- The introductory mobile preview screen is not shown to driver users.
- A notification shortcut with unread count is available in the driver header.
- A notification-selected load remains focused even when it is already delivered.

## Notification deep links

Phone push notifications and Notification Center items open the exact related destination:

- Load assignment/status/delay -> exact load (Current Load for drivers; Load Details for operations roles)
- Document/BOL/POD -> Documents with the exact document highlighted
- Chat message -> exact chat thread
- GPS/location -> GPS page
- ELD/HOS -> ELD/HOS report

The deep link is preserved through login and then removed from the address bar after it is applied.

## Clean production data

The included database retains only the seven user accounts and required company/system configuration. All operational collections and device subscriptions are empty.

## Required deployment configuration

Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to activate real phone push notifications. Deploy over HTTPS and use persistent storage for DATA_DIR and UPLOAD_DIR.

## v2.3.1 - Render build reliability
- Replaced `npm install` with deterministic `npm ci`.
- Disabled npm audit, funding, update-notifier and progress network checks during Docker builds.
- Added bounded npm retry/timeouts and noninteractive Debian package installation.
- Starts Node directly with `node server.js` to reduce startup indirection.

## v2.3.2 - Render deployment without npm registry
- Removed every `npm install` / `npm ci` command from the Docker build.
- Bundled the 17 required production packages under `vendor/node_modules`.
- Docker now verifies the bundled `web-push` module and JavaScript syntax without contacting npm.
- Kept Poppler and Tesseract support for scanned PDF/OCR intake.
- Added a `/health` check through `render.yaml`.


## v2.3.4 — Chat images and file attachments

- Added authenticated multipart upload endpoint at `/api/chat/upload`.
- Supports JPG, PNG, WEBP, GIF, PDF, DOC, DOCX, XLS, XLSX, CSV, TXT and RTF.
- Supports up to 10 files per message and a 15 MB limit per file by default.
- Images render directly inside the conversation.
- Documents render as file cards with open/download actions.
- Attachments work in both the full Chat page and floating/mobile Chat.
- Chat notifications remain account/role scoped and include the message or attachment summary.
- Existing text messages and legacy attachment fields remain backward-compatible.
- Service Worker shell cache bumped to v4 so mobile clients receive the updated Chat UI.


## v2.3.8
- Fixed mobile sidebar height and scrolling so Sign Out is always accessible.
- Added a dedicated scroll container for navigation with iOS momentum scrolling.
- Redesigned Driver action buttons and support controls for mobile touch use.
- Promoted Fuel Help to a prominent driver spotlight card.
- Made the Fuel Help modal and station results fully vertically scrollable on mobile.
- Updated service-worker cache to `jts-tms-shell-v8`.

## v2.3.9 - Driver Current Load and Confirmation Workflow

- Renamed the Driver workspace heading to **Current Load**.
- Removed pickup/delivery addresses from the top header; addresses are shown only inside Pickup and Delivery stops.
- Pickup and Delivery both show their own appointment date/time.
- Added per-load document status for BOL, POD and Load Confirmation: Missing, Uploaded, Accepted or Rejected.
- Driver upload action changes from Upload BOL to Upload POD only after BOL is approved.
- Added Download your PDF for dispatcher/admin-provided load confirmation.
- Missing confirmation can be requested by the driver; the dedicated dispatcher receives a direct notification that opens the upload workflow for that load.
- Added admin/dispatcher Load Confirmation generator with JTS logo, automatic PDF creation and immediate attachment to the selected driver/load.
- Admin sees all drivers in the confirmation dropdown; dispatcher sees only dedicated drivers.
- Driver Documents page is now Previous Loads and contains only dispatcher/admin-provided files from completed loads. Driver-uploaded BOL/POD files are hidden there.
- Chat and ELD/HOS were removed from the Driver sidebar; floating Chat remains available.
- New load assignment is blocked until the driver's existing load is terminal and both BOL and POD are approved.


## v2.3.10 — Current Load live document sync, foreground/background push and mobile PDF download

- Renamed the user-facing Driver Mobile module to Current Load.
- Added four-second authenticated live data synchronization while the application is open.
- Added immediate refresh when the service worker receives a push while an application window is open.
- Kept OS-level service-worker notifications active in foreground and background states.
- Added automatic persistent VAPID key generation in `DATA_DIR` when Render environment keys are not supplied.
- Driver document approval/rejection notifications now deep-link to Current Load.
- Added a protected document download endpoint with attachment headers.
- Download your PDF now fetches the protected file and starts a real phone download using the stored filename.
- Updated the PWA shell cache to v10.
