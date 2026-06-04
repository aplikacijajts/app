# JTS Logistics - Local Windows Start

This build does not require Socket.IO or web-push to start locally. Realtime and push are optional and can be enabled later on Render.

Recommended local commands:

```bash
node -v
npm install --no-package-lock
npm start
```

If npm was interrupted before, close all terminals and delete:

- node_modules
- package-lock.json

Then run:

```bash
npm cache clean --force
npm install --no-package-lock
npm start
```

Default local login:

- admin@jtslogistics.local
- admin123
