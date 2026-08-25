"use client";

import { BASE_PATH } from "./config";

export type MoonRoute =
  | { kind: "friends"; tab?: string }
  | { kind: "plus" }
  | { kind: "dm"; dmId: string }
  | { kind: "server"; serverId: string; channelId?: string }
  | { kind: "settings"; page?: string }
  | { kind: "home" };

export const MOON_ROUTE_EVENT = "moon:routechange";
const LAST_ROUTE_KEY = "moon:last-route:v2";
const PENDING_ROUTE_KEY = "moon:pending-route:v2";

function cleanBase(pathname: string) {
  let path = pathname || "/";
  if (BASE_PATH && path.startsWith(BASE_PATH)) path = path.slice(BASE_PATH.length) || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  return path.replace(/\/+$/, "") || "/";
}

export function parseMoonRoute(pathname = typeof window !== "undefined" ? window.location.pathname : "/"): MoonRoute {
  const path = cleanBase(pathname);
  const parts = path.split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  if (!parts.length) return { kind: "home" };
  if (parts[0] === "im" && parts[1]) return { kind: "dm", dmId: parts[1] };
  if (parts[0] === "server" && parts[1]) return { kind: "server", serverId: parts[1], channelId: parts[2] };
  if (parts[0] === "plus") return { kind: "plus" };
  if (parts[0] === "friends") return { kind: "friends", tab: parts[1] };
  if (parts[0] === "settings") return { kind: "settings", page: parts[1] };
  return { kind: "home" };
}

function withBase(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}` || "/";
}

export function moonPath(route: MoonRoute) {
  switch (route.kind) {
    case "dm": return withBase(`/im/${encodeURIComponent(route.dmId)}`);
    case "server": return withBase(`/server/${encodeURIComponent(route.serverId)}${route.channelId ? `/${encodeURIComponent(route.channelId)}` : ""}`);
    case "plus": return withBase("/plus");
    case "friends": return withBase(`/friends${route.tab && route.tab !== "online" ? `/${encodeURIComponent(route.tab)}` : ""}`);
    case "settings": return withBase(`/settings${route.page ? `/${encodeURIComponent(route.page)}` : ""}`);
    default: return withBase("/friends");
  }
}

function rememberPath(path: string) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(LAST_ROUTE_KEY, path); } catch { /* storage is optional */ }
}

function nativeHistory(path: string, replace: boolean) {
  // Next.js App Router patches window.history.pushState/replaceState and treats
  // arbitrary /im/:id and /server/:id URLs as real Next routes. On GitHub Pages
  // those routes do not exist as exported RSC pages, which caused the generic
  // "This page couldn't load" screen. Calling the native prototype keeps the
  // current exported root page mounted while Moon owns the in-app route.
  const currentState = window.history.state;
  const nextState = currentState && typeof currentState === "object"
    ? { ...currentState, __moonRoute: path }
    : { __moonRoute: path };
  const fn = replace ? History.prototype.replaceState : History.prototype.pushState;
  fn.call(window.history, nextState, "", path);
}

export function navigateMoonUrl(path: string, replace = false) {
  if (typeof window === "undefined") return;
  const target = path.startsWith("/") ? path : `/${path}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  rememberPath(target);
  if (current !== target) nativeHistory(target, replace);
  window.dispatchEvent(new CustomEvent(MOON_ROUTE_EVENT));
}

export function navigateMoon(route: MoonRoute, replace = false) {
  navigateMoonUrl(moonPath(route), replace);
}

export function rememberCurrentMoonRoute() {
  if (typeof window === "undefined") return;
  rememberPath(`${window.location.pathname}${window.location.search}${window.location.hash}`);
}

export function getLastMoonRoutePath() {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage.getItem(LAST_ROUTE_KEY); } catch { return null; }
}

export function consumePendingMoonRoutePath() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(PENDING_ROUTE_KEY);
    if (value) window.sessionStorage.removeItem(PENDING_ROUTE_KEY);
    return value;
  } catch { return null; }
}

export const SETTINGS_SLUGS: Record<string, string> = {
  "My Account": "account",
  Profiles: "profiles",
  Appearance: "appearance",
  "Voice & Video": "voice",
  Notifications: "notifications",
  "Privacy & Safety": "privacy",
  Language: "language",
  Developer: "advanced",
  Admin: "admin",
};

export const SETTINGS_PAGES: Record<string, string> = Object.fromEntries(Object.entries(SETTINGS_SLUGS).map(([page, slug]) => [slug, page]));
