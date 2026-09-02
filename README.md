# JTS Logistics INC Dispatch/TMS

Premium original Dispatch/TMS web application branded for JTS Logistics INC.

This package is prepared with real login accounts supplied for production onboarding. It does not include demo loads, demo trucks, demo documents or demo operational records.

## Start

```bash
cd jts-logistics-tms
node server.js
```

Open:

```text
http://localhost:4000
```

The default port is **4000**. You can still override it with `PORT=xxxx node server.js`.

## Login accounts

All initial passwords are:

```text
123456
```

| Role | Name / Company | Email | Status |
|---|---|---|---|
| Admin | Peak Dispatch | peak@dispatch.com | Active |
| Dispatcher | Angel Ivanovski | angel@geljo.com | Active |
| Dispatcher | Darko Lazev | dare@matrix.com | Active |
| Driver | Aleksandar Vasilevski | ace@kalaj.com | Active |
| Broker | Global Freight Partners | broker@globalfreight.com | Active |
| Broker | Prime Line Brokers | broker@primeline.com | Active |
| Broker | NorthStar Brokerage | broker@northstarbrokerage.com | Active |

Recommended after first login: change all passwords from Admin Panel.

## Dedicated dispatcher-driver Chat in v2.3.5

Chat access is enforced by account relationship, not only by the visible interface:

- every Driver account must have one **Dedicated dispatcher** selected in Admin Panel > Users
- a Driver sees one conversation labeled with the name of that dedicated Dispatcher
- a Dispatcher sees and communicates only with Driver accounts assigned to that Dispatcher
- an Administrator sees and can participate in every dispatcher-driver conversation
- Broker accounts keep a separate administrator-support conversation
- unauthorized text messages and file/image uploads are rejected by the server with HTTP 403
- changing or disabling a Dispatcher is blocked until all linked Driver accounts are reassigned
- existing Chat attachments, previews, downloads, read status and push/deep-link behavior remain available

The included initial Driver account **Aleksandar Vasilevski** is assigned to **Angel Ivanovski**. This assignment can be changed from Admin Panel > Users > Edit.

## Chat and Driver additions in v2.3.8

- Dispatcher accounts can see active Admin accounts in Chat and communicate with them through isolated direct staff conversations.
- Admin accounts can see active Dispatcher accounts.
- Staff conversations support text, attachments, notifications and role-validated voice calls.
- The mobile floating Chat uses a full-height responsive layout with an always-visible Call button, Close button and message composer.
- Current Load includes **Fuel Help**. It requests the driver's current location, queries nearby OpenStreetMap fuel stations, supports example preferred-chain filters (Love's, Pilot/Flying J, TA/Petro, Speedway and others), sorts by distance and opens navigation.

## Secure voice calls in v2.3.6

The existing dedicated Chat relationship is also enforced for WebRTC audio calls:

- a Driver can call and receive calls only from the assigned Dedicated dispatcher
- a Dispatcher can call and receive calls only from Driver accounts assigned to that Dispatcher
- an Administrator can call either participant and supervise all authorized chat threads
- unauthorized users cannot read, answer, decline, end or send signaling data for another call
- an incoming call appears above every application screen with **Answer** and **Decline** actions
- the active call screen includes microphone mute, connection state, elapsed duration and **End Call**
- every call creates one Chat event with **Start calling**, **Answered**, **End Call**, missed/declined state and final duration
- the in-app incoming call uses a dedicated ringing tone and vibration pattern
- Web Push uses a distinct persistent voice-call notification with Answer and Decline actions when VAPID is configured

Voice calls require HTTPS and microphone permission. Render provides HTTPS. For reliable calls between mobile carrier networks, office networks and restrictive NAT/firewalls, configure a production TURN service; STUN-only calling cannot reach every network combination.

Recommended Render environment variables:

```env
RTC_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
RTC_TURN_URL=turn:your-turn-host:3478
RTC_TURN_USERNAME=your-turn-user
RTC_TURN_CREDENTIAL=your-turn-password
CALL_RING_TIMEOUT_MS=60000
CALL_MAX_DURATION_MS=28800000
```

For calls to appear while the PWA is backgrounded or closed, also configure the existing `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` variables.

## Notification routing in v2.3.3

Notifications are isolated by role and account:

- account-targeted alerts are visible only to that exact user
- driver load/document alerts are tied to the assigned driver account
- broker load alerts are tied to the broker account on the load
- dispatcher operational alerts are visible only to dispatcher accounts
- administrator alerts are visible only to administrator accounts
- repeated identical alerts are automatically deduplicated
- one load assignment creates one assignment alert instead of a second status-change alert
- users do not receive automated role alerts for actions they performed themselves

The manual **Add notification** form requires a selected role or exact account. The seven initial accounts remain available, while all loads, driver profiles, fleet records, brokers, documents, chats, notifications, GPS/HOS data, audit records and push subscriptions start empty.

## New production features


### PDF rate-confirmation extraction fix

This release adds a built-in PDF text extractor for text-based PDFs that use embedded CID fonts and ToUnicode maps. That fixes the issue where PDF internals such as `ProcSet`, `cSet` or random short strings could be picked as load values when Poppler/`pdftotext` was not installed. The Doc Intake module now extracts Arrive Order / Ref, pickup and delivery address blocks, earliest/latest appointment windows, PO, BOL, shipment ID, customer reference, rate, miles, commodity, weight, equipment, carrier, and Unit/Truck number from the filename when the truck field is blank in the PDF.

Poppler is now optional, but still recommended on Linux servers for maximum PDF coverage:

```bash
sudo apt-get update
sudo apt-get install -y poppler-utils
```

If `pdftotext` is not available, the app uses the built-in CID-font PDF extractor instead of reading raw PDF internals.

## Current release highlights

- Runs on **port 4000** by default.
- Extracts pickup and delivery dates, earliest/latest appointment times, time windows and schedule notes from dispatch / ITS-style documents.
- Extracts PO, secondary PO / stop ref, BOL, shipment ID, customer reference, commodity, weight, equipment, pickup reference and delivery reference numbers when present.
- Detects live GPS / tracking links from iframe `src`, full iframe HTML, map links and common GPS/tracking URLs.
- Displays the live GPS iframe in a dedicated GPS / Location page and keeps per-load GPS buttons available from loads, dispatch board and driver mobile view.

### Dispatcher document intake / auto-fill

A dedicated **Doc Intake** module is included for admin and dispatcher users.

Dispatchers can drag and drop documents into the app. The system will:

- save the original file under `uploads/`
- create a document record in Documents / BOL / POD
- extract readable load data from text-based PDFs, TXT, CSV, RTF and HTML files
- detect common dispatch / ITS-style fields such as load number, broker/customer, pickup, delivery, pickup date, delivery date, appointment hours/time windows, pickup/delivery reference numbers, rate, miles, driver, truck, trailer and live GPS/tracking links
- automatically create or update the matching load record
- mark low-confidence imports as **Needs review** so the dispatcher can check before dispatching

Image/scanned PDFs are supported when the server has Poppler + Tesseract installed. On Render, use the included Docker deployment so those OS-level OCR packages are installed in the service image.

### ITS / Dispatch import

The app includes an **Import ITS/Dispatch export** action in Loads, Documents and Settings. Admin/dispatcher users can upload CSV, JSON or TXT/TSV exports from dispatch systems. The importer supports common headers such as Load ID, Status, Broker, Pickup, Delivery, Pickup Date, Pickup Time, Pickup Window, Delivery Date, Delivery Time, Delivery Window, Rate, Miles, Driver, Truck, Trailer, Reference, Commodity, Weight, Equipment, GPS URL and GPS iframe URL.

Imported rows automatically create or update loads, create missing broker/customer profiles, preserve pickup/delivery appointment hours, and save GPS links on the load and company settings.

### Live GPS iframe

The GPS / Location page now supports a real live GPS iframe/link. You can paste the full iframe code, iframe `src`, or provider tracking link in Settings. Doc Intake and ITS/Dispatch Import can also detect iframe `src` or tracking/map links from uploaded documents and exports. When detected, the app stores the link in company settings and displays it in Dashboard and GPS / Location, while load-specific GPS links appear in load details, GPS actions and driver navigation. If a provider blocks iframe embedding, the **Open live GPS** button still opens the live tracking page in a new tab.

## Data already included

- 7 active user accounts
- No driver profile records
- No broker/customer records
- No loads
- No trucks/trailers
- No documents
- No chat messages
- No notifications, GPS/HOS history, audit history or push subscriptions

## Production security included

- Passwords are stored as PBKDF2 hashes, not as plain text.
- API routes require a valid login session.
- Admin-only protection for user management, company settings and JSON import/export.
- Dispatcher/admin protection for operational exports, load operations and document intake.
- Basic role-based data filtering for driver and broker accounts.
- File upload storage under `uploads/`.
- JSON database under `data/db.json`.
- Security headers for served content.

## Data storage

- Main database: `data/db.json`
- Uploaded documents: `uploads/`
- Backup export: Settings > Download JSON backup
- CSV exports: available from module export buttons

## Included modules

- Login
- Dashboard with ITS-Dispatch-style gauges (Open Loads, Net Margin %) and line charts (Load Volume, Gross Revenue, Truck Miles)
- Dispatcher workspace
- Document Intake / Auto-fill
- Loads management (with Gross/Cut/Net Profit financial breakdown per load)
- Current Load mobile interface
- Admin panel
- Trucks / trailers
- Drivers management (with Driver payout & mileage report: Gross, Cut, Miles, Empty Miles, Revenue/Mile)
- Brokers / customers (with Customer profit report: Gross, Cut, Net Profit, Open/Delivered/Completed loads)
- Dispatchers payout performance report (administrator only)
- Documents / BOL / POD with file upload
- Chat
- Notifications
- GPS shortcuts with live iframe support and load-specific tracking links
- ELD / HOS report page
- Reports
- Settings and data import/export (including company-wide Default dispatch cut %)

## Next real data to add

Before going live with daily operations, add:

1. Trucks and trailers with unit numbers and expiration dates
2. Real broker/customer contact details if the generated broker accounts should be replaced
3. Active loads or upload rate confirmations through Doc Intake / ITS Dispatch Import
4. BOL/POD/rate confirmation documents
5. Real GPS iframe/provider link and ELD provider settings, if needed

## Important production note

This version is ready for a controlled real pilot/internal production use. For public internet use, run it behind HTTPS with a real domain, server backups, and preferably a production database such as PostgreSQL, MySQL or MongoDB.


## OCR-assisted scanned PDF intake

The Doc Intake module supports both text-based PDFs and scanned/image PDFs. For text PDFs, the app uses built-in extraction and Poppler `pdftotext` when available. For scanned PDFs such as Axle/McLeod rate confirmations, the app automatically falls back to OCR when `pdftoppm` and `tesseract` are installed on the server.

Recommended Linux production packages:

```bash
sudo apt-get update
sudo apt-get install -y poppler-utils tesseract-ocr
```

Optional environment variables:

```bash
PORT=4000
OCR_MAX_PAGES=5
OCR_DPI=200
OCR_LANG=eng
```

Check server readiness at:

```text
http://localhost:4000/health
```

`pdfExtraction.ocr` should be `true` for scanned PDF auto-fill. If OCR tools are missing, the upload is still saved safely, but scanned image PDFs cannot be reliably auto-filled.

## Final production note for Axle / McLeod scanned PDFs

The uploaded file `Unit 845 Ref. 3330448 (1).pdf` is an image/scanned PDF. It does not contain normal selectable PDF text, so the app must use OCR to read pickup, delivery, rate, miles, commodity and appointment hours.

This release includes:

- OCR fallback for scanned/image PDFs when server tools are installed
- Axle Logistics / McLeod-style parser
- protection against creating bad loads from only filename data
- clear Doc Intake warning when OCR is missing
- `/health` PDF extraction diagnostics
- helper setup scripts under `scripts/`

### Linux/VPS OCR setup

```bash
cd jts-logistics-tms
bash scripts/install-ocr-linux.sh
node server.js
```

### Windows OCR setup

Open PowerShell as Administrator:

```powershell
cd jts-logistics-tms
powershell -ExecutionPolicy Bypass -File scripts\install-ocr-windows.ps1
```

Close and reopen Command Prompt/PowerShell, then start:

```bash
node server.js
```

Check OCR readiness:

```bash
npm run check:ocr
```

or open:

```text
http://localhost:4000/health
```

For scanned PDF auto-fill, `pdfExtraction.ocr` must be `true`.

### Tested intake examples

With OCR ready, the Axle Logistics file `Unit 845 Ref. 3330448 (1).pdf` is parsed as:

- Load: `3330448`
- Broker: `Axle Logistics, LLC`
- Pickup: `Haines Jones & Cadbury, 22 Old Shoals Road, ARDEN NC 28704`
- Delivery: `Pilot Travel Center, 4075 Jones Branch Road, JACKSONVILLE FL 32219`
- Pickup window: `06/01/2026 08:00 - 06/01/2026 15:00`
- Delivery window: `06/02/2026 08:00 - 06/02/2026 12:00`
- Rate: `$1,550.00`
- Miles: `434`
- Commodity: `Building Materials`
- Weight: `11000.0 lb`
- Equipment: `Van (DAT)`
- Truck / Unit: `845`

If OCR is not installed, the app will not create a bad/partial load from filename-only data. It will save the document and show a clear OCR-required review message.


## Production update v2.0

This build adds production communication and operations controls:

- Role-aware notifications with unread counters on desktop and mobile.
- Notification Center with unread styling, click-to-read, and Mark all as read.
- Floating chat button with unread badge, open/close panel, full chat page, read state, and role-aware visibility.
- Browser GPS for drivers through the Current Load screen. Drivers can send one location or start/stop live GPS sharing.
- GPS / Location page now shows broker iframe GPS when available, otherwise browser GPS last-known driver location and Google Maps shortcuts.
- ELD/HOS page now calculates 11-hour drive, 14-hour shift, 70-hour cycle, break risk, ETA, on-time / risky / late / HOS risk for active loads.
- New server APIs: `/api/notifications/read-all`, `/api/notifications/:id/read`, `/api/chat/read`, `/api/chat/read-all`, `/api/location/update`, `/api/hos/update`.

For real production GPS, deploy the app on HTTPS. Browser geolocation normally works on localhost for testing, but mobile users need HTTPS when using a real domain.

For real ELD/HOS compliance, connect a provider API such as Motive, Samsara or Geotab. Until then, the app uses manually entered HOS values from the driver profile / ELD page to calculate route risk.

## Mobile install prompt + notification permission flow

This build includes a PWA manifest and service worker. When opened from a mobile browser, the app detects iOS/Android and shows a JTS install guide:

- iOS: Share -> Add to Home Screen
- Android: Chrome menu -> Install app / Add to Home screen

After the app is installed/opened in standalone mode, it asks the user to enable browser notifications. If the user allows notifications, the prompt is permanently hidden. If the user denies notifications, the browser cannot show the native permission popup again automatically, so the app stores the denial and reminds the user every 10 standalone launches with instructions to enable notifications from browser/site settings.

The install prompt state is stored in browser localStorage per device/user browser.

For real server-side push notifications, connect a Web Push/VAPID provider or a mobile push service in the Node.js server and use the included service worker push event as the client-side receiver.

## Production security update v2.1 - Role Based Access

This build adds the final production permission layer requested for launch:

- Full role-based frontend navigation and backend API protection.
- Backend returns `403 Forbidden` when a role tries to create/update/delete data outside its permission scope.
- Broker users only see loads, documents, notes and activity connected to their own broker/customer account.
- Driver users only see assigned loads, assigned documents, their own GPS/HOS data and load activity.
- Dispatchers can manage operations but do not receive admin-only audit/user/system export privileges.
- Admin users have full access to users, settings, audit log, backup/export and system data.
- New and reset-password users must change their temporary password at first login.
- Load activity timeline is created automatically for load creation, status changes, assignment changes, document uploads and document approvals/rejections.
- Documents support approve/reject workflow, including rejection reason, approval/rejection user and timestamp.
- Loads now support separate `internalNotes` and `brokerNotes`. Internal notes are hidden from driver and broker roles.
- Admin backup/export button remains available for complete JSON backups.

Default seeded accounts still use the temporary password `123456`, but every user will be forced to choose a new password on first login.

## Final production additions in this build

### Company profile

The included company profile is pre-filled as:

- JTS Logistics Inc
- 2138 W 47th Avenue Gary IN 46408
- MC-1574089
- DOT-4117506
- Midwest logistics / 100% Owner Operator company profile

You can edit this later from **Settings > Company profile**.

### Mobile install gate

On iOS and Android browsers, the app now shows an immediate installation popup. The popup does not include a close/later button. Users must install the app to the Home Screen and then open it from the installed app icon. When opened as an installed PWA/standalone app, the install message disappears and the notification permission flow appears.

### Push notifications

Browser push notifications are supported through Web Push / VAPID.

Generate keys locally after installing dependencies:

```bash
npm install
npm run generate:vapid
```

Add the generated values to Render Environment Variables:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:dispatch@jtslogistics.com
```

Then redeploy on Render. Check status at:

```text
/health
```

The response should show:

```json
"pushNotifications": {
  "configured": true,
  "publicKeyPresent": true,
  "privateKeyPresent": true
}
```

When users allow notifications in the installed app, the browser subscription is saved in `db.json`. New operational notifications can then be delivered as push notifications to the correct role/user audience.

### Render Docker deployment

The application requires Docker on Render for scanned-PDF OCR because Poppler and Tesseract are OS-level packages. Render's native Node.js runtime does not provide these packages as part of the Node runtime; the included `Dockerfile` installs them. If an existing Render service is currently showing `Running 'node server.js'` and the log says `scanned OCR=not installed`, that service is using the native Node runtime rather than this Docker configuration. Change the service runtime to **Docker**, set the Dockerfile path to `./Dockerfile`, and deploy the repository again. The Blueprint file `render.yaml` already declares `runtime: docker`.


A `Dockerfile` is included. For Render production, use Docker runtime so Poppler and Tesseract are installed inside the Render container.

Recommended Render variables:

```env
NODE_ENV=production
DATA_DIR=/app/persistent/data
UPLOAD_DIR=/app/persistent/uploads
DB_FILE=/app/persistent/data/db.json
MAX_UPLOAD_BYTES=52428800
SESSION_TTL_MS=43200000
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:dispatch@jtslogistics.com
```

Use a Render Persistent Disk mounted at:

```text
/app/persistent
```


## RTS Financial MC check

The load form includes a **Broker MC number** field and a **Check MC with RTS Financial** action for Admin and Dispatcher users.

Configure credentials only in Render Environment Variables, never in frontend code:

```env
RTS_USERNAME=your_rts_login_email
RTS_PASSWORD=your_rts_password
RTS_LOGIN_URL=https://beta.rtspro.com/
```

If RTS provides an official API endpoint, add:

```env
RTS_API_URL=https://...
RTS_API_KEY=...
```

Without an official RTS API endpoint, the application records a manual RTS review status and links the user to RTS Pro. This avoids brittle screen scraping and keeps RTS credentials server-side only.

## Version 2.3 production driver notification flow

- Phone push notifications and the in-app Notification Center now deep-link to the exact load, document, chat thread, GPS page, or ELD/HOS report.
- Driver users open directly in the production mobile workspace; the introductory mobile preview screen is not shown to drivers.
- The supplied database contains the existing user accounts only. Operational records, documents, chats, notifications, locations, HOS logs, audit history, push subscriptions, drivers, brokers, fleet, and loads are empty.
- Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the production environment to activate phone push notifications. HTTPS and an installed PWA/service worker are required by mobile browsers.
- Use persistent storage for `DATA_DIR` and `UPLOAD_DIR` so data and uploaded documents survive deployments/restarts.

## Render deployment - v2.3.2

Render deployment uses the included Dockerfile. Render builds the image directly from the repository, installs the required Node.js dependencies with `npm ci`, and installs Poppler + Tesseract inside the image. Do not configure a separate native Node.js Build Command/Start Command when using the Docker runtime.

After replacing an older release, choose **Manual Deploy > Clear build cache & deploy** so Render does not reuse the previous Docker layer.


## Chat attachments

The Chat module supports inline image previews and downloadable file attachments. Allowed formats are JPG, JPEG, PNG, WEBP, GIF, PDF, DOC, DOCX, XLS, XLSX, CSV, TXT and RTF. Default limits are 15 MB per file and 10 files per message, configurable with `MAX_CHAT_UPLOAD_BYTES` and `MAX_CHAT_UPLOAD_FILES`.

For production persistence on Render, mount persistent storage and set `UPLOAD_DIR` to that mounted path; otherwise uploaded chat files follow the same filesystem persistence behavior as existing document uploads.


## v2.3.8 mobile UX update
- Mobile sidebar navigation now scrolls independently while the account and Sign Out footer remain reachable.
- Driver action buttons use a clearer touch-friendly card layout.
- Fuel Help is promoted as the primary driver assistance action.
- Fuel Help uses a full-height scrollable mobile dialog with a fixed header.

### Driver document workflow (v2.3.9)

The Current Load page uses a live document workflow. BOL must be uploaded and approved before the Driver action changes to Upload POD. A load is considered fully confirmed only when it is Delivered/Completed/Closed and both BOL and POD are approved. Until then, the server blocks assigning another load to the same driver.

Dispatchers and admins can generate a JTS-branded Load Confirmation PDF from Documents -> Create Confirmation. Admin users can select any active driver; dispatcher users can select only drivers dedicated to their account. Drivers download that PDF from Current Load or request it from their dedicated dispatcher when it is missing.


## v2.3.10 Current Load live updates and mobile PDF download

- The former **Driver Mobile** menu/page is named **Current Load**.
- While a driver is signed in, load/document data is synchronized every four seconds and immediately after a foreground push message, so BOL/POD acceptance updates without manual refresh.
- The service worker always creates the operating-system push notification and also informs an open app window to refresh its data.
- Confirmation PDFs are downloaded through an authenticated endpoint with `Content-Disposition: attachment`, and the mobile client saves the returned PDF using the original filename.
- Web Push automatically generates and persists a VAPID key pair in `DATA_DIR` when environment keys are not provided. Render environment keys can still be supplied as explicit overrides.
