"use client";

import { create } from "zustand";
import {
  directMessages as seedDms,
  friends as seedFriends,
  initialMessages,
  members as seedMembers,
  notices as seedNotices,
  servers as seedServers,
  type Attachment,
  type CallSession,
  type DirectMessage,
  type Friend,
  type FriendLink,
  type Member,
  type Message,
  type Notice,
  type ProfileGradient,
  type Server,
  type ServerInvite,
} from "./data";
import { getLocalAccounts, updateLocalAccount } from "./local-auth";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase/client";
import { findRemoteProfileByUsername, persistCurrentProfilePatch, profileToMember, validateRemoteUsername } from "./supabase/profile";
import { navigateMoon } from "./routes";

export type HomeTab = "online" | "all" | "pending" | "blocked" | "add" | "plus";
export type MoonTheme = "black" | "gray" | "light" | "plus";
export type VoicePeer = { id: string; name: string; username?: string; avatar: string; muted: boolean; deafened: boolean; camera: boolean; screen: boolean; speaking?: boolean };
export type BackendMode = "checking" | "online" | "offline" | "local";
export type CurrentUser = {
  id?: string;
  displayName: string;
  username: string;
  avatar: string;
  banner?: string;
  bio?: string;
  profileGradient?: ProfileGradient;
  status?: "online" | "idle" | "dnd" | "offline" | "invisible";
  plus?: boolean;
  plusBadgeVisible?: boolean;
  developer?: boolean;
  nicknameColor?: string;
  nicknameColorEnabled?: boolean;
  nicknameFont?: "default" | "serif" | "mono" | "rounded";
  nicknameFontEnabled?: boolean;
  createdAt?: string;
  adminNameGradient?: { from: string; to: string } | null;
};

export type UserSettings = {
  compactMessages: boolean;
  chatFontSize: number;
  notifications: boolean;
  dmNotifications: boolean;
  friendRequestNotifications: boolean;
  reducedMotion: boolean;
  streamerMode: boolean;
  showDmProfile: boolean;
  language: "ru" | "en";
  inputDeviceId: string;
  outputDeviceId: string;
  developerMode: boolean;
};

export type LocalSharedState = {
  servers: Server[];
  members: Member[];
  messages: Message[];
  notices: Notice[];
  directMessages: DirectMessage[];
  friendLinks: FriendLink[];
  calls: CallSession[];
  invites: ServerInvite[];
  deletedMessageIds: string[];
  actorId?: string;
  updatedAt: number;
};

type MoonState = {
  servers: Server[];
  members: Member[];
  friends: Friend[];
  friendLinks: FriendLink[];
  directMessages: DirectMessage[];
  notices: Notice[];
  calls: CallSession[];
  invites: ServerInvite[];
  deletedMessageIds: string[];
  activeServerId: string;
  activeChannelId: string;
  appView: "server" | "home";
  homeTab: HomeTab;
  activeDmId: string | null;
  memberListOpen: boolean;
  messages: Message[];
  theme: MoonTheme;
  muted: boolean;
  deafened: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  joinedVoiceId: string | null;
  voicePeers: VoicePeer[];
  voiceConnection: "disconnected" | "connecting" | "connected" | "failed";
  bannedServerIds: string[];
  replyingToId: string | null;
  backendMode: BackendMode;
  currentUser: CurrentUser;
  typing: Record<string, string[]>;
  userSettings: UserSettings;

  setActiveServer: (serverId: string) => void;
  setActiveChannel: (channelId: string) => void;
  openHome: () => void;
  setHomeTab: (tab: HomeTab) => void;
  openDm: (dmId: string) => void;
  createDm: (memberId: string) => Promise<string | null>;
  closeDm: (dmId: string) => void;
  toggleDmPin: (dmId: string) => void;
  toggleDmMute: (dmId: string) => void;
  toggleMemberList: () => void;
  addMessage: (body: string, targetId?: string, attachment?: Attachment) => void;
  editMessage: (messageId: string, body: string) => void;
  toggleReaction: (messageId: string, emoji: string) => void;
  deleteMessage: (messageId: string, moderatorServerId?: string) => Promise<void>;
  togglePin: (messageId: string) => void;
  setReplyingTo: (messageId: string | null) => void;
  createServer: (name: string) => void;
  createChannel: (name: string, type: "text" | "voice") => void;
  updateServer: (serverId: string, patch: Partial<Pick<Server, "name" | "accent" | "icon" | "banner">>) => void;
  deleteServer: (serverId: string) => void;
  leaveServer: (serverId: string) => void;
  inviteUserToServer: (serverId: string, userId: string) => void;
  createServerInvite: (serverId: string, customCode?: string) => { ok: boolean; code?: string; message?: string };
  sendServerInvite: (serverId: string, userId: string, customCode?: string) => Promise<{ ok: boolean; message: string; code?: string }>;
  acceptServerInvite: (code: string) => { ok: boolean; message: string; serverId?: string };
  createRole: (serverId: string, role: { name: string; color: string; permissions: string[] }) => void;
  updateRole: (serverId: string, roleId: string, patch: Partial<{ name: string; color: string; permissions: string[]; displaySeparately: boolean; mentionable: boolean }>) => void;
  deleteRole: (serverId: string, roleId: string) => void;
  moveRole: (serverId: string, roleId: string, direction: "up" | "down") => void;
  assignRole: (serverId: string, memberId: string, roleId: string, assigned: boolean) => void;
  setTheme: (theme: MoonTheme) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setCameraEnabled: (enabled: boolean) => void;
  setScreenShareEnabled: (enabled: boolean) => void;
  toggleVoice: (channelId: string) => void;
  setVoicePeers: (peers: VoicePeer[]) => void;
  setVoiceConnection: (state: MoonState["voiceConnection"]) => void;
  setBannedServerIds: (ids: string[]) => void;
  setBackendMode: (mode: BackendMode) => void;
  setCurrentUser: (user: CurrentUser) => void;
  updateProfile: (patch: Partial<Pick<CurrentUser, "displayName" | "username" | "avatar" | "banner" | "bio" | "profileGradient">>) => { ok: boolean; message?: string };
  sendFriendRequest: (username: string) => Promise<{ ok: boolean; message: string }>;
  respondFriendRequest: (requestId: string, action: "accept" | "reject" | "block") => Promise<void>;
  cancelFriendRequest: (requestId: string) => void;
  removeFriend: (userId: string) => void;
  blockUser: (userId: string) => void;
  markNotificationsRead: () => void;
  setPresence: (status: CurrentUser["status"]) => void;
  setTyping: (targetId: string, typing: boolean) => void;
  setUserSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  setPlusBadgeVisible: (visible: boolean) => void;
  setLocalPlusPreview: (enabled: boolean) => void;
  purchasePlus: () => void;
  setPlusStyle: (patch: Partial<Pick<CurrentUser, "nicknameColor" | "nicknameColorEnabled" | "nicknameFont" | "nicknameFontEnabled">>) => void;
  banServerMember: (serverId: string, memberId: string) => Promise<{ ok: boolean; message?: string }>;
  muteServerMember: (serverId: string, memberId: string, minutes?: number) => Promise<{ ok: boolean; message?: string }>;
  startCall: (dmId: string, peerId: string, video?: boolean) => string;
  acceptCall: (callId: string) => void;
  declineCall: (callId: string) => void;
  endCall: (callId: string) => void;
  setCallMedia: (callId: string, patch: Partial<{ muted: boolean; deafened: boolean; camera: boolean; screen: boolean }>) => void;
  hydrateLocalShared: (payload: LocalSharedState) => void;
};

const DEFAULT_SETTINGS: UserSettings = {
  compactMessages: false,
  chatFontSize: 15,
  notifications: true,
  dmNotifications: true,
  friendRequestNotifications: true,
  reducedMotion: false,
  streamerMode: false,
  showDmProfile: true,
  language: "ru",
  inputDeviceId: "default",
  outputDeviceId: "default",
  developerMode: false,
};

function makeInitialMember(user: CurrentUser): Member | null {
  if (!user.id) return null;
  return {
    id: user.id,
    name: user.displayName,
    username: user.username,
    status: user.status === "invisible" ? "offline" : (user.status ?? "online"),
    role: "ONLINE",
    activity: "Using Moon Web",
    avatar: user.avatar,
    banner: user.banner,
    bio: user.bio,
    profileGradient: user.profileGradient,
    plus: user.plus,
    plusBadgeVisible: user.plusBadgeVisible !== false,
    developer: user.developer,
    nicknameColor: user.nicknameColor,
    nicknameColorEnabled: user.nicknameColorEnabled !== false,
    nicknameFont: user.nicknameFont,
    nicknameFontEnabled: user.nicknameFontEnabled !== false,
    createdAt: user.createdAt,
    adminNameGradient: user.adminNameGradient ?? null,
  };
}

function normalizeOwnership(messages: Message[], userId?: string) {
  return messages.map((message) => ({ ...message, own: Boolean(userId && message.authorId === userId) }));
}

function mergeMembers(remote: Member[], local: Member | null) {
  const map = new Map(remote.map((member) => [member.id, member]));
  if (local) map.set(local.id, { ...(map.get(local.id) ?? {}), ...local } as Member);
  return Array.from(map.values());
}

function buildFriends(links: FriendLink[], members: Member[], userId?: string): Friend[] {
  if (!userId) return [];
  const result: Friend[] = [];
  for (const link of links) {
    if (link.fromId !== userId && link.toId !== userId) continue;
    const peerId = link.fromId === userId ? link.toId : link.fromId;
    const member = members.find((item) => item.id === peerId);
    if (!member) continue;
    if (link.status === "accepted") result.push({ ...member, relation: "friend", since: new Date(link.createdAt).toLocaleDateString() });
    if (link.status === "pending") result.push({ ...member, relation: "pending", requestId: link.id, incoming: link.toId === userId });
    if (link.status === "blocked" && link.fromId === userId) result.push({ ...member, relation: "blocked", requestId: link.id });
  }
  return result;
}

export function hasServerPermission(server: Server | undefined, userId: string | undefined, permission: string) {
  if (!server || !userId) return false;
  if (server.ownerId === userId) return true;
  const roleIds = server.roleAssignments?.[userId] ?? [];
  return (server.roles ?? []).some((role) => roleIds.includes(role.id) && (role.permissions.includes("ADMINISTRATOR") || role.permissions.includes(permission)));
}

function canAccessServer(server: Server, userId?: string) {
  if (!userId || server.bannedMemberIds?.includes(userId)) return false;
  return server.ownerId === userId || server.memberIds?.includes(userId);
}

function visibleServer(state: Pick<MoonState, "servers" | "currentUser">, excluding?: string) {
  const userId = state.currentUser.id;
  return state.servers.find((server) => server.id !== excluding && canAccessServer(server, userId));
}

function loadSettings(userId?: string): UserSettings {
  if (typeof window === "undefined" || !userId) return DEFAULT_SETTINGS;
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(`moon:settings:${userId}`) || "{}") }; }
  catch { return DEFAULT_SETTINGS; }
}

function saveSettings(userId: string | undefined, settings: UserSettings) {
  if (typeof window === "undefined" || !userId) return;
  localStorage.setItem(`moon:settings:${userId}`, JSON.stringify(settings));
}

export const useMoonStore = create<MoonState>((set, get) => ({
  servers: seedServers,
  members: seedMembers,
  friends: seedFriends,
  friendLinks: [],
  directMessages: seedDms,
  notices: seedNotices,
  calls: [],
  invites: [],
  deletedMessageIds: [],
  activeServerId: "",
  activeChannelId: "",
  appView: "home",
  homeTab: "online",
  activeDmId: null,
  memberListOpen: true,
  messages: initialMessages,
  theme: "gray",
  muted: false,
  deafened: false,
  cameraEnabled: false,
  screenShareEnabled: false,
  joinedVoiceId: null,
  voicePeers: [],
  voiceConnection: "disconnected",
  bannedServerIds: [],
  replyingToId: null,
  backendMode: "checking",
  typing: {},
  currentUser: { displayName: "Guest", username: "guest", avatar: "G", status: "online" },
  userSettings: DEFAULT_SETTINGS,

  setActiveServer: (serverId) => {
    if (get().bannedServerIds.includes(serverId)) return;
    const server = get().servers.find((item) => item.id === serverId);
    if (!server || !canAccessServer(server, get().currentUser.id)) return;
    const first = server.channels.find((channel) => channel.type === "text") ?? server.channels[0];
    set({ appView: "server", activeServerId: server.id, activeChannelId: first?.id ?? "", activeDmId: null, replyingToId: null });
    navigateMoon({ kind: "server", serverId: server.id, channelId: first?.id });
  },
  setActiveChannel: (activeChannelId) => { const serverId = get().activeServerId; set({ appView: "server", activeChannelId, replyingToId: null }); if (serverId) navigateMoon({ kind: "server", serverId, channelId: activeChannelId }); },
  openHome: () => { set({ appView: "home", activeDmId: null, replyingToId: null }); navigateMoon({ kind: "friends" }); },
  setHomeTab: (homeTab) => { set({ appView: "home", homeTab, activeDmId: null }); navigateMoon(homeTab === "plus" ? { kind: "plus" } : { kind: "friends", tab: homeTab }); },
  openDm: (activeDmId) => {
    set((state) => ({
      appView: "home",
      activeDmId,
      replyingToId: null,
      directMessages: state.directMessages.map((dm) => dm.id === activeDmId ? { ...dm, unread: 0, hiddenFor: (dm.hiddenFor ?? []).filter((id) => id !== state.currentUser.id) } : dm),
    }));
    navigateMoon({ kind: "dm", dmId: activeDmId });
  },
  createDm: async (memberId) => {
    const me = get().currentUser.id;
    if (!me || memberId === me) return null;
    const existing = get().directMessages.find((dm) => dm.participantIds?.includes(me) && dm.participantIds.includes(memberId));
    if (existing) { get().openDm(existing.id); return existing.id; }
    const participantIds = [me, memberId].sort();
    const dmId = `dm-${participantIds.join("-")}`;
    set((state) => ({ directMessages: [...state.directMessages, { id: dmId, memberId, participantIds }], appView: "home", activeDmId: dmId }));
    navigateMoon({ kind: "dm", dmId });
    return dmId;
  },
  closeDm: (dmId) => {
    const wasActive = get().activeDmId === dmId;
    set((state) => ({
      activeDmId: state.activeDmId === dmId ? null : state.activeDmId,
      directMessages: state.directMessages.map((dm) => dm.id === dmId && state.currentUser.id ? { ...dm, hiddenFor: Array.from(new Set([...(dm.hiddenFor ?? []), state.currentUser.id])) } : dm),
    }));
    if (wasActive) navigateMoon({ kind: "friends" });
  },
  toggleDmPin: (dmId) => set((state) => ({ directMessages: state.directMessages.map((dm) => {
    if (dm.id !== dmId || !state.currentUser.id) return dm;
    const pinned = dm.pinnedFor ?? [];
    return { ...dm, pinnedFor: pinned.includes(state.currentUser.id) ? pinned.filter((id) => id !== state.currentUser.id) : [...pinned, state.currentUser.id] };
  }) })),
  toggleDmMute: (dmId) => set((state) => ({ directMessages: state.directMessages.map((dm) => {
    if (dm.id !== dmId || !state.currentUser.id) return dm;
    const mutedFor = dm.mutedFor ?? [];
    return { ...dm, mutedFor: mutedFor.includes(state.currentUser.id) ? mutedFor.filter((id) => id !== state.currentUser.id) : [...mutedFor, state.currentUser.id] };
  }) })),
  toggleMemberList: () => set((state) => ({ memberListOpen: !state.memberListOpen })),

  addMessage: (body, targetId, attachment) => {
    const trimmed = body.trim();
    if (!trimmed && !attachment) return;
    const state = get();
    const channelId = targetId ?? (state.appView === "home" ? state.activeDmId ?? "" : state.activeChannelId);
    if (!channelId) return;
    if (state.appView === "server") { const server = state.servers.find((item) => item.channels.some((channel) => channel.id === channelId)); const mutedUntil = server?.mutedMembers?.[state.currentUser.id ?? ""] ?? 0; if (mutedUntil > Date.now()) return; }
    const message: Message = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId,
      author: state.currentUser.displayName,
      authorId: state.currentUser.id,
      avatar: state.currentUser.avatar,
      timestamp: new Date().toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
      body: trimmed,
      own: true,
      replyTo: state.replyingToId ?? undefined,
      attachment,
    };
    set((current) => ({ messages: [...current.messages, message], replyingToId: null }));
  },
  editMessage: (messageId, body) => {
    const clean = body.trim();
    set((state) => ({ messages: state.messages.map((message) => message.id === messageId && message.authorId === state.currentUser.id ? { ...message, body: clean || message.body, edited: true } : message) }));
  },
  toggleReaction: (messageId, emoji) => set((state) => ({ messages: state.messages.map((message) => {
    if (message.id !== messageId) return message;
    const reactions = { ...(message.reactions ?? {}) };
    const reacted = [...(message.reacted ?? [])];
    const index = reacted.indexOf(emoji);
    if (index >= 0) {
      reacted.splice(index, 1);
      reactions[emoji] = Math.max(0, (reactions[emoji] ?? 1) - 1);
      if (!reactions[emoji]) delete reactions[emoji];
    } else {
      reacted.push(emoji);
      reactions[emoji] = (reactions[emoji] ?? 0) + 1;
    }
    return { ...message, reactions, reacted };
  }) })),
  deleteMessage: async (messageId, moderatorServerId) => {
    const state = get();
    const message = state.messages.find((item) => item.id === messageId);
    const server = moderatorServerId ? state.servers.find((item) => item.id === moderatorServerId) : undefined;
    const own = Boolean(message && message.authorId === state.currentUser.id);
    const moderator = Boolean(message && server && hasServerPermission(server, state.currentUser.id, "MANAGE_MESSAGES") && server.channels.some((channel) => channel.id === message.channelId));
    if (!message || (!own && !moderator)) return;
    if (!own && moderatorServerId && isSupabaseConfigured()) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { error } = await supabase.rpc("moon_server_delete_message", { target_server_id: moderatorServerId, target_message_id: messageId });
      if (error) { console.error("Moon moderator delete denied:", error.message); return; }
    }
    set((current) => ({ messages: current.messages.filter((item) => item.id !== messageId), deletedMessageIds: Array.from(new Set([...current.deletedMessageIds, messageId])), replyingToId: current.replyingToId === messageId ? null : current.replyingToId }));
  },
  togglePin: (messageId) => set((state) => ({ messages: state.messages.map((message) => message.id === messageId ? { ...message, pinned: !message.pinned } : message) })),
  setReplyingTo: (replyingToId) => set({ replyingToId }),

  createServer: (name) => {
    const state = get();
    const clean = name.trim() || "New Server";
    const id = `server-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const server: Server = {
      id,
      name: clean,
      initials: clean.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VS",
      accent: "#5865f2",
      ownerId: state.currentUser.id,
      memberIds: state.currentUser.id ? [state.currentUser.id] : [],
      channels: [],
    };
    set((current) => ({ servers: [...current.servers, server], appView: "server", activeServerId: id, activeChannelId: "", activeDmId: null }));
    navigateMoon({ kind: "server", serverId: id });
  },
  createChannel: (name, type) => {
    const state = get();
    const server = state.servers.find((item) => item.id === state.activeServerId);
    if (!server || server.ownerId !== state.currentUser.id) return;
    const clean = (name.trim() || "new-channel").toLowerCase().replace(/\s+/g, "-");
    const id = `${state.activeServerId}-${clean}-${Date.now()}`;
    set((current) => ({ servers: current.servers.map((item) => item.id === current.activeServerId ? { ...item, channels: [...item.channels, { id, name: clean, type }] } : item), appView: "server", activeChannelId: id }));
    navigateMoon({ kind: "server", serverId: state.activeServerId, channelId: id });
  },
  updateServer: (serverId, patch) => set((state) => ({ servers: state.servers.map((server) => {
    if (server.id !== serverId || server.ownerId !== state.currentUser.id) return server;
    const name = patch.name?.trim() || server.name;
    return { ...server, ...patch, name, initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || server.initials };
  }) })),
  deleteServer: (serverId) => {
    const state = get();
    const target = state.servers.find((server) => server.id === serverId);
    if (!target || target.ownerId !== state.currentUser.id) return;
    const next = visibleServer(state, serverId);
    set({
      servers: state.servers.filter((server) => server.id !== serverId),
      messages: state.messages.filter((message) => !target.channels.some((channel) => channel.id === message.channelId)),
      ...(state.activeServerId === serverId ? (next ? { activeServerId: next.id, activeChannelId: next.channels[0]?.id ?? "" } : { appView: "home" as const, activeServerId: "", activeChannelId: "" }) : {}),
    });
    if (state.activeServerId === serverId) next ? navigateMoon({ kind: "server", serverId: next.id, channelId: next.channels[0]?.id }) : navigateMoon({ kind: "friends" });
  },
  leaveServer: (serverId) => {
    const state = get();
    const target = state.servers.find((server) => server.id === serverId);
    if (!target || target.ownerId === state.currentUser.id || !state.currentUser.id) return;
    const next = visibleServer(state, serverId);
    set({
      servers: state.servers.map((server) => server.id === serverId ? { ...server, memberIds: (server.memberIds ?? []).filter((id) => id !== state.currentUser.id) } : server),
      ...(state.activeServerId === serverId ? (next ? { activeServerId: next.id, activeChannelId: next.channels[0]?.id ?? "" } : { appView: "home" as const, activeServerId: "", activeChannelId: "" }) : {}),
    });
    if (state.activeServerId === serverId) next ? navigateMoon({ kind: "server", serverId: next.id, channelId: next.channels[0]?.id }) : navigateMoon({ kind: "friends" });
  },
  inviteUserToServer: (serverId, userId) => set((state) => ({ servers: state.servers.map((server) => {
    if (server.id !== serverId || !state.currentUser.id) return server;
    if (server.ownerId !== state.currentUser.id && !(server.memberIds ?? []).includes(state.currentUser.id)) return server;
    return { ...server, memberIds: Array.from(new Set([...(server.memberIds ?? []), userId])) };
  }) })),
  createServerInvite: (serverId, customCode) => {
    const state = get();
    const server = state.servers.find((item) => item.id === serverId);
    if (!server || !state.currentUser.id) return { ok: false, message: "Server not found." };
    if (server.ownerId !== state.currentUser.id && !(server.memberIds ?? []).includes(state.currentUser.id)) return { ok: false, message: "You are not a member of this server." };
    const normalizedCustom = customCode?.trim().replace(/[^A-Za-z0-9_-]/g, "");
    if (normalizedCustom && !state.currentUser.plus) return { ok: false, message: "Custom invite links require Moon Plus." };
    if (normalizedCustom && (normalizedCustom.length < 3 || normalizedCustom.length > 32)) return { ok: false, message: "Custom code must be 3–32 characters." };
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const randomCode = () => Array.from({ length: 9 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    if (normalizedCustom) {
      const taken = state.invites.find((invite) => invite.code.toLowerCase() === normalizedCustom.toLowerCase() && !invite.revoked);
      if (taken) {
        if (taken.serverId === serverId && taken.creatorId === state.currentUser.id) return { ok: true, code: taken.code };
        return { ok: false, message: "This custom invite is already taken." };
      }
    }
    let code = normalizedCustom || randomCode();
    while (!normalizedCustom && state.invites.some((invite) => invite.code.toLowerCase() === code.toLowerCase() && !invite.revoked)) code = randomCode();
    const invite: ServerInvite = { id: `invite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, code, serverId, creatorId: state.currentUser.id, createdAt: Date.now(), custom: Boolean(normalizedCustom) };
    set((current) => ({ invites: [...current.invites, invite] }));
    return { ok: true, code };
  },
  sendServerInvite: async (serverId, userId, customCode) => {
    const state = get();
    const server = state.servers.find((item) => item.id === serverId);
    const peer = state.members.find((item) => item.id === userId);
    if (!server || !state.currentUser.id || !peer) return { ok: false, message: "User or server not found." };
    const existingInvite = customCode ? state.invites.find((invite) => invite.serverId === serverId && invite.code.toLowerCase() === customCode.trim().toLowerCase() && !invite.revoked) : undefined;
    const created = existingInvite ? { ok: true, code: existingInvite.code } : get().createServerInvite(serverId, customCode);
    if (!created.ok || !created.code) return { ok: false, message: created.message ?? "Could not create invite." };
    const participantIds = [state.currentUser.id, userId].sort();
    const existingDm = get().directMessages.find((dm) => dm.participantIds?.includes(state.currentUser.id!) && dm.participantIds.includes(userId));
    const dmId = existingDm?.id ?? `dm-${participantIds.join("-")}`;
    const message: Message = {
      id: `invite-message-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      channelId: dmId,
      author: state.currentUser.displayName,
      authorId: state.currentUser.id,
      avatar: state.currentUser.avatar,
      timestamp: new Date().toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
      body: `moon.dev/${created.code}`,
      own: true,
      invite: { code: created.code, serverId, serverName: server.name },
    };
    set((current) => ({
      directMessages: existingDm ? current.directMessages.map((dm) => dm.id === dmId ? { ...dm, hiddenFor: (dm.hiddenFor ?? []).filter((id) => id !== state.currentUser.id && id !== userId) } : dm) : [...current.directMessages, { id: dmId, memberId: userId, participantIds }],
      messages: [...current.messages, message],
    }));
    return { ok: true, code: created.code, message: `Invite sent to @${peer.username ?? peer.name}.` };
  },
  acceptServerInvite: (code) => {
    const state = get();
    const invite = state.invites.find((item) => item.code.toLowerCase() === code.trim().toLowerCase() && !item.revoked);
    if (!invite || !state.currentUser.id) return { ok: false, message: "Invite is invalid or expired." };
    const server = state.servers.find((item) => item.id === invite.serverId);
    if (!server) return { ok: false, message: "Server no longer exists." };
    const first = server.channels.find((channel) => channel.type === "text") ?? server.channels[0];
    set((current) => ({
      servers: current.servers.map((item) => item.id === server.id ? { ...item, memberIds: Array.from(new Set([...(item.memberIds ?? []), state.currentUser.id!])) } : item),
      appView: "server",
      activeServerId: server.id,
      activeChannelId: first?.id ?? "",
      activeDmId: null,
    }));
    return { ok: true, message: `Joined ${server.name}.`, serverId: server.id };
  },
  createRole: (serverId, role) => set((state) => ({ servers: state.servers.map((server) => {
    if (server.id !== serverId || server.ownerId !== state.currentUser.id) return server;
    const nextRole = { id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: role.name.trim() || "New Role", color: role.color, position: (server.roles?.length ?? 0) + 1, displaySeparately: true, mentionable: true, permissions: role.permissions };
    return { ...server, roles: [...(server.roles ?? []), nextRole] };
  }) })),
  updateRole: (serverId, roleId, patch) => set((state) => ({ servers: state.servers.map((server) => {
    if (server.id !== serverId || server.ownerId !== state.currentUser.id) return server;
    return { ...server, roles: (server.roles ?? []).map((role) => role.id === roleId ? { ...role, ...patch, name: patch.name?.trim() || role.name } : role) };
  }) })),
  deleteRole: (serverId, roleId) => set((state) => ({ servers: state.servers.map((server) => {
    if (server.id !== serverId || server.ownerId !== state.currentUser.id) return server;
    const assignments = Object.fromEntries(Object.entries(server.roleAssignments ?? {}).map(([memberId, ids]) => [memberId, (ids as string[]).filter((id) => id !== roleId)]));
    return { ...server, roles: (server.roles ?? []).filter((role) => role.id !== roleId), roleAssignments: assignments };
  }) })),
  moveRole: (serverId, roleId, direction) => set((state) => ({ servers: state.servers.map((server) => {
    if (server.id !== serverId || server.ownerId !== state.currentUser.id) return server;
    const roles = [...(server.roles ?? [])].sort((a, b) => b.position - a.position);
    const index = roles.findIndex((role) => role.id === roleId);
    const swap = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swap < 0 || swap >= roles.length) return server;
    [roles[index], roles[swap]] = [roles[swap], roles[index]];
    const normalized = roles.map((role, i) => ({ ...role, position: roles.length - i }));
    return { ...server, roles: normalized };
  }) })),
  assignRole: (serverId, memberId, roleId, assigned) => set((state) => ({ servers: state.servers.map((server) => {
    if (server.id !== serverId || server.ownerId !== state.currentUser.id) return server;
    const current = server.roleAssignments?.[memberId] ?? [];
    const next = assigned ? Array.from(new Set([...current, roleId])) : current.filter((id) => id !== roleId);
    return { ...server, roleAssignments: { ...(server.roleAssignments ?? {}), [memberId]: next } };
  }) })),

  setTheme: (theme) => {
    if (theme === "plus" && !get().currentUser.plus) return;
    if (typeof window !== "undefined") localStorage.setItem("moon:theme", theme);
    set({ theme });
  },
  toggleMute: () => set((state) => state.muted ? { muted: false, deafened: false } : { muted: true }),
  toggleDeafen: () => set((state) => state.deafened ? { deafened: false } : { deafened: true, muted: true }),
  setCameraEnabled: (cameraEnabled) => set({ cameraEnabled }),
  setScreenShareEnabled: (screenShareEnabled) => set({ screenShareEnabled }),
  toggleVoice: (channelId) => set((state) => state.joinedVoiceId === channelId ? { joinedVoiceId: null, voicePeers: [], voiceConnection: "disconnected", cameraEnabled: false, screenShareEnabled: false } : { joinedVoiceId: channelId, voiceConnection: "connecting" }),
  setVoicePeers: (voicePeers) => set({ voicePeers }),
  setVoiceConnection: (voiceConnection) => set({ voiceConnection }),
  setBannedServerIds: (bannedServerIds) => set({ bannedServerIds }),
  setBackendMode: (backendMode) => set({ backendMode }),
  setCurrentUser: (currentUser) => set((state) => {
    const member = makeInitialMember(currentUser);
    const members = mergeMembers(state.members, member);
    const userSettings = loadSettings(currentUser.id);
    return {
      currentUser,
      members,
      theme: (typeof window !== "undefined" ? (localStorage.getItem("moon:theme") as MoonTheme | null) : null) ?? state.theme,
      friends: buildFriends(state.friendLinks, members, currentUser.id),
      messages: normalizeOwnership(state.messages, currentUser.id),
      backendMode: isSupabaseConfigured() ? "online" : "local",
      userSettings,
      appView: "home",
    };
  }),
  updateProfile: (patch) => {
    const state = get();
    if (!state.currentUser.id) return { ok: false, message: "No account is active." };
    if (patch.username !== undefined) {
      const validation = validateRemoteUsername(patch.username);
      if (!validation.ok) return { ok: false, message: validation.message };
      patch = { ...patch, username: validation.username };
    }
    try {
      let nextUser: CurrentUser = { ...state.currentUser, ...patch };
      if (isSupabaseConfigured()) {
        persistCurrentProfilePatch(patch);
      } else {
        const account = updateLocalAccount(state.currentUser.id, patch as any);
        nextUser = { ...state.currentUser, displayName: account.displayName, username: account.username, avatar: account.avatar, banner: account.banner, bio: account.bio, profileGradient: account.profileGradient, plus: account.plus, plusBadgeVisible: account.plusBadgeVisible, developer: account.developer, nicknameColor: account.nicknameColor, nicknameColorEnabled: account.nicknameColorEnabled, nicknameFont: account.nicknameFont, nicknameFontEnabled: account.nicknameFontEnabled, createdAt: account.createdAt, adminNameGradient: nextUser.adminNameGradient };
      }
      set((current) => {
        const members = current.members.map((member) => member.id === nextUser.id ? { ...member, name: nextUser.displayName, username: nextUser.username, avatar: nextUser.avatar, banner: nextUser.banner, bio: nextUser.bio, profileGradient: nextUser.profileGradient, plus: nextUser.plus, plusBadgeVisible: nextUser.plusBadgeVisible, developer: nextUser.developer, nicknameColor: nextUser.nicknameColor, nicknameColorEnabled: nextUser.nicknameColorEnabled, nicknameFont: nextUser.nicknameFont, nicknameFontEnabled: nextUser.nicknameFontEnabled, createdAt: nextUser.createdAt, adminNameGradient: nextUser.adminNameGradient } : member);
        return { currentUser: nextUser, members, friends: buildFriends(current.friendLinks, members, nextUser.id), messages: current.messages.map((message) => message.authorId === nextUser.id ? { ...message, author: nextUser.displayName, avatar: nextUser.avatar, own: true } : message) };
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Could not update profile." };
    }
  },

  sendFriendRequest: async (username) => {
    const key = username.trim().toLowerCase().replace(/^@/, "");
    const state = get();
    let target = state.members.find((member) => member.username?.toLowerCase() === key);
    if (!target && isSupabaseConfigured()) {
      try {
        const profile = await findRemoteProfileByUsername(key);
        if (profile) {
          target = profileToMember(profile);
          set((current) => ({ members: mergeMembers(current.members, target!) }));
        }
      } catch { /* Supabase may be temporarily unavailable */ }
    }
    if (!target && !isSupabaseConfigured()) {
      const local = getLocalAccounts().find((account) => account.username === key);
      if (local) {
        target = { id: local.id, name: local.displayName, username: local.username, status: local.status === "invisible" ? "offline" : local.status, role: "ONLINE", avatar: local.avatar, banner: local.banner, bio: local.bio, profileGradient: local.profileGradient, plus: local.plus, plusBadgeVisible: local.plusBadgeVisible, developer: local.developer, nicknameColor: local.nicknameColor, nicknameColorEnabled: local.nicknameColorEnabled, nicknameFont: local.nicknameFont, nicknameFontEnabled: local.nicknameFontEnabled, createdAt: local.createdAt };
        set((current) => ({ members: mergeMembers(current.members, target!) }));
      }
    }
    if (!target && !isSupabaseConfigured()) {
      try {
        const response = await fetch(`/api/local-hub/users?username=${encodeURIComponent(key)}`, { cache: "no-store" });
        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          if (data?.user?.id) {
            target = data.user as Member;
            set((current) => ({ members: mergeMembers(current.members, target!) }));
          }
        }
      } catch { /* local hub may still be starting */ }
    }
    if (!target) return { ok: false, message: "Пользователь не найден. Открой второй аккаунт Moon и попробуй ещё раз." };
    if (!state.currentUser.id) return { ok: false, message: "Нет активного аккаунта." };
    if (target.id === state.currentUser.id) return { ok: false, message: "Нельзя добавить самого себя." };
    const existing = get().friendLinks.find((link) => (link.fromId === state.currentUser.id && link.toId === target!.id) || (link.fromId === target!.id && link.toId === state.currentUser.id));
    if (existing?.status === "accepted") return { ok: false, message: "Этот пользователь уже у тебя в друзьях." };
    if (existing?.status === "pending") return { ok: false, message: "Заявка уже отправлена." };
    const link: FriendLink = { id: `friend-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, fromId: state.currentUser.id, toId: target.id, status: "pending", createdAt: Date.now() };
    set((current) => {
      const links = [...current.friendLinks.filter((item) => item.id !== existing?.id), link];
      return { friendLinks: links, friends: buildFriends(links, current.members, current.currentUser.id) };
    });
    return { ok: true, message: `Заявка @${target.username ?? target.name} отправлена.` };
  },
  respondFriendRequest: async (requestId, action) => set((state) => {
    const link = state.friendLinks.find((item) => item.id === requestId);
    if (!link || !state.currentUser.id) return state;
    let links = state.friendLinks;
    let directMessages = state.directMessages;
    if (action === "accept" && link.toId === state.currentUser.id) {
      links = links.map((item) => item.id === requestId ? { ...item, status: "accepted" as const } : item);
      const peerId = link.fromId;
      const participantIds = [state.currentUser.id, peerId].sort();
      const existing = directMessages.find((dm) => dm.participantIds?.includes(state.currentUser.id!) && dm.participantIds.includes(peerId));
      if (!existing) directMessages = [...directMessages, { id: `dm-${participantIds.join("-")}`, memberId: peerId, participantIds }];
      else directMessages = directMessages.map((dm) => dm.id === existing.id ? { ...dm, hiddenFor: (dm.hiddenFor ?? []).filter((id) => id !== state.currentUser.id && id !== peerId) } : dm);
    }
    if (action === "reject") links = links.filter((item) => item.id !== requestId);
    if (action === "block") links = links.map((item) => item.id === requestId ? { ...item, fromId: state.currentUser.id!, toId: link.fromId === state.currentUser.id ? link.toId : link.fromId, status: "blocked" as const } : item);
    return { friendLinks: links, directMessages, friends: buildFriends(links, state.members, state.currentUser.id) };
  }),
  cancelFriendRequest: (requestId) => set((state) => {
    const link = state.friendLinks.find((item) => item.id === requestId);
    if (!link || !state.currentUser.id || link.status !== "pending" || link.fromId !== state.currentUser.id) return state;
    const links = state.friendLinks.filter((item) => item.id !== requestId);
    return { friendLinks: links, friends: buildFriends(links, state.members, state.currentUser.id) };
  }),
  removeFriend: (userId) => set((state) => {
    const links = state.friendLinks.filter((link) => !((link.fromId === state.currentUser.id && link.toId === userId) || (link.toId === state.currentUser.id && link.fromId === userId)));
    return { friendLinks: links, friends: buildFriends(links, state.members, state.currentUser.id) };
  }),
  blockUser: (userId) => set((state) => {
    if (!state.currentUser.id) return state;
    const links = state.friendLinks.filter((link) => !((link.fromId === state.currentUser.id && link.toId === userId) || (link.toId === state.currentUser.id && link.fromId === userId)));
    links.push({ id: `block-${Date.now()}`, fromId: state.currentUser.id, toId: userId, status: "blocked", createdAt: Date.now() });
    return { friendLinks: links, friends: buildFriends(links, state.members, state.currentUser.id) };
  }),
  markNotificationsRead: () => set((state) => ({ notices: state.notices.map((notice) => ({ ...notice, read: true })) })),
  setPresence: (status) => {
    if (!status) return;
    const state = get();
    if (state.currentUser.id) {
      if (isSupabaseConfigured()) persistCurrentProfilePatch({ status });
      else { try { updateLocalAccount(state.currentUser.id, { status } as any); } catch { /* local profile may have been removed */ } }
    }
    set((current) => {
      const nextUser = { ...current.currentUser, status };
      const members = current.members.map((member) => member.id === nextUser.id ? { ...member, status: status === "invisible" ? "offline" : status as Member["status"] } : member);
      return { currentUser: nextUser, members, friends: buildFriends(current.friendLinks, members, nextUser.id) };
    });
  },
  setTyping: (targetId, typing) => {
    const user = get().currentUser;
    if (!user.id) return;
    window.dispatchEvent(new CustomEvent("moon:local-typing", { detail: { targetId, typing, userId: user.id, userName: user.displayName } }));
  },
  setUserSetting: (key, value) => set((state) => {
    const userSettings = { ...state.userSettings, [key]: value };
    saveSettings(state.currentUser.id, userSettings);
    return { userSettings };
  }),
  setPlusBadgeVisible: (visible) => {
    const state = get();
    if (!state.currentUser.id) return;
    if (isSupabaseConfigured()) persistCurrentProfilePatch({ plusBadgeVisible: visible });
    else { try { updateLocalAccount(state.currentUser.id, { plusBadgeVisible: visible }); } catch { /* local account may be gone */ } }
    set((current) => ({
      currentUser: { ...current.currentUser, plusBadgeVisible: visible },
      members: current.members.map((member) => member.id === current.currentUser.id ? { ...member, plusBadgeVisible: visible } : member),
    }));
  },
  setLocalPlusPreview: (enabled) => {
    const state = get();
    if (!state.currentUser.id || isSupabaseConfigured()) return;
    try { updateLocalAccount(state.currentUser.id, { plus: enabled }); } catch { return; }
    set((current) => ({ currentUser: { ...current.currentUser, plus: enabled }, members: current.members.map((member) => member.id === current.currentUser.id ? { ...member, plus: enabled } : member) }));
  },
  purchasePlus: () => {
    // Cloud MoonLobby never lets a browser grant itself PLUS. Admin/payment backends use protected RPCs.
    if (isSupabaseConfigured()) return;
    const state = get();
    if (!state.currentUser.id) return;
    const patch = { plus: true, plusBadgeVisible: true };
    try { updateLocalAccount(state.currentUser.id, patch); } catch { return; }
    set((current) => ({ currentUser: { ...current.currentUser, ...patch }, members: current.members.map((member) => member.id === current.currentUser.id ? { ...member, ...patch } : member) }));
  },
  setPlusStyle: (patch) => {
    const state = get();
    if (!state.currentUser.id || !state.currentUser.plus) return;
    if (isSupabaseConfigured()) persistCurrentProfilePatch(patch);
    else { try { updateLocalAccount(state.currentUser.id, patch as any); } catch { /* ignore */ } }
    set((current) => ({
      currentUser: { ...current.currentUser, ...patch },
      members: current.members.map((member) => member.id === current.currentUser.id ? { ...member, ...patch } : member),
    }));
  },
  banServerMember: async (serverId, memberId) => {
    const state = get();
    const server = state.servers.find((item) => item.id === serverId);
    if (!server || !hasServerPermission(server, state.currentUser.id, "BAN_MEMBERS") || memberId === server.ownerId) return { ok: false, message: "Недостаточно прав." };
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return { ok: false, message: "Supabase unavailable." };
      const { error } = await supabase.rpc("moon_server_ban_member", { target_server_id: serverId, target_user_id: memberId });
      if (error) return { ok: false, message: error.message };
    }
    set((current) => ({ servers: current.servers.map((item) => item.id !== serverId ? item : { ...item, memberIds: (item.memberIds ?? []).filter((id) => id !== memberId), bannedMemberIds: Array.from(new Set([...(item.bannedMemberIds ?? []), memberId])) }) }));
    return { ok: true };
  },
  muteServerMember: async (serverId, memberId, minutes = 60) => {
    const state = get();
    const server = state.servers.find((item) => item.id === serverId);
    if (!server || !hasServerPermission(server, state.currentUser.id, "MANAGE_MESSAGES") || memberId === server.ownerId) return { ok: false, message: "Недостаточно прав." };
    const safeMinutes = Math.max(1, minutes);
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return { ok: false, message: "Supabase unavailable." };
      const { error } = await supabase.rpc("moon_server_mute_member", { target_server_id: serverId, target_user_id: memberId, duration_minutes: safeMinutes });
      if (error) return { ok: false, message: error.message };
    }
    const until = Date.now() + safeMinutes * 60_000;
    set((current) => ({ servers: current.servers.map((item) => item.id !== serverId ? item : { ...item, mutedMembers: { ...(item.mutedMembers ?? {}), [memberId]: until } }) }));
    return { ok: true };
  },

  startCall: (dmId, peerId, video = false) => {
    const state = get();
    if (!state.currentUser.id) return "";
    const existing = state.calls.find((call) => call.dmId === dmId && call.status !== "ended");
    if (existing) return existing.id;
    const id = `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const base = { muted: state.muted, deafened: state.deafened, camera: video, screen: false };
    const call: CallSession = { id, dmId, callerId: state.currentUser.id, calleeId: peerId, status: "ringing", video, createdAt: Date.now(), participantState: { [state.currentUser.id]: base, [peerId]: { muted: false, deafened: false, camera: false, screen: false } } };
    set({ calls: [...state.calls, call], cameraEnabled: video, appView: "home", activeDmId: dmId });
    navigateMoon({ kind: "dm", dmId });
    if (typeof window !== "undefined") window.setTimeout(() => { const live = get().calls.find((item) => item.id === id); if (live?.status === "ringing") get().endCall(id); }, 45_000);
    return id;
  },
  acceptCall: (callId) => set((state) => {
    const target = state.calls.find((call) => call.id === callId);
    if (target) navigateMoon({ kind: "dm", dmId: target.dmId });
    return { calls: state.calls.map((call) => call.id === callId ? { ...call, status: "active", startedAt: Date.now() } : call), ...(target ? { appView: "home" as const, activeDmId: target.dmId, cameraEnabled: target.video } : {}) };
  }),
  declineCall: (callId) => get().endCall(callId),
  endCall: (callId) => set((state) => ({ calls: state.calls.map((call) => call.id === callId ? { ...call, status: "ended", endedAt: Date.now() } : call), cameraEnabled: false, screenShareEnabled: false })),
  setCallMedia: (callId, patch) => set((state) => {
    const userId = state.currentUser.id;
    if (!userId) return state;
    return { calls: state.calls.map((call) => call.id === callId ? { ...call, participantState: { ...call.participantState, [userId]: { ...(call.participantState[userId] ?? { muted: false, deafened: false, camera: false, screen: false }), ...patch } } } : call) };
  }),

  hydrateLocalShared: (payload) => set((state) => {
    const localMember = makeInitialMember(state.currentUser);
    const members = mergeMembers(payload.members ?? [], localMember);
    const friendLinks = payload.friendLinks ?? [];
    return {
      servers: payload.servers ?? [],
      members,
      messages: normalizeOwnership((payload.messages ?? []).filter((message) => !new Set([...(state.deletedMessageIds ?? []), ...(payload.deletedMessageIds ?? [])]).has(message.id)), state.currentUser.id),
      notices: payload.notices ?? [],
      directMessages: payload.directMessages ?? [],
      friendLinks,
      friends: buildFriends(friendLinks, members, state.currentUser.id),
      calls: payload.calls ?? [],
      invites: payload.invites ?? [],
      deletedMessageIds: Array.from(new Set([...(state.deletedMessageIds ?? []), ...(payload.deletedMessageIds ?? [])])),
    };
  }),
}));
