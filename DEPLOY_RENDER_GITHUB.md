# JTS Logistics - Render + GitHub Deployment

## 1. GitHub

Create a new repository and upload the contents of this `app-main` folder.

Recommended commands:

```bash
git init
git add .
git commit -m "Initial JTS Logistics production portal"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

## 2. Render

Create **New Web Service** and connect the GitHub repository.

Render settings:

```text
Environment: Node
Build Command: npm ci
Start Command: npm start
Node Version: 22
```

The included `render.yaml` already contains these settings.

## 3. Render Environment Variables

Required:

```text
NODE_ENV=production
PUBLIC_APP_URL=https://your-service-name.onrender.com
JWT_SECRET=use-a-long-random-secret
VAPID_SUBJECT=mailto:admin@jtslogistics.net
```

Optional:

```text
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMS_PROVIDER=
SMS_API_KEY=
```

## 4. First login

```text
Email: admin@jtslogistics.local
Password: admin123
```

Immediately create your real admin account or change this password, then remove or disable the default account.
