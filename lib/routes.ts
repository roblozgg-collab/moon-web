"use client";

import { BASE_PATH } from "./config";

export type MoonRoute =
  | { kind: "friends"; tab?: string }
  | { kind: "plus" }
  | { kind: "dm"; dmId: string }
  | { kind: "server"; serverId: string; channelId?: string }
  | { kind: "settings"; page?: string }
  | { kind: "home" };

function cleanBase(pathname: string) {
  let path = pathname || "/";
  if (BASE_PATH && path.startsWith(BASE_PATH)) path = path.slice(BASE_PATH.length) || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  return path.replace(/\/+$/, "") || "/";
}

export function parseMoonRoute(pathname = typeof window !== "undefined" ? window.location.pathname : "/"): MoonRoute {
  const path = cleanBase(pathname);
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
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

export function navigateMoon(route: MoonRoute, replace = false) {
  if (typeof window === "undefined") return;
  const path = moonPath(route);
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === path) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
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
