# Production Checklist

- Set a strong JWT_SECRET in .env.
- Generate VAPID keys with: npx web-push generate-vapid-keys
- Configure SMTP if email notifications are required.
- Configure SMS provider if SMS notifications are required.
- Replace demo logo/icons with final company branding.
- Put the app behind HTTPS before public use.
- Change the default admin password immediately after first login.
