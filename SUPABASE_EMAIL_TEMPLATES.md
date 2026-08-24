# MoonLobby — Supabase email templates

Moon uses `{{ .Token }}` for both account verification and password recovery.
Do not replace it with `{{ .ConfirmationURL }}` if you want the code-entry screen.

## Confirm signup

**Subject:** `Код подтверждения MoonLobby`

```html
<div style="margin:0;padding:40px 16px;background:#0f1014;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <div style="max-width:520px;margin:0 auto;background:#18191f;border:1px solid #262832;border-radius:18px;padding:38px 34px;text-align:center;">
    <img src="https://roblozgg-collab.github.io/moon-web/logo.png" alt="MoonLobby" width="78" height="78" style="display:block;margin:0 auto 18px;border-radius:18px;">
    <div style="font-size:28px;font-weight:800;letter-spacing:-1px;margin-bottom:8px;">MoonLobby</div>
    <div style="font-size:14px;color:#949ba4;margin-bottom:32px;">Подтверждение аккаунта</div>
    <h1 style="font-size:22px;margin:0 0 14px;color:#f2f3f5;">Добро пожаловать в MoonLobby</h1>
    <p style="font-size:15px;line-height:23px;color:#b5bac1;margin:0 0 28px;">Остался всего один шаг. Введите код ниже в приложении, чтобы подтвердить вашу электронную почту.</p>
    <div style="background:#111216;border:1px solid #30323d;border-radius:14px;padding:22px 16px;margin:0 0 28px;font-size:36px;line-height:42px;font-weight:800;letter-spacing:12px;color:#ffffff;">{{ .Token }}</div>
    <p style="font-size:13px;line-height:20px;color:#7d828d;margin:0 0 26px;">Никому не сообщайте этот код. Сотрудники MoonLobby никогда не попросят вас назвать его.</p>
    <div style="height:1px;background:#262832;margin:0 0 24px;"></div>
    <p style="font-size:12px;line-height:18px;color:#666b75;margin:0;">Если вы не создавали аккаунт MoonLobby, просто проигнорируйте это письмо.</p>
  </div>
  <div style="text-align:center;font-size:11px;color:#50545d;margin-top:18px;">© MoonLobby</div>
</div>
```

## Reset password

**Subject:** `Сброс пароля MoonLobby`

```html
<div style="margin:0;padding:40px 16px;background:#0f1014;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <div style="max-width:520px;margin:0 auto;background:#18191f;border:1px solid #262832;border-radius:18px;padding:38px 34px;text-align:center;">
    <img src="https://roblozgg-collab.github.io/moon-web/logo.png" alt="MoonLobby" width="78" height="78" style="display:block;margin:0 auto 18px;border-radius:18px;">
    <div style="font-size:28px;font-weight:800;letter-spacing:-1px;margin-bottom:8px;">MoonLobby</div>
    <div style="font-size:14px;color:#949ba4;margin-bottom:32px;">Восстановление доступа</div>
    <h1 style="font-size:22px;margin:0 0 14px;color:#f2f3f5;">Сброс пароля</h1>
    <p style="font-size:15px;line-height:23px;color:#b5bac1;margin:0 0 28px;">Введите этот код в MoonLobby, чтобы установить новый пароль.</p>
    <div style="background:#111216;border:1px solid #30323d;border-radius:14px;padding:22px 16px;margin:0 0 28px;font-size:36px;line-height:42px;font-weight:800;letter-spacing:12px;color:#ffffff;">{{ .Token }}</div>
    <p style="font-size:13px;line-height:20px;color:#7d828d;margin:0 0 26px;">Никому не сообщайте этот код. Если вы не запрашивали сброс пароля, просто проигнорируйте письмо.</p>
    <div style="height:1px;background:#262832;margin:0 0 24px;"></div>
    <p style="font-size:12px;line-height:18px;color:#666b75;margin:0;">Безопасность аккаунта MoonLobby</p>
  </div>
  <div style="text-align:center;font-size:11px;color:#50545d;margin-top:18px;">© MoonLobby</div>
</div>
```

## Required settings

- Authentication → Providers → Email → **Confirm email: ON**
- Authentication → SMTP Settings → configure custom SMTP for public delivery
- Authentication → URL Configuration → Site URL: `https://roblozgg-collab.github.io/moon-web/`
