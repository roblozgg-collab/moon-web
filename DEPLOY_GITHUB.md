# Moon — GitHub + Vercel + Supabase deployment guide

This is the recommended way to put Moon online now:

**GitHub stores the source code → Vercel deploys the Next.js site → Supabase stores accounts/data/media and provides realtime.**

GitHub Pages is not recommended for this project because Moon is a Next.js application with runtime/server routes and realtime/media behavior. Vercel is the simplest GitHub-connected host for the current project.

---

## 1. Prepare Supabase

Open your Supabase project:

`https://lxisyqachdbwymmlwkgo.supabase.co`

In the Supabase Dashboard:

1. Open **SQL Editor**.
2. Click **New query**.
3. Open `supabase/schema.sql` from this project.
4. Copy the whole file into the SQL Editor.
5. Click **Run**.

The script creates:

- `profiles`;
- `developer_claims`;
- `moon_shared_state`;
- RLS policies;
- the `moon-media` Storage bucket;
- Storage policies;
- Realtime publication entries;
- the username availability RPC;
- the Auth → profile creation trigger.

### Email confirmation for quick testing

For the easiest closed beta:

1. Supabase → **Authentication** → **Providers** → **Email**.
2. Keep Email provider enabled.
3. Disable email confirmation / Confirm email while you are testing.

If you keep confirmation enabled, registration will still work, but users must confirm the email before they can log in.

---

## 2. Test Supabase locally first

The supplied `.env.local` already contains:

```env
NEXT_PUBLIC_SUPABASE_URL=https://lxisyqachdbwymmlwkgo.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mZzhJ4oFb7narRGoH7FqsQ_l77msmUA
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`.env.local` is ignored by Git on purpose.

Run:

```bash
npm install
npm run dev
```

Then open:

`http://localhost:3000`

Create two accounts using two browsers. They should use the same Supabase project and survive browser/PC restarts.

---

## 3. Create a GitHub repository

On GitHub:

1. Click **New repository**.
2. Name it, for example, `moon-web`.
3. Public or Private is your choice.
4. Do **not** initialize it with another README or `.gitignore`.
5. Create the repository.

Inside the Moon project folder run:

```bash
git init
git add .
git commit -m "Moon v0.11 Supabase cloud beta"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/moon-web.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

### Check before pushing

Run:

```bash
git status
```

`.env.local` must **not** appear in files waiting to be committed.

The publishable key is not a server secret, but keeping environment configuration out of Git makes deployment cleaner and prevents accidentally adding a real secret later.

---

## 4. Deploy the GitHub repository on Vercel

1. Go to Vercel.
2. Sign in with GitHub.
3. Click **Add New → Project**.
4. Import your `moon-web` repository.
5. Vercel should detect **Next.js** automatically.
6. Before clicking Deploy, open **Environment Variables**.

Add:

### Variable 1

Name:

`NEXT_PUBLIC_SUPABASE_URL`

Value:

`https://lxisyqachdbwymmlwkgo.supabase.co`

### Variable 2

Name:

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Value:

`sb_publishable_mZzhJ4oFb7narRGoH7FqsQ_l77msmUA`

Add them to Production, Preview and Development environments.

You can leave `NEXT_PUBLIC_APP_URL` unset for the first deployment because Moon uses `window.location.origin` for working invite links.

Click **Deploy**.

After the build completes Vercel will give you a URL similar to:

`https://moon-web-xxxxx.vercel.app`

---

## 5. Set the Supabase Auth site URL

After Vercel gives you the real URL:

1. Supabase → **Authentication** → **URL Configuration**.
2. Set **Site URL** to your Vercel production URL, for example:

`https://moon-web-xxxxx.vercel.app`

3. Add redirect URLs for:

```text
http://localhost:3000/**
https://moon-web-xxxxx.vercel.app/**
```

If you later connect your own domain, add that domain too.

---

## 6. Test from two different PCs

You no longer need Radmin VPN for normal Moon testing.

On PC 1:

1. Open the Vercel URL.
2. Register account A.

On PC 2:

1. Open the same Vercel URL.
2. Register account B.

Then test:

- adding by username;
- accepting a friend request;
- automatic DM creation;
- realtime messages;
- avatar/banner uploads;
- GIF avatar/banner;
- servers/channels;
- server invites;
- personal calls.

Everything should use the same Supabase project.

---

## 7. Calls after deployment

Vercel uses HTTPS, so browser microphone, camera and `getDisplayMedia()` permissions work much more normally than they did over plain Radmin HTTP.

Moon currently uses WebRTC plus public STUN servers and Supabase Realtime for signaling.

For many users this works directly. For a real public release you should later add a TURN server because some NAT/firewall combinations cannot establish a direct WebRTC connection through STUN alone.

---

## 8. Every future update

After changing Moon locally:

```bash
git add .
git commit -m "describe update"
git push
```

Vercel automatically creates a new deployment from the GitHub push.

---

## Security checklist

Safe in the browser:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never commit or send to client code:

- `sb_secret_...`
- `service_role`
- database password
- Supabase personal access token
- private JWT signing keys

The SQL included in this build enables RLS. v0.11's shared JSONB state is intended for closed beta testing; before opening Moon publicly, normalize the shared state into server/message/friend tables so RLS can enforce ownership on each resource.
