"use client";

import type { CurrentUser } from "@/lib/store";
import type { Member, ProfileGradient } from "@/lib/data";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./client";

export type MoonProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  profile_gradient: ProfileGradient | null;
  status: "online" | "idle" | "dnd" | "invisible" | "offline" | null;
  plus: boolean | null;
  plus_badge_visible: boolean | null;
  developer: boolean | null;
  nickname_color: string | null;
  nickname_color_enabled: boolean | null;
  nickname_font: "default" | "serif" | "mono" | "rounded" | null;
  nickname_font_enabled: boolean | null;
  admin_name_gradient: { from: string; to: string } | null;
  created_at?: string;
  updated_at?: string;
};

export function normalizeRemoteUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validateRemoteUsername(value: string) {
  const username = normalizeRemoteUsername(value);
  if (!/^[a-z0-9_.]{2,32}$/.test(username)) {
    return { ok: false as const, username, message: "Username: 2–32 символа, только a-z, 0-9, _ и ." };
  }
  return { ok: true as const, username };
}

export function profileToCurrentUser(profile: MoonProfileRow): CurrentUser {
  return {
    id: profile.id,
    displayName: profile.display_name,
    username: profile.username,
    avatar: profile.avatar_url || profile.display_name.slice(0, 1).toUpperCase() || "M",
    banner: profile.banner_url || undefined,
    bio: profile.bio || "",
    profileGradient: profile.profile_gradient ?? { from: "#5865f2", to: "#7c3aed", angle: 180 },
    status: profile.status ?? "online",
    plus: Boolean(profile.plus),
    plusBadgeVisible: profile.plus_badge_visible !== false,
    developer: Boolean(profile.developer),
    nicknameColor: profile.nickname_color ?? "#f2f3f5",
    nicknameColorEnabled: profile.nickname_color_enabled !== false,
    nicknameFont: profile.nickname_font ?? "default",
    nicknameFontEnabled: profile.nickname_font_enabled !== false,
    createdAt: profile.created_at,
    adminNameGradient: profile.admin_name_gradient ?? null,
  };
}

export function profileToMember(profile: MoonProfileRow): Member {
  const current = profileToCurrentUser(profile);
  return {
    id: profile.id,
    name: current.displayName,
    username: current.username,
    status: current.status === "invisible" ? "offline" : ((current.status ?? "online") as Member["status"]),
    role: "ONLINE",
    activity: "Using Moon Web",
    avatar: current.avatar,
    banner: current.banner,
    bio: current.bio,
    profileGradient: current.profileGradient,
    plus: current.plus,
    plusBadgeVisible: current.plusBadgeVisible,
    developer: current.developer,
    nicknameColor: current.nicknameColor,
    nicknameColorEnabled: current.nicknameColorEnabled,
    nicknameFont: current.nicknameFont,
    nicknameFontEnabled: current.nicknameFontEnabled,
    createdAt: current.createdAt,
    adminNameGradient: current.adminNameGradient ?? null,
  };
}

export async function getMyRemoteProfile(retries = 4): Promise<MoonProfileRow | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!error && data) return data as MoonProfileRow;
    if (attempt < retries - 1) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return null;
}

export async function findRemoteProfileByUsername(username: string): Promise<MoonProfileRow | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const key = normalizeRemoteUsername(username).replace(/^@/, "");
  const { data, error } = await supabase.from("profiles").select("*").eq("username", key).maybeSingle();
  if (error || !data) return null;
  return data as MoonProfileRow;
}

export async function updateMyRemoteProfile(patch: Partial<CurrentUser>) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false as const, message: "Supabase не настроен." };
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return { ok: false as const, message: "Нет активной сессии." };

  const dbPatch: Record<string, unknown> = {};
  if (patch.username !== undefined) {
    const validation = validateRemoteUsername(patch.username);
    if (!validation.ok) return { ok: false as const, message: validation.message };
    dbPatch.username = validation.username;
  }
  if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName.trim();
  if (patch.avatar !== undefined) dbPatch.avatar_url = patch.avatar || null;
  if (patch.banner !== undefined) dbPatch.banner_url = patch.banner || null;
  if (patch.bio !== undefined) dbPatch.bio = patch.bio;
  if (patch.profileGradient !== undefined) dbPatch.profile_gradient = patch.profileGradient;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.plus !== undefined) dbPatch.plus = patch.plus;
  if (patch.plusBadgeVisible !== undefined) dbPatch.plus_badge_visible = patch.plusBadgeVisible;
  if (patch.nicknameColor !== undefined) dbPatch.nickname_color = patch.nicknameColor;
  if (patch.nicknameColorEnabled !== undefined) dbPatch.nickname_color_enabled = patch.nicknameColorEnabled;
  if (patch.nicknameFont !== undefined) dbPatch.nickname_font = patch.nicknameFont;
  if (patch.nicknameFontEnabled !== undefined) dbPatch.nickname_font_enabled = patch.nicknameFontEnabled;

  const { data, error } = await supabase.from("profiles").update(dbPatch).eq("id", user.id).select("*").single();
  if (error) {
    const duplicate = error.code === "23505" || /duplicate|unique/i.test(error.message);
    return { ok: false as const, message: duplicate ? "Этот username уже занят." : error.message };
  }
  return { ok: true as const, profile: data as MoonProfileRow };
}

export function persistCurrentProfilePatch(patch: Partial<CurrentUser>) {
  if (!isSupabaseConfigured()) return;
  void updateMyRemoteProfile(patch).catch(() => undefined);
}
