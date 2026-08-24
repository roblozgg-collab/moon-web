# Moon — Supabase production auth setup

Moon v0.11.3 is cloud-only. Browser-only account fallback has been disabled.

## Required Supabase settings

1. Authentication → Providers → Email
   - Email provider: ON
   - Allow new users to sign up: ON
   - Confirm email: ON

2. Authentication → Email Templates → Confirm signup
   - Keep `{{ .Token }}` in the HTML body.

3. Authentication → Email Templates → Reset password
   - Keep `{{ .Token }}` in the HTML body.

4. Authentication → SMTP Settings
   - Configure your custom Gmail/SMTP sender for public users.
   - Without custom SMTP, Supabase's built-in test mailer can be restricted to project team addresses.

5. Authentication → URL Configuration
   - Site URL: `https://roblozgg-collab.github.io/moon-web/`
   - Redirect URL: `https://roblozgg-collab.github.io/moon-web/**`

## Important

Only the publishable browser key belongs in the repository. Never commit a service_role key or an `sb_secret_...` key.
