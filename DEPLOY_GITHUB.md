# Moon — GitHub Pages deployment

Moon is deployed as a static Next.js export on GitHub Pages and uses Supabase for Auth, PostgreSQL, Realtime and Storage.

## Deploy

Repository: `https://github.com/roblozgg-collab/moon-web`

From the project folder:

```bash
git add -A
git commit -m "Moon v0.11.3 cloud auth fix"
git push origin main
```

The workflow `.github/workflows/deploy-pages.yml` builds `out/` and deploys it to GitHub Pages automatically.

Production URL:

`https://roblozgg-collab.github.io/moon-web/`

## Supabase Auth required settings

- Authentication → Providers → Email → Confirm email: ON
- Authentication → SMTP Settings → custom SMTP configured
- Authentication → Email Templates → Confirm signup contains `{{ .Token }}`
- Authentication → Email Templates → Reset password contains `{{ .Token }}`
- Authentication → URL Configuration → Site URL: `https://roblozgg-collab.github.io/moon-web/`
- Redirect URL: `https://roblozgg-collab.github.io/moon-web/**`

## Security

Only the public/publishable Supabase key is used in the frontend. Never commit a service-role key or an `sb_secret_...` key.
