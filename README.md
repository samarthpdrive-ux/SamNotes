# Samarth Study Vault — Vercel + TiDB

Private, reading-first notes library with three subjects, lessons, images, dark mode, PDF printing, and permanent TiDB storage.

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repository at Vercel.
3. Add these Environment Variables from `.env.example`:
   - `DATABASE_URL`
   - `VAULT_PASSWORD`
   - `AUTH_SECRET`
4. Deploy.

Use a TiDB Cloud Starter or Essential database and a normal database name such as `daily_notes_studio`—not `sys`. The database user needs permission to create/update the `daily_notes_drafts` table.

Never commit `.env`, passwords, or certificates.
