# UI / UX notes — v3.0.0

Design direction: "asphalt and signal". Cool asphalt neutrals, the JTS brand teal as the only action colour,
amber reserved for items needing attention, red for problems. The sidebar stays dark in both themes.
Typography: IBM Plex Sans (self-hosted, Latin + Cyrillic), tabular numerals in tables.
Signature element: the pickup → delivery route strip (hollow pickup node, solid delivery node) in load lanes.

Tokens live at the top of `public/css/styles.css`. Legacy component rules reference tokens only
(612 hard-coded colours were converted), so new themes only need token values.
Reduced-motion is respected; focus rings are visible on every interactive element.
