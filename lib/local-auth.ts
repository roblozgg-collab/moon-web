"use client";

import type { ProfileGradient } from "./data";
import { inlineImageToUploadedUrl, isInlineImage } from "./media";

export type LocalAccount = {
  id: string;
  email: string;
  username: string;
  password: string;
  displayName: string;
  avatar: string;
  banner?: string;
  bio?: string;
  profileGradient: ProfileGradient;
  status: "online" | "idle" | "dnd" | "invisible";
  plus: boolean;
  plusBadgeVisible: boolean;
  developer: boolean;
  nicknameColor?: string;
  nicknameFont?: "default" | "serif" | "mono" | "rounded";
  createdAt: string;
};

const ACCOUNTS_KEY = "moon:local-accounts:v3";
const SESSION_KEY = "moon:tab-session:v3";
const SHARED_KEY = "moon:shared-chat:v4";

function canUseStorage() { return typeof window !== "undefined"; }

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export function getLocalAccounts(): LocalAccount[] {
  if (!canUseStorage()) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]") as Array<Partial<LocalAccount>>;
    return raw.map((account) => ({
      id: String(account.id ?? `local-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      email: String(account.email ?? ""),
      username: String(account.username ?? "user"),
      password: String(account.password ?? ""),
      displayName: String(account.displayName ?? account.username ?? "User"),
      avatar: String(account.avatar ?? "V"),
      banner: account.banner,
      bio: account.bio ?? "",
      profileGradient: account.profileGradient ?? { from: "#5865f2", to: "#7c3aed", angle: 135 },
      status: account.status ?? "online",
      plus: Boolean(account.plus),
      plusBadgeVisible: account.plusBadgeVisible !== false,
      developer: Boolean(account.developer),
      nicknameColor: account.nicknameColor ?? "#f2f3f5",
      nicknameFont: account.nicknameFont ?? "default",
      createdAt: String(account.createdAt ?? new Date().toISOString()),
    }));
  } catch { return []; }
}

function saveAccounts(accounts: LocalAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) throw new Error("Локальное хранилище переполнено. Перезапусти Moon v0.9.1 — старые base64-картинки будут автоматически перенесены в /uploads.");
    throw error;
  }
  window.dispatchEvent(new Event("moon:accounts-changed"));
}

export function getLocalSession(): LocalAccount | null {
  if (!canUseStorage()) return null;
  const id = sessionStorage.getItem(SESSION_KEY);
  if (!id) return null;
  return getLocalAccounts().find((account) => account.id === id) ?? null;
}

export function setLocalSession(accountId: string) { sessionStorage.setItem(SESSION_KEY, accountId); }
export function clearLocalSession() { if (canUseStorage()) sessionStorage.removeItem(SESSION_KEY); }

export function registerLocalAccount(input: { email: string; username: string; displayName: string; password: string; developer?: boolean; id?: string }): LocalAccount {
  const accounts = getLocalAccounts();
  const email = input.email.trim().toLowerCase();
  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
  if (username.length < 2) throw new Error("Username must be at least 2 characters.");
  if (!displayName) throw new Error("Display name is required.");
  if (input.password.length < 4) throw new Error("Password must be at least 4 characters for this local build.");
  if (accounts.some((account) => account.email === email)) throw new Error("An account with this email already exists locally.");
  if (accounts.some((account) => account.username === username)) throw new Error("This username is already used locally.");
  const account: LocalAccount = {
    id: input.id ?? `local-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email,
    username,
    password: input.password,
    displayName,
    avatar: displayName.slice(0, 1).toUpperCase() || "V",
    bio: "",
    profileGradient: { from: "#5865f2", to: "#7c3aed", angle: 135 },
    status: "online",
    plus: false,
    plusBadgeVisible: true,
    developer: Boolean(input.developer),
    nicknameColor: "#f2f3f5",
    nicknameFont: "default",
    createdAt: new Date().toISOString(),
  };
  saveAccounts([...accounts, account]);
  setLocalSession(account.id);
  return account;
}

export function loginLocalAccount(login: string, password: string): LocalAccount {
  const key = login.trim().toLowerCase();
  const account = getLocalAccounts().find((item) => item.email === key || item.username === key);
  if (!account || account.password !== password) throw new Error("Invalid email/username or password.");
  setLocalSession(account.id);
  return account;
}

export function updateLocalAccount(accountId: string, patch: Partial<Omit<LocalAccount, "id" | "createdAt" | "password" | "email" | "developer">>): LocalAccount {
  const accounts = getLocalAccounts();
  const current = accounts.find((account) => account.id === accountId);
  if (!current) throw new Error("Local account not found.");
  if (patch.username) {
    const username = normalizeUsername(patch.username);
    if (accounts.some((account) => account.id !== accountId && account.username === username)) throw new Error("This username is already used locally.");
    patch = { ...patch, username };
  }
  const updated = { ...current, ...patch };
  saveAccounts(accounts.map((account) => account.id === accountId ? updated : account));
  return updated;
}

export async function migrateLegacyInlineMedia() {
  if (!canUseStorage()) return;
  const replacements = new Map<string, string>();
  const convert = async (value: unknown, purpose: string): Promise<unknown> => {
    if (typeof value === "string" && isInlineImage(value)) {
      if (replacements.has(value)) return replacements.get(value)!;
      try {
        const url = await inlineImageToUploadedUrl(value, purpose);
        replacements.set(value, url);
        return url;
      } catch {
        return value;
      }
    }
    if (Array.isArray(value)) return Promise.all(value.map((item) => convert(item, purpose)));
    if (value && typeof value === "object") {
      const output: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) output[key] = await convert(item, key.includes("banner") ? "banner" : key.includes("avatar") ? "avatar" : purpose);
      return output;
    }
    return value;
  };

  let migratedAccounts: unknown = null;
  try { migratedAccounts = await convert(JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]"), "avatar"); } catch { /* keep original accounts */ }

  try {
    const rawShared = localStorage.getItem(SHARED_KEY);
    if (rawShared) {
      const migratedShared = await convert(JSON.parse(rawShared), "shared-media");
      try { localStorage.setItem(SHARED_KEY, JSON.stringify(migratedShared)); }
      catch { localStorage.removeItem(SHARED_KEY); }
    }
  } catch {
    try { localStorage.removeItem(SHARED_KEY); } catch { /* ignore */ }
  }

  if (migratedAccounts) {
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(migratedAccounts)); } catch { /* A future profile save will show a compact quota error. */ }
  }
}

export function accountToCurrentUser(account: LocalAccount) {
  return {
    id: account.id,
    displayName: account.displayName,
    username: account.username,
    avatar: account.avatar,
    banner: account.banner,
    bio: account.bio,
    profileGradient: account.profileGradient,
    status: account.status,
    plus: account.plus,
    plusBadgeVisible: account.plusBadgeVisible,
    developer: account.developer,
    nicknameColor: account.nicknameColor,
    nicknameFont: account.nicknameFont,
  } as const;
}
