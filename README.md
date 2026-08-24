# Moon Web v0.11.3 — GitHub Pages + Supabase

Moon is configured so GitHub Pages hosts only the static web client while Supabase provides Auth, PostgreSQL, Storage and Realtime. No Vercel or always-on PC is required.

## First Supabase setup
1. Open Supabase → SQL Editor.
2. Run `supabase/schema.sql` once.
3. In Authentication settings, add your final GitHub Pages URL to allowed redirect URLs.

## GitHub Pages deployment
Read `GITHUB_PAGES_GUIDE.md`. The repository already contains `.github/workflows/deploy-pages.yml`. Every push to `main` rebuilds and publishes Moon automatically.

## Development
Copy `.env.example` to `.env.local` and fill the two Supabase public values, then:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Architecture
- GitHub Pages: static Moon frontend
- Supabase Auth: accounts
- Supabase PostgreSQL: persistent data
- Supabase Storage: avatars, banners and attachments
- Supabase Realtime: chat/presence/signaling
- WebRTC: calls/media

GitHub Pages cannot execute Next.js server API routes. This build therefore removes the old local `/api/local-*` backend and relies on Supabase cloud mode.
