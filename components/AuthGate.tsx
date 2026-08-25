"use client";

import { type ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Languages, LoaderCircle, LockKeyhole, Mail, RotateCcw, UserRound } from "lucide-react";
import { APP_NAME, withBasePath } from "@/lib/config";
import { useMoonStore, type CurrentUser } from "@/lib/store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getMyRemoteProfile, profileToCurrentUser, validateRemoteUsername } from "@/lib/supabase/profile";

type Mode = "login" | "register" | "verify-signup" | "forgot" | "verify-recovery" | "reset-password";
type GateState = "checking" | "authenticated" | "guest";
type Lang = "ru" | "en";

const AUTH_LANG_KEY = "moon:auth-language";
const RECOVERY_PENDING_KEY = "moon:auth-recovery-pending";
const RECOVERY_EMAIL_KEY = "moon:auth-recovery-email";
const OTP_LENGTH = 6;

async function enforceModerationAfterAuth() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return;
  const { data: bans } = await supabase.from("moderation_bans").select("id,reason,expires_at,revoked_at").eq("target_type", "user").eq("target_id", user.id).is("revoked_at", null).order("created_at", { ascending: false });
  const activeBan = (bans ?? []).find((ban: any) => !ban.expires_at || new Date(ban.expires_at).getTime() > Date.now());
  if (activeBan) {
    await supabase.auth.signOut();
    const until = activeBan.expires_at ? ` до ${new Date(activeBan.expires_at).toLocaleString()}` : " бессрочно";
    throw new Error(`Аккаунт заблокирован${until}.${activeBan.reason ? ` Причина: ${activeBan.reason}` : ""}`);
  }
  const { data: notices } = await supabase.from("moderation_notices").select("id,kind,reason,created_at").eq("user_id", user.id).is("seen_at", null).order("created_at", { ascending: true });
  if (notices?.length) {
    const text = notices.map((item: any) => {
      const what = item.kind === "avatar_removed" ? "Аватар был удалён администрацией." : item.kind === "banner_removed" ? "Баннер был удалён администрацией." : item.kind === "profile_media_removed" ? "Аватар и баннер были удалены администрацией." : "Сообщение администрации.";
      return `${what}${item.reason ? `\nПричина: ${item.reason}` : ""}`;
    }).join("\n\n");
    window.setTimeout(() => window.alert(text), 120);
    await supabase.from("moderation_notices").update({ seen_at: new Date().toISOString() }).in("id", notices.map((item: any) => item.id));
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const setCurrentUser = useMoonStore((s) => s.setCurrentUser);
  const setBackendMode = useMoonStore((s) => s.setBackendMode);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      const boot = async () => {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data.session) {
          setBackendMode("online");
          setState("guest");
          return;
        }
        if (sessionStorage.getItem(RECOVERY_PENDING_KEY) === "1") {
          setBackendMode("online");
          setState("guest");
          return;
        }
        try { await enforceModerationAfterAuth(); } catch (error) {
          if (!cancelled) { window.alert(error instanceof Error ? error.message : "Доступ к аккаунту ограничен."); setState("guest"); }
          return;
        }
        const profile = await getMyRemoteProfile();
        if (cancelled) return;
        if (!profile) {
          await supabase.auth.signOut();
          setState("guest");
          return;
        }
        setCurrentUser(profileToCurrentUser(profile));
        setBackendMode("online");
        setState("authenticated");
      };
      void boot();

      const { data: listener } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          setState("guest");
          return;
        }
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "PASSWORD_RECOVERY") {
          if (sessionStorage.getItem(RECOVERY_PENDING_KEY) === "1") {
            setBackendMode("online");
            setState("guest");
            return;
          }
          window.setTimeout(() => {
            void enforceModerationAfterAuth().then(() => getMyRemoteProfile()).then((profile) => {
              if (!cancelled && profile) {
                setCurrentUser(profileToCurrentUser(profile));
                setBackendMode("online");
                setState("authenticated");
              }
            }).catch((error) => { if (!cancelled) { window.alert(error instanceof Error ? error.message : "Доступ к аккаунту ограничен."); setState("guest"); } });
          }, 0);
        }
      });

      const onLogout = () => { void supabase.auth.signOut(); };
      window.addEventListener("moon:logout", onLogout);
      return () => {
        cancelled = true;
        listener.subscription.unsubscribe();
        window.removeEventListener("moon:logout", onLogout);
      };
    }

    // Moon is cloud-only now. Never create browser-only accounts when the backend
    // configuration is unavailable; surface a real configuration error instead.
    setBackendMode("online");
    setState("guest");
    return () => { cancelled = true; };
  }, [setBackendMode, setCurrentUser]);

  if (state === "checking") return <div className="auth-loading"><LoaderCircle size={30} className="spin"/><strong>{APP_NAME}</strong><span>Подключение к Moon…</span></div>;
  if (state === "guest") return <AuthScreen onAuthenticated={(user) => { setCurrentUser(user); setBackendMode("online"); setState("authenticated"); }} />;
  return <>{children}</>;
}

function OtpCodeInput({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? "");

  const setDigit = (index: number, raw: string) => {
    const nextDigit = raw.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = nextDigit;
    onChange(next.join("").slice(0, OTP_LENGTH));
    if (nextDigit && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = "";
      onChange(next.join(""));
      refs.current[index - 1]?.focus();
      event.preventDefault();
    }
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, OTP_LENGTH) - 1]?.focus();
  };

  return <div className="auth-otp" aria-label="Verification code">
    {digits.map((digit, index) => <input
      key={index}
      ref={(node) => { refs.current[index] = node; }}
      value={digit}
      onChange={(event) => setDigit(index, event.target.value)}
      onKeyDown={(event) => onKeyDown(index, event)}
      onPaste={onPaste}
      inputMode="numeric"
      autoComplete={index === 0 ? "one-time-code" : "off"}
      maxLength={1}
      disabled={disabled}
      aria-label={`Code digit ${index + 1}`}
    />)}
  </div>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: CurrentUser) => void }) {
  const remote = isSupabaseConfigured();
  const recoveryPending = typeof window !== "undefined" && sessionStorage.getItem(RECOVERY_PENDING_KEY) === "1";
  const recoveryOpen = typeof window !== "undefined" && sessionStorage.getItem("moon:auth-open-recovery") === "1";
  const [mode, setMode] = useState<Mode>(recoveryPending ? "reset-password" : recoveryOpen ? "verify-recovery" : "login");
  const [lang, setLang] = useState<Lang>(() => typeof window !== "undefined" && localStorage.getItem(AUTH_LANG_KEY) === "en" ? "en" : "ru");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resetEmail, setResetEmail] = useState(() => typeof window !== "undefined" ? sessionStorage.getItem(RECOVERY_EMAIL_KEY) ?? "" : "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const l = (ru: string, en: string) => lang === "ru" ? ru : en;

  useEffect(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem("moon:auth-open-recovery");
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const switchLang = () => {
    const next: Lang = lang === "ru" ? "en" : "ru";
    setLang(next);
    localStorage.setItem(AUTH_LANG_KEY, next);
  };

  const clearMessages = () => { setError(""); setNotice(""); };
  const goTo = (next: Mode) => { clearMessages(); setOtp(""); setMode(next); };

  const finishRemoteAuth = async () => {
    const profile = await getMyRemoteProfile(8);
    if (!profile) throw new Error(l("Профиль ещё создаётся. Подожди секунду и попробуй ещё раз.", "Your profile is still being created. Wait a second and try again."));
    onAuthenticated(profileToCurrentUser(profile));
  };

  const registerRemote = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const validation = validateRemoteUsername(username);
    if (!validation.ok) throw new Error(validation.message);
    if (!displayName.trim()) throw new Error(l("Укажи отображаемое имя.", "Display name is required."));
    if (password.length < 6) throw new Error(l("Пароль должен быть минимум 6 символов.", "Password must be at least 6 characters."));
    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error(l("Введи корректный email.", "Enter a valid email address."));

    const { data: availableData, error: availableError } = await supabase.rpc("moon_username_available", { candidate: validation.username });
    if (availableError) throw new Error(l(
      `База Moon не готова: ${availableError.message}. Выполни supabase/schema.sql в Supabase SQL Editor.`,
      `Moon database is not ready: ${availableError.message}. Run supabase/schema.sql in the Supabase SQL Editor.`,
    ));
    if (availableData === false) throw new Error(l("Этот username уже занят.", "This username is already taken."));

    const { data, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { username: validation.username, display_name: displayName.trim() } },
    });
    if (authError) throw authError;

    if (data.session) {
      // Email confirmation is disabled in Supabase. Moon requires email verification
      // before first login, so sign out and tell the operator what must be enabled.
      await supabase.auth.signOut();
      throw new Error(l(
        "В Supabase отключено подтверждение email. Включи Authentication → Providers → Email → Confirm email, затем зарегистрируй аккаунт снова.",
        "Email confirmation is disabled in Supabase. Enable Authentication → Providers → Email → Confirm email, then register again.",
      ));
    }

    if (!data.user) throw new Error(l("Supabase не создал пользователя. Проверь Auth Logs и SMTP.", "Supabase did not create a user. Check Auth Logs and SMTP."));

    setVerificationEmail(cleanEmail);
    setOtp("");
    setResendSeconds(60);
    setMode("verify-signup");
  };

  const loginRemote = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const cleanEmail = login.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error(l("Для входа используй email.", "Use your email to log in."));
    const { error: authError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (authError) throw authError;
    await enforceModerationAfterAuth();
    await finishRemoteAuth();
  };

  const verifySignupCode = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    if (otp.length !== OTP_LENGTH) throw new Error(l(`Введи ${OTP_LENGTH}-значный код.`, `Enter the ${OTP_LENGTH}-digit code.`));
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: verificationEmail, token: otp, type: "email" });
    if (verifyError) throw verifyError;
    await enforceModerationAfterAuth();
    await finishRemoteAuth();
  };

  const resendSignupCode = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || resendSeconds > 0) return;
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: verificationEmail });
    if (resendError) throw resendError;
    setNotice(l("Новый код отправлен на почту.", "A new code was sent to your email."));
    setResendSeconds(60);
  };

  const requestPasswordReset = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error(l("Введи корректный email.", "Enter a valid email address."));
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    if (resetError) throw resetError;
    setResetEmail(cleanEmail);
    sessionStorage.setItem(RECOVERY_EMAIL_KEY, cleanEmail);
    setOtp("");
    setResendSeconds(60);
    setMode("verify-recovery");
  };

  const verifyRecoveryCode = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    if (otp.length !== OTP_LENGTH) throw new Error(l(`Введи ${OTP_LENGTH}-значный код.`, `Enter the ${OTP_LENGTH}-digit code.`));
    sessionStorage.setItem(RECOVERY_PENDING_KEY, "1");
    sessionStorage.setItem(RECOVERY_EMAIL_KEY, resetEmail);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: resetEmail, token: otp, type: "recovery" });
    if (verifyError) {
      sessionStorage.removeItem(RECOVERY_PENDING_KEY);
      throw verifyError;
    }
    setPassword("");
    setConfirmPassword("");
    setMode("reset-password");
  };

  const resendRecoveryCode = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || resendSeconds > 0) return;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail);
    if (resetError) throw resetError;
    setNotice(l("Новый код восстановления отправлен.", "A new recovery code was sent."));
    setResendSeconds(60);
  };

  const saveNewPassword = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    if (password.length < 6) throw new Error(l("Новый пароль должен быть минимум 6 символов.", "The new password must be at least 6 characters."));
    if (password !== confirmPassword) throw new Error(l("Пароли не совпадают.", "Passwords do not match."));
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
    await supabase.auth.signOut();
    sessionStorage.removeItem(RECOVERY_PENDING_KEY);
    sessionStorage.removeItem(RECOVERY_EMAIL_KEY);
    setLogin(resetEmail);
    setPassword("");
    setConfirmPassword("");
    setMode("login");
    setNotice(l("Пароль изменён. Теперь войди с новым паролем.", "Password changed. You can now log in with your new password."));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    clearMessages();
    try {
      if (!remote) throw new Error(l("Не удалось подключиться к Supabase. Обнови страницу или проверь конфигурацию проекта.", "Could not connect to Supabase. Refresh the page or check the project configuration."));
      if (mode === "login") await loginRemote();
      else if (mode === "register") await registerRemote();
      else if (mode === "verify-signup") await verifySignupCode();
      else if (mode === "forgot") await requestPasswordReset();
      else if (mode === "verify-recovery") await verifyRecoveryCode();
      else if (mode === "reset-password") await saveNewPassword();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : l("Не удалось продолжить.", "Could not continue."));
    } finally {
      setBusy(false);
    }
  };

  const runResend = async (kind: "signup" | "recovery") => {
    setBusy(true);
    clearMessages();
    try {
      if (kind === "signup") await resendSignupCode();
      else await resendRecoveryCode();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : l("Не удалось отправить код повторно.", "Could not resend the code."));
    } finally {
      setBusy(false);
    }
  };

  const isOtp = mode === "verify-signup" || mode === "verify-recovery";
  const title = mode === "login" ? l("С возвращением!", "Welcome back!")
    : mode === "register" ? l("Создай аккаунт Moon", "Create your Moon account")
    : mode === "verify-signup" ? l("Проверь почту", "Check your email")
    : mode === "forgot" ? l("Забыли пароль?", "Forgot your password?")
    : mode === "verify-recovery" ? l("Введите код восстановления", "Enter recovery code")
    : l("Создай новый пароль", "Create a new password");

  const description = mode === "login" ? l("Войди и продолжай общение.", "Log in and continue chatting.")
    : mode === "register" ? l("Аккаунт, друзья, серверы и сообщения сохраняются в облаке.", "Your account, friends, servers and messages are stored in the cloud.")
    : mode === "verify-signup" ? l(`Мы отправили ${OTP_LENGTH}-значный код на ${verificationEmail}. Введи его ниже, чтобы подтвердить аккаунт.`, `We sent a ${OTP_LENGTH}-digit code to ${verificationEmail}. Enter it below to verify your account.`)
    : mode === "forgot" ? l("Укажи email аккаунта Moon. Мы отправим код для восстановления.", "Enter your Moon account email. We'll send a recovery code.")
    : mode === "verify-recovery" ? l(`Код отправлен на ${resetEmail}.`, `A code was sent to ${resetEmail}.`)
    : l("Придумай новый пароль для аккаунта.", "Choose a new password for your account.");

  return <main className="auth-page"><div className="auth-backdrop"/><form className={`auth-card ${isOtp ? "auth-card-otp" : ""}`} onSubmit={submit}>
    <button type="button" className="auth-language" onClick={switchLang}><Languages size={16}/>{lang === "ru" ? "RU" : "EN"}</button>
    {(mode === "forgot" || mode === "verify-signup" || mode === "verify-recovery" || mode === "reset-password") && <button type="button" className="auth-back" onClick={() => {
      if (mode === "reset-password") return;
      sessionStorage.removeItem(RECOVERY_PENDING_KEY);
      setMode(mode === "verify-signup" ? "register" : mode === "verify-recovery" ? "forgot" : "login");
      clearMessages();
      setOtp("");
    }}><ArrowLeft size={16}/>{l("Назад", "Back")}</button>}
    <div className="auth-brand"><div><img src={withBasePath("/logo.png")} alt="Moon"/></div><span><strong>{APP_NAME}</strong><small>ONLINE</small></span></div>
    <h1>{title}</h1>
    <p>{description}</p>

    {mode === "login" && <>
      <label><span>EMAIL</span><div className="auth-input"><Mail size={17}/><input required value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="you@example.com"/></div></label>
      <label><span>{l("ПАРОЛЬ", "PASSWORD")}</span><div className="auth-input"><LockKeyhole size={17}/><input required value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder={l("Твой пароль", "Your password")}/></div></label>
      <button type="button" className="auth-forgot" onClick={() => { setResetEmail(login.trim()); goTo("forgot"); }}>{l("Сбросить пароль", "Reset password")}</button>
    </>}

    {mode === "register" && <>
      <label><span>EMAIL</span><div className="auth-input"><Mail size={17}/><input required value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com"/></div></label>
      <label><span>{l("ОТОБРАЖАЕМОЕ ИМЯ", "DISPLAY NAME")}</span><div className="auth-input"><UserRound size={17}/><input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={l("Как тебя будут видеть", "How people see you")}/></div></label>
      <label><span>USERNAME</span><div className="auth-input"><UserRound size={17}/><input required value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="unique_username"/></div></label>
      <label><span>{l("ПАРОЛЬ", "PASSWORD")}</span><div className="auth-input"><LockKeyhole size={17}/><input required value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" placeholder={l("Минимум 6 символов", "At least 6 characters")}/></div></label>
    </>}

    {mode === "forgot" && <label><span>EMAIL</span><div className="auth-input"><Mail size={17}/><input autoFocus required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com"/></div></label>}

    {isOtp && <>
      <OtpCodeInput value={otp} onChange={setOtp} disabled={busy}/>
      <div className="auth-code-help">{l("Не пришёл код? Проверь папку «Спам» или отправь новый.", "Didn't get the code? Check spam or send a new one.")}</div>
      <button type="button" className="auth-resend" disabled={busy || resendSeconds > 0} onClick={() => void runResend(mode === "verify-signup" ? "signup" : "recovery")}><RotateCcw size={14}/>{resendSeconds > 0 ? l(`Отправить снова через ${resendSeconds}с`, `Resend in ${resendSeconds}s`) : l("Отправить код снова", "Resend code")}</button>
    </>}

    {mode === "reset-password" && <>
      <label><span>{l("НОВЫЙ ПАРОЛЬ", "NEW PASSWORD")}</span><div className="auth-input"><LockKeyhole size={17}/><input autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" placeholder={l("Минимум 6 символов", "At least 6 characters")}/></div></label>
      <label><span>{l("ПОВТОРИ ПАРОЛЬ", "CONFIRM PASSWORD")}</span><div className="auth-input"><LockKeyhole size={17}/><input required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" autoComplete="new-password" placeholder={l("Ещё раз новый пароль", "Repeat the new password")}/></div></label>
    </>}

    {error && <div className="auth-error">{error}</div>}
    {notice && <div className="auth-notice">{notice}</div>}
    <button className="auth-submit" disabled={busy || (isOtp && otp.length !== OTP_LENGTH)}>{busy ? <LoaderCircle className="spin" size={18}/> : mode === "login" ? l("Войти", "Log In") : mode === "register" ? l("Создать аккаунт", "Create Account") : mode === "verify-signup" ? l("Подтвердить аккаунт", "Verify Account") : mode === "forgot" ? l("Отправить код", "Send Code") : mode === "verify-recovery" ? l("Продолжить", "Continue") : l("Сменить пароль", "Change Password")}</button>

    {(mode === "login" || mode === "register") && <div className="auth-switch">{mode === "login" ? l("Нет аккаунта?", "Need an account?") : l("Уже есть аккаунт?", "Already have an account?")}<button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); clearMessages(); }}>{mode === "login" ? l("Регистрация", "Register") : l("Войти", "Log In")}</button></div>}
    <div className="demo-credentials">{l("Защищено Supabase Auth · данные синхронизируются в облаке.", "Protected by Supabase Auth · data is synced in the cloud.")}</div>
  </form></main>;
}
