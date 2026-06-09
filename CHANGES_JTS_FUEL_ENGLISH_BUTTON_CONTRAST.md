# JTS Fuel English + Light Button Contrast Fix

Implemented final requested adjustments:

- Converted the Fuel tab/module fully to English in:
  - web `public`
  - Android bundle `android/app/src/main/assets/public`
  - secondary app bundle `app/src/main/assets/public`
- Updated navigation labels from `Гориво` to `Fuel` for all supported roles.
- Updated Fuel page title, headings, labels, buttons, status messages and map text to English.
- Added a final contrast patch so light-background buttons and outline/secondary buttons have dark readable text in light mode.
- Kept primary/JTS colored buttons white for correct contrast.
- Updated service worker cache name to force browsers/phones to refresh the latest CSS/JS.

Validation:

- `node --check public/assets/jts-apex-production-ui.js`
- `node --check public/assets/fuel.js`
- `node --check public/sw.js`
- `node --check` for all public asset JS files in web and Android bundles
- `npm run check`
