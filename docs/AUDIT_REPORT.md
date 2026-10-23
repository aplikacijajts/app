# JTS Logistics TMS — Audit Report (v2.6.2 → v3.0.0)

Scope: the complete v2.6.2 project as supplied (`server.js` 5,726 lines, `public/js/app.js` 5,637 lines,
`public/css/styles.css` 3,404 lines, JSON storage, Docker/Render deployment). The original project was kept
untouched for comparison; every finding below was reproduced with an automated test or a headless-browser check
before it was fixed.

## 1. Architecture (unchanged in v3.0.0)

| Layer | Implementation |
|---|---|
| Server | Node `http` module, single `server.js`, no framework. Only runtime dependency: `web-push`. |
| Storage | `data/db.json` (atomic tmp-file + rename writes), uploads under `uploads/YYYY-MM/`. |
| Auth | PBKDF2-SHA256 (120k iterations) password hashes, random 256-bit in-memory session tokens (12 h), Bearer header. |
| Roles | `admin`, `dispatcher`, `driver`, `broker` — enforced server-side in `visibleCollection`, `canPostCollection`, `canPatchRecord`, `canDeleteRecord`, chat directory and call signaling. |
| Frontend | Vanilla JS SPA, string templates, `data-action` delegation, 15 s live-data polling. |
| Realtime | WebRTC audio (signaling via REST polling), Web Push with VAPID. |
| Intake | Built-in PDF text extractor, Poppler `pdftotext`, Tesseract OCR fallback, DOCX/XLSX zip text, CSV/TXT/HTML. |
| Deploy | Dockerfile (node:20-slim + poppler + tesseract), `render.yaml` with persistent disk at `/app/persistent`. |

## 2. Feature inventory

| Feature | Frontend page | Main endpoints | Roles | Status in v2.6.2 | v3.0.0 |
|---|---|---|---|---|---|
| Sign-in / first-run setup | login screen | `/api/login`, `/api/setup`, `/api/logout`, `/api/change-password` | all | Works; no throttling | Throttling, session cookie for files |
| Dashboard analytics | `dashboard` | `/api/data` | admin, dispatcher, broker | Gauges drawn as right half-circle, value clipped | Fixed |
| Dispatch board | `dispatch` | `/api/loads` | admin, dispatcher | Dispatchers could not see unassigned loads (incl. their own new loads) | Fixed (P0) |
| Loads | `loads` | `/api/loads[/id]` | all (scoped) | "Advanced filters" dialog applied nothing but reported success | Real filters, sort, pagination |
| Load editor / details | modal | `/api/loads/:id` | staff | Double-click could create duplicates | Save button locks while working |
| Doc intake / auto-fill | `intake` | `/api/intake`, `/api/import-dispatch` | admin, dispatcher | Works | Unchanged logic; stored HTML now served as download only |
| Documents / BOL / POD | `documents` | `/api/upload`, `/api/docs/:id/preview|download` | all (scoped) | Any file type accepted; files publicly readable | Allow-list + signature check, authorized file serving |
| Driver workspace | `driver-mobile` | loads, docs, reminders, location | driver | Panel offset by the topbar height twice | Fixed |
| Drivers / fleet / brokers | `drivers`, `fleet`, `brokers` | generic CRUD | staff | Dispatcher-created trucks without a driver vanished | Fixed |
| Chat + attachments | `chat`, floating chat | `/api/chat*` | scoped by assignment | Works | Restyled; dark-mode contrast |
| WebRTC voice calls | overlay | `/api/calls/*` | scoped | Works (emoji icons) | SVG icons; logic unchanged |
| Notifications + Web Push | `notifications`, `sw.js` | `/api/notifications/*`, `/api/push/*` | all | Works | Unchanged |
| GPS / live map | `gps` | `/api/location/*`, `/api/ops/eta` | scoped | Leaflet loaded from unpkg without integrity | Self-hosted Leaflet |
| Fuel help | `fuel` | `/api/fuel/nearby` | driver, staff | Works | Unchanged |
| ELD / HOS, reminders, pay adjustments | `eld`, driver docs | generic CRUD | scoped | Works | Unchanged |
| Reports / dispatchers payout | `reports`, `dispatchers` | `/api/data` | admin (dispatcher reports) | Works | Unchanged |
| Admin users / settings / backup | `admin`, `settings` | `/api/users`, `/api/company`, `/api/import`, `/api/export` | admin | Admin PATCH accepted `passwordHash`; import had no pre-snapshot | Fixed |
| Global search (Ctrl+K) | modal | — | all | Input did nothing; static sample list | Real command palette |
| PWA install | install card | manifest, `sw.js` | mobile | Non-dismissible screen blocked every mobile browser | Optional, dismissible |

## 3. Security findings

| ID | Severity | Finding (v2.6.2) | Fix (v3.0.0) |
|---|---|---|---|
| SEC-1 | Critical | `/uploads/*` served with no authentication (CDL, medical, BOL, chat files). | Requires a session (HttpOnly `jts_session` cookie scoped to `/uploads`, or Bearer). |
| SEC-2 | Critical | Any signed-in user could read any upload whose URL they knew. | `uploadUrlVisibleToUser` maps the file to its document / chat message / reminder and applies the same visibility rules as the API. |
| SEC-3 | Critical | `/api/upload` accepted any type; an uploaded `.html` executed in the app origin and could steal tokens from `localStorage`. | Extension allow-list + file-signature check; active types refused. |
| SEC-5 | High | Intake-stored HTML was rendered inline. | `.html/.svg/.xml/.js/.json` and unknown types always served as `application/octet-stream` + `attachment`; non-PDF uploads get `CSP: sandbox`. |
| SEC-4 | Medium | Upload saved to disk before the permission check (orphan files / disk fill). | Validate and authorize first. |
| SEC-6 | Medium | No sign-in throttling. | 8 failures / account+address / 15 min → HTTP 429 with `Retry-After`. |
| SEC-7 | Medium | Raw exception messages returned to clients. | Generic 500 message (logged server-side); 400 for bad JSON; 413 for oversized bodies. |
| SEC-8 | Medium | Admin user update merged any body field, including `passwordHash`. | Credential/system fields stripped. |
| SEC-9 | Medium | No CSP / Permissions-Policy / HSTS. | Strict CSP (`script-src 'self'`), Permissions-Policy (geolocation, microphone, camera = self), COOP, HSTS when `NODE_ENV=production`. |
| SEC-10 | High (data loss) | Unparseable `db.json` was silently replaced with an empty database. | Rolling `db.json.bak`; corrupt file preserved as `db.json.corrupt-<ts>`; automatic restore from backup. |
| SEC-11 | Medium | Dispatcher could PATCH loads outside their scope by id. | PATCH uses the same scope as reads. |
| SEC-12 | Low | Third-party script (unpkg) without SRI. | Leaflet + markercluster vendored under `public/vendor/leaflet`. |
| SEC-13 | Medium | `data/vapid-keys.json` (push private key) present in the project and not git-ignored. | Excluded from the delivered ZIP and `.gitignore`d; see "Configuration" below. |

### Unresolved / accepted risks (documented, not fixed)
- Sessions live in memory: a restart or redeploy signs everyone out, and multiple instances cannot share sessions.
- The Bearer token is still stored in `localStorage` (required by the existing architecture). The CSP and the
  upload fixes remove the known XSS vectors, but a future XSS bug would still expose the token.
- `style-src 'unsafe-inline'` is required by the existing templates; `frame-src https:` is required for
  administrator-configured GPS provider iframes.
- Chat attachment URLs supplied in a message body are accepted if they point at `/uploads/...`; a user who already
  knows another file's random URL could reference it in their own thread. URLs contain a timestamp plus 32 random bits.
- `npm audit` was not run (no audit endpoint in the build environment). `web-push@3.6.7` is the only dependency.
- Admin JSON import replaces the whole database by design (now snapshotted first).

## 4. Functional bugs fixed
1. Dispatchers could not see unassigned loads, so they could not assign loads they had just created.
2. Global search was non-functional (static sample list).
3. "Advanced filters" applied nothing yet showed "Apply filters completed".
4. Modal save could be triggered repeatedly (duplicate records); focus was not managed.
5. Dashboard gauges drew a right-hand half circle and clipped the value.
6. Mobile browsers were blocked behind a mandatory install screen.
7. Driver workspace was positioned 60 px too low (a page animation left a transform that became the
   containing block for the fixed driver panel).
8. Raw ISO timestamps (`2026-10-24T08:00`) displayed in tables.
9. The sidebar always said "Operations online" regardless of connectivity.
10. A second legacy `:root` block re-declared theme colours late in the stylesheet (blocked theming).
11. Mobile tables kept a desktop minimum width, pushing values off-screen in card mode.

## 5. Encoding
All source files, `db.json` and docs were scanned for mojibake (`Ã`, `â€`, `âœ`, `Â`, U+FFFD). None was found.
Legitimate non-ASCII characters (·, —, →, …) were left intact. Emoji that were used as interface icons
(phone, mic, fuel pump, bell, install) were replaced with SVG icons; IBM Plex Sans includes Cyrillic for Macedonian text.

## 6. Data and migration
No schema migration was needed. No existing field changed meaning. `data/db.json` in the ZIP is byte-identical to the
supplied file (SHA-256 recorded in `docs/TESTING_REPORT.md`). New files the server may create at runtime:
`db.json.bak`, `db.json.corrupt-*`, `db.json.pre-import-*` (all git-ignored).
