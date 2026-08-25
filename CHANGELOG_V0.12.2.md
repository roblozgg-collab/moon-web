# Moon v0.12.2

Fix pack for routing, server voice UI/session handling and admin schema.

- Fixed DM navigation on GitHub Pages: Moon now owns `/im/:id`, `/server/:id/:channelId`, `/settings/...` history without triggering Next.js to resolve non-exported dynamic routes.
- Added a GitHub Pages 404 redirect bridge so a hard refresh/direct link restores the intended Moon route after loading the exported root page.
- Preserves the current Moon route per browser tab and reapplies it after tab visibility/pageshow changes.
- Fixed Plus badge navigation adding an extra Friends entry to browser history.
- Server voice room now fills the available center area; removed the vertical resize handle and resize hint.
- Clicking a server voice channel now joins it directly when not already connected.
- Voice input uses the saved device first, then falls back to the default microphone; if no microphone is available the room stays connected receive-only instead of immediately disconnecting.
- User/voice bottom panels are hidden while Settings is open.
- Added cumulative `supabase/MIGRATE_V0.12.2.sql` with missing `moderation_bans`, `moderation_notices`, `moon_admin_*` RPCs, RLS policies, Realtime publication and server moderation RPCs.
- Admin UI now reports a clear migration instruction instead of only raw PGRST202/PGRST205 errors when the schema is missing.
