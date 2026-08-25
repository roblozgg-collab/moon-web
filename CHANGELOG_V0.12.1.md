# Moon v0.12.1

This patch focuses on calls, profiles, moderation and real URL navigation.

## Fixed / added

- Outgoing-call ringing state now dims the peer avatar and adds a slow white pulse until the call is accepted.
- The connected voice panel is rendered only after a real voice-channel connection reaches `connected`.
- PLUS nickname color and PLUS font can be disabled independently without removing PLUS.
- Voice-channel avatars keep a fixed circular aspect ratio.
- The bottom user / voice panel is wider and spans the server rail + channel sidebar area.
- Profiles show the real account creation date in `25 August 2026` format.
- Developer Mode adds `Copy Server ID` to the server context menu.
- Admin ban / unban / PLUS actions now surface readable Supabase errors and refresh changed profile data.
- Broken avatar URLs fall back safely and profile avatar stacking was fixed.
- Server member context menus support DM, profile, mute and ban according to permissions.
- Moderators with `MANAGE_MESSAGES` can delete other users' messages; deletion tombstones prevent realtime merge from resurrecting them.
- Moon routes now use `/friends`, `/plus`, `/im/:id`, `/server/:serverId/:channelId` and `/settings/:page` and restore state on refresh/back/forward.
- GitHub Pages builds create `out/404.html` as the SPA fallback for direct nested links.
- Moon Plus and Friends now have separate route-based active states.

## Existing Supabase project

Before deploying this version, run once:

`supabase/MIGRATE_V0.12.1.sql`

It adds the PLUS style toggle columns and protected server moderation RPC functions.
