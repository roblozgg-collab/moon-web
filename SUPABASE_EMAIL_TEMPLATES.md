# Moon — Supabase email codes

Moon v0.11.2 uses a manual OTP code for both account confirmation and password recovery.
No SQL migration is required for this update.

## 1. Enable email confirmation

Supabase Dashboard → **Authentication → Providers → Email**:

- Email provider: ON
- Confirm email: ON

## 2. Confirm signup template

Supabase Dashboard → **Authentication → Email Templates → Confirm signup**.

Subject:

```text
Moon — код подтверждения
```

Body:

```html
<div style="font-family:Arial,sans-serif;background:#111214;color:#f2f3f5;padding:32px">
  <div style="max-width:520px;margin:auto;background:#1e1f22;border-radius:14px;padding:28px">
    <h2 style="margin:0 0 12px">Подтверждение аккаунта Moon</h2>
    <p style="color:#b5bac1">Введите этот код в Moon:</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#fff;background:#2b2d31;border-radius:10px;padding:18px;text-align:center">{{ .Token }}</div>
    <p style="font-size:12px;color:#949ba4;margin-top:18px">Если вы не создавали аккаунт Moon, просто проигнорируйте письмо.</p>
  </div>
</div>
```

Important: the template must contain `{{ .Token }}`. Moon verifies it with Supabase Auth.

## 3. Reset password template

Supabase Dashboard → **Authentication → Email Templates → Reset password**.

Subject:

```text
Moon — восстановление пароля
```

Body:

```html
<div style="font-family:Arial,sans-serif;background:#111214;color:#f2f3f5;padding:32px">
  <div style="max-width:520px;margin:auto;background:#1e1f22;border-radius:14px;padding:28px">
    <h2 style="margin:0 0 12px">Восстановление пароля Moon</h2>
    <p style="color:#b5bac1">Введите этот код в Moon, чтобы задать новый пароль:</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#fff;background:#2b2d31;border-radius:10px;padding:18px;text-align:center">{{ .Token }}</div>
    <p style="font-size:12px;color:#949ba4;margin-top:18px">Если вы не запрашивали восстановление пароля, проигнорируйте письмо.</p>
  </div>
</div>
```

Do not replace `{{ .Token }}` with `{{ .ConfirmationURL }}` if you want Moon's code-entry screen.

## 4. GitHub Pages URL

After GitHub Pages is deployed, set your site address under:

**Supabase → Authentication → URL Configuration**.

This update does not require changing `schema.sql` or environment variables.
