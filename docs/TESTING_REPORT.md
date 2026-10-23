# JTS Logistics TMS v3.0.0 — Testing Report

Environment: Linux, Node.js 22.22, Chromium 141 (Playwright, headless), Poppler + Tesseract installed.
Docker and Render were **not** available in the test environment.

All automated tests run against a throw-away data directory created by `tests/helpers.js`; they never read or
write the real `data/db.json` or `uploads/`.

## 1. Automated API tests — `npm test`

Result: **31 / 31 passed** (final run, v3.0.2): 11 API, 12 security, 4 push delivery, 4 service-worker tests.

| # | Suite | What is verified | v2.6.2 | v3.0.0 |
|---|---|---|---|---|
| 1 | api | Health, static shell, manifest MIME, SPA fallback | pass | pass |
| 2 | api | Bootstrap public; protected routes 401; bad login 401; second setup 409 | pass | pass |
| 3 | api | Forced password change (403 `PASSWORD_CHANGE_REQUIRED`), min length, logout invalidates token | pass | pass |
| 4 | api | Only admin manages users/company; driver needs dispatcher; duplicate email 409; no password hashes in responses | pass | pass |
| 5 | api | Load create/read/assign/status; driver & broker visibility; financial and contact redaction; one-active-load rule; activity log | pass | pass |
| 6 | api | Document upload, approve permission, download/preview isolation, admin-only delete | pass | pass |
| 7 | api | Text rate-confirmation intake extracts the rate (dispatcher only) | pass | pass |
| 8 | api | Chat dedicated-dispatcher scope, UTF-8 round trip, broker → Administration only | pass | pass |
| 9 | api | Notification audience required, account targeting, read state | pass | pass |
| 10 | api | CSV export for staff; full backup admin-only | pass | pass |
| 11 | api | Unknown route 404; delete admin-only | pass | pass |
| 12–23 | security | SEC-1…SEC-12 from `docs/AUDIT_REPORT.md` (uploads auth & authorization, active-content refusal, no orphan files, inline-HTML prevention, login throttling, error leakage, hash injection, headers, corrupt-DB recovery, dispatcher scope, spoofed signatures) | **fail (10/10 checked)** | pass |

Tests 1–11 were first run against the untouched v2.6.2 code to establish the baseline (11/11 passed), then against
v3.0.0 to prove the existing API contract is preserved.

### Push and call ringing (v3.0.2)
| Test | Verifies |
|---|---|
| PUSH-1 | `/api/push/test` reports a device that is not registered (404) |
| PUSH-2 | Pushes reach the push service with `Urgency: high` |
| PUSH-3 | Incoming call push to the callee: high urgency, TTL ≤ ring timeout, topic; ending the call sends a replacement push on the same topic |
| PUSH-4 | 410 Gone subscriptions are removed, so the device must re-register |
| SW-1 | Ringing call re-alerts repeatedly with Answer/Decline and vibration |
| SW-2 | A call-status push stops ringing and replaces the notification |
| SW-3 | Swiping the notification away stops ringing |
| SW-4 | Ordinary notifications show once |

Real-device behaviour (sound, vibration and lock-screen presentation on Android/iOS) could not be tested here.

## 2. Smoke test with the supplied production database
A copy of the supplied `data/db.json` was served by v3.0.0: bootstrap reported the existing admin account, the
shell, vendored Leaflet and fonts loaded, anonymous `/uploads/*` returned 401, a wrong password returned 401, and
CSP / Permissions-Policy headers were present. The copy was byte-identical afterwards.
`data/db.json` in the ZIP: SHA-256 `21f9ea9147698a890a0eff4d50d22b4bfa55088eaeeeea228718548246576c67` (same as supplied).

## 3. Browser checks (headless Chromium)
Seeded fixture data: admin, two dispatchers, two drivers, two brokers, four loads, two fleet units, chat messages.

Pages and viewports checked for console errors, CSP violations and horizontal overflow (screens reviewed visually):

| Role | Pages | Viewports |
|---|---|---|
| Admin | dashboard, loads, GPS (Leaflet map), settings, admin, reports, dispatchers, ELD | 1920×1080, 1440×900, 1366×768, 1024×768, 390×844, 360×800 |
| Dispatcher | dispatch, loads, intake, documents, drivers, fleet, brokers, chat, notifications | 1440×900, 1366×768, 768×1024, 390×844, 360×800 |
| Driver | current load, documents, driver location, fuel, chat | 430×932, 390×844 |
| Broker | dashboard, loads, documents | 1366×768, 390×844 |

Interactive states checked: desktop rail collapse (persisted), mobile drawer open, command palette search
("dallas" → matching load), new-load dialog on mobile (bottom sheet), load editor dialog in dark mode,
light / dark / system theme.

Result: **0 console errors and 0 CSP violations** on every checked page.
Known cosmetic item: at 360 px the Drivers-page profile card clips its Edit button.
Two views (360-px Drivers, 1024-px Loads) report a document `scrollWidth` larger than the viewport; `overflow-x: clip`
on `body` prevents sideways scrolling.

## 4. Not tested (environment limits) — verify before production
- WebRTC voice calls between two real devices, including TURN on mobile networks.
- Web Push delivery to Android and iOS devices; PWA installation on real devices.
- OCR of scanned PDFs inside the Docker image (Tesseract was present locally, but no scanned sample was run in v3.0.0).
- Real GPS permission prompts and background location on devices.
- Docker build and Render deploy (`docker` not available). `npm run check` (the Dockerfile's build-time check) passes.
- Screen-reader walkthrough (keyboard focus order and focus trapping were exercised in the browser only).
- `npm audit` (registry audit endpoint unavailable).
