# JTS Apex Production UI

Final visual redesign focused on production-ready consistency and JTS logo colors.

## What changed

- Replaced the stacked visual theme layers with one final production UI layer.
- Added a unified JTS color system based on the logo: teal/aqua, graphite, charcoal and clean white surfaces.
- Added a professional desktop rail navigation.
- Added mobile bottom navigation for phones and tablets.
- Added light/dark theme support with persistent preference.
- Added a premium page title bar for internal modules.
- Improved login/register visual presentation.
- Improved cards, sections, panels, forms, inputs, buttons, modals and tables.
- Added mobile table-to-card behavior.
- Added quick-action floating panel on desktop.
- Improved spacing, typography, shadows, borders and responsive behavior.
- Kept business logic, API calls, authentication, data files and backend unchanged.

## Files added

- `public/assets/jts-apex-production-ui.css`
- `public/assets/jts-apex-production-ui.js`

The same files were also copied into the Android public asset bundles.

## Validation

- `node --check public/assets/jts-apex-production-ui.js` passed.
- `npm run check` passed.
- Missing `/assets/...` references in public HTML: 0.
- `npm ci` completed successfully.
- Server startup was tested after installing dependencies. It starts on port 4000. The app still requires a production `JWT_SECRET` in `.env`, as before.
