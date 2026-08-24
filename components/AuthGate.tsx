"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Languages, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { APP_NAME, withBasePath } from "@/lib/config";
import {
  accountToCurrentUser,
  clearLocalSession,
  getLocalAccounts,
  getLocalSession,
  loginLocalAccount,
  migrateLegacyInlineMedia,
  normalizeUsername,
  registerLocalAccount,
} from "@/lib/local-auth";
import { useMoonStore, type CurrentUser } from "@/lib/store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getMyRemoteProfile, profileToCurrentUser, validateRemoteUsername } from "@/lib/supabase/profile";

type Mode = "login" | "register";
type GateState = "checking" | "authenticated" | "guest";
type Lang = "ru" | "en";

const AUTH_LANG_KEY = "moon:auth-language";

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
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          window.setTimeout(() => {
            void getMyRemoteProfile().then((profile) => {
              if (!cancelled && profile) {
                setCurrentUser(profileToCurrentUser(profile));
                setBackendMode("online");
                setState("authenticated");
              }
            });
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

    // Fallback for development when Supabase env variables are missing.
    const session = getLocalSession();
    setBackendMode("local");
    if (session) {
      setCurrentUser(accountToCurrentUser(session));
      setState("authenticated");
    } else {
      setState("guest");
    }
    const migrationTimer = window.setTimeout(() => {
      void migrateLegacyInlineMedia().catch(() => undefined);
    }, 250);
    const onLogout = () => { clearLocalSession(); setState("guest"); };
    window.addEventListener("moon:logout", onLogout);
    return () => {
      cancelled = true;
      window.clearTimeout(migrationTimer);
      window.removeEventListener("moon:logout", onLogout);
    };
  }, [setBackendMode, setCurrentUser]);

  if (state === "checking") return <div className="auth-loading"><LoaderCircle size={30} className="spin"/><strong>{APP_NAME}</strong><span>{isSupabaseConfigured() ? "Connecting to Moon…" : "Loading local profile…"}</span></div>;
  if (state === "guest") return <AuthScreen onAuthenticated={(user) => { setCurrentUser(user); setBackendMode(isSupabaseConfigured() ? "online" : "local"); setState("authenticated"); }} />;
  return <>{children}</>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: CurrentUser) => void }) {
  const remote = isSupabaseConfigured();
  const hasAccounts = useMemo(() => remote || getLocalAccounts().length > 0, [remote]);
  const [mode, setMode] = useState<Mode>(remote ? "login" : hasAccounts ? "login" : "register");
  const [lang, setLang] = useState<Lang>(() => typeof window !== "undefined" && localStorage.getItem(AUTH_LANG_KEY) === "en" ? "en" : "ru");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const l = (ru: string, en: string) => lang === "ru" ? ru : en;

  const switchLang = () => {
    const next: Lang = lang === "ru" ? "en" : "ru";
    setLang(next);
    localStorage.setItem(AUTH_LANG_KEY, next);
  };

  const submitRemote = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase is not configured.");

    if (mode === "login") {
      const cleanEmail = login.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error(l("Для входа сейчас используй email.", "Use your email to log in."));
      const { error: authError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (authError) throw authError;
      const profile = await getMyRemoteProfile();
      if (!profile) throw new Error(l("Профиль ещё создаётся. Попробуй ещё раз через секунду.", "Profile is still being created. Try again in a second."));
      onAuthenticated(profileToCurrentUser(profile));
      return;
    }

    const validation = validateRemoteUsername(username);
    if (!validation.ok) throw new Error(validation.message);
    if (!displayName.trim()) throw new Error(l("Укажи отображаемое имя.", "Display name is required."));
    if (password.length < 6) throw new Error(l("Пароль должен быть минимум 6 символов.", "Password must be at least 6 characters."));
    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error(l("Введи корректный email.", "Enter a valid email address."));

    const { data: availableData, error: availableError } = await supabase.rpc("moon_username_available", { candidate: validation.username });
    if (!availableError && availableData === false) throw new Error(l("Этот username уже занят.", "This username is already taken."));

    const { data, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { username: validation.username, display_name: displayName.trim() } },
    });
    if (authError) throw authError;

    if (!data.session) {
      setNotice(l("Аккаунт создан. Подтверди email и затем войди.", "Account created. Confirm your email, then log in."));
      setMode("login");
      setLogin(cleanEmail);
      return;
    }

    const profile = await getMyRemoteProfile();
    if (!profile) throw new Error(l("Профиль создаётся. Попробуй войти ещё раз через секунду.", "Profile is being created. Try logging in again in a second."));
    onAuthenticated(profileToCurrentUser(profile));
  };

  const submitLocal = async () => {
    if (mode === "login") {
      onAuthenticated(accountToCurrentUser(loginLocalAccount(login, password)));
      return;
    }
    const normalized = normalizeUsername(username);
    const normalizedEmail = email.trim().toLowerCase();
    const localAccounts = getLocalAccounts();
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error(l("Введи корректный email.", "Enter a valid email address."));
    if (normalized.length < 2) throw new Error(l("Username должен быть минимум 2 символа.", "Username must be at least 2 characters."));
    if (!displayName.trim()) throw new Error(l("Укажи отображаемое имя.", "Display name is required."));
    if (password.length < 4) throw new Error(l("Пароль должен быть минимум 4 символа.", "Password must be at least 4 characters."));
    if (localAccounts.some((account) => account.email === normalizedEmail)) throw new Error(l("Аккаунт с таким email уже есть в этом браузере.", "An account with this email already exists locally."));
    if (localAccounts.some((account) => account.username === normalized)) throw new Error(l("Этот username уже используется в этом браузере.", "This username is already used locally."));
    const claimant = `local-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const account = registerLocalAccount({ email, username, displayName, password, developer: false, id: claimant });
    onAuthenticated(accountToCurrentUser(account));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (remote) await submitRemote();
      else await submitLocal();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : l("Не удалось продолжить.", "Could not continue."));
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page"><div className="auth-backdrop"/><form className="auth-card" onSubmit={submit}>
    <button type="button" className="auth-language" onClick={switchLang}><Languages size={16}/>{lang === "ru" ? "RU" : "EN"}</button>
    <div className="auth-brand"><div><img src={withBasePath("/logo.png")} alt="Moon"/></div><span><strong>{APP_NAME}</strong><small>{remote ? "SUPABASE CLOUD" : "LOCAL WEB"}</small></span></div>
    <h1>{mode === "login" ? l("С возвращением!", "Welcome back!") : l("Создай аккаунт Moon", "Create your Moon account")}</h1>
    <p>{mode === "login" ? l("Войди и продолжай общение.", "Log in and continue chatting.") : remote ? l("Аккаунт, друзья, серверы и сообщения сохраняются в облаке.", "Your account, friends, servers and messages are stored in the cloud.") : l("Аккаунт сохраняется только в этом браузере.", "This account is stored only in this browser.")}</p>
    {mode === "login" ? <label><span>EMAIL</span><div className="auth-input"><Mail size={17}/><input required value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="you@example.com"/></div></label> : <>
      <label><span>EMAIL</span><div className="auth-input"><Mail size={17}/><input required value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com"/></div></label>
      <label><span>{l("ОТОБРАЖАЕМОЕ ИМЯ", "DISPLAY NAME")}</span><div className="auth-input"><UserRound size={17}/><input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={l("Как тебя будут видеть", "How people see you")}/></div></label>
      <label><span>USERNAME</span><div className="auth-input"><UserRound size={17}/><input required value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="unique_username"/></div></label>
    </>}
    <label><span>{l("ПАРОЛЬ", "PASSWORD")}</span><div className="auth-input"><LockKeyhole size={17}/><input required value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={remote ? l("Минимум 6 символов", "At least 6 characters") : l("Локальный тестовый пароль", "Local test password")}/></div></label>
    {error && <div className="auth-error">{error}</div>}
    {notice && <div className="auth-notice">{notice}</div>}
    <button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : mode === "login" ? l("Войти", "Log In") : l("Создать аккаунт", "Create Account")}</button>
    <div className="auth-switch">{mode === "login" ? l("Нет аккаунта?", "Need an account?") : l("Уже есть аккаунт?", "Already have an account?")}<button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setNotice(""); }}>{mode === "login" ? l("Регистрация", "Register") : l("Войти", "Log In")}</button></div>
    <div className="demo-credentials">{remote ? l("Cloud mode: Supabase Auth + PostgreSQL + Realtime + Storage.", "Cloud mode: Supabase Auth + PostgreSQL + Realtime + Storage.") : l("Локальный fallback-режим.", "Local fallback mode.")}</div>
  </form></main>;
}
