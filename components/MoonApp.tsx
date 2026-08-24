"use client";

import {
  AtSign,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Copy,
  Crown,
  ExternalLink,
  FileText,
  Gift,
  Hash,
  Headphones,
  Inbox,
  Image as ImageIcon,
  Languages,
  Laugh,
  Link2,
  LogOut,
  MessageCircle,
  MessageCircleReply,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  Palette,
  Pencil,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Pin,
  Plus,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  Speaker,
  Star,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  UserX,
  Video,
  VideoOff,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { KeyboardEvent, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { APP_NAME, BASE_PATH, withBasePath } from "@/lib/config";
import { type Attachment, type CallSession, type DirectMessage, type Friend, type Member, type Message, type ServerInvite } from "@/lib/data";
import { startSupabaseRealtimeSync } from "@/lib/supabase/sync";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadLocalImage } from "@/lib/media";
import { type HomeTab, useMoonStore } from "@/lib/store";

type Modal = null | "server" | "channel" | "settings" | "invite" | "serverSettings" | "editServer";
type SidePanel = null | "pins" | "inbox" | "search";
const EMPTY_TYPING: string[] = [];

function dmPeerId(dm: DirectMessage, currentUserId?: string) {
  return dm.participantIds?.find((id) => id !== currentUserId) ?? dm.memberId;
}

function useL() {
  const language = useMoonStore((s) => s.userSettings.language);
  return (ru: string, en: string) => language === "ru" ? ru : en;
}

function UserBadges({ user }: { user: Pick<Member, "plus" | "plusBadgeVisible" | "developer"> | { plus?: boolean; plusBadgeVisible?: boolean; developer?: boolean } }) {
  const openHome = useMoonStore((s) => s.openHome);
  const setHomeTab = useMoonStore((s) => s.setHomeTab);
  const l = useL();
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const openPlus = () => { openHome(); setHomeTab("plus"); };
  const showTooltip = (event: ReactMouseEvent<HTMLElement>, text: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({ text, x: rect.left + rect.width / 2, y: rect.top - 8 });
  };
  const hideTooltip = () => setTooltip(null);
  const plusText = l("Данный пользователь приобрел подписку Plus", "This user has Moon Plus");
  const developerText = l("Данный пользователь является разработчиком Moon!", "This user is a Moon developer!");
  return <span className="user-badges">
    {user.plus && user.plusBadgeVisible !== false && <span role="button" tabIndex={0} className="user-badge plus-badge" aria-label="Moon Plus" onClick={(event) => { event.preventDefault(); event.stopPropagation(); hideTooltip(); openPlus(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); hideTooltip(); openPlus(); } }} onMouseEnter={(event) => showTooltip(event, plusText)} onMouseLeave={hideTooltip} onFocus={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setTooltip({ text: plusText, x: rect.left + rect.width / 2, y: rect.top - 8 }); }} onBlur={hideTooltip}><Crown size={12}/></span>}
    {user.developer && <span className="user-badge developer-badge" onMouseEnter={(event) => showTooltip(event, developerText)} onMouseLeave={hideTooltip}><Code2 size={12}/></span>}
    {tooltip && typeof document !== "undefined" ? createPortal(<div className="global-badge-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>, document.body) : null}
  </span>;
}

function NameStyle({ user, children }: { user?: Pick<Member, "nicknameColor" | "nicknameFont" | "plus"> | { nicknameColor?: string; nicknameFont?: string; plus?: boolean }; children: ReactNode }) {
  const font = user?.plus ? user.nicknameFont : "default";
  const className = `nickname-style nickname-${font ?? "default"}`;
  return <span className={className} style={user?.plus && user.nicknameColor ? { color: user.nicknameColor } : undefined}>{children}</span>;
}


function isImageSource(label?: string) {
  return Boolean(label) && (label!.startsWith("data:image") || label!.startsWith("http://") || label!.startsWith("https://") || label!.startsWith("blob:") || label!.startsWith("/") || /\.(?:gif|png|jpe?g|webp|avif)(?:\?|#|$)/i.test(label!));
}

function Avatar({ label, status, large = false }: { label: string; status?: "online" | "idle" | "dnd" | "offline"; large?: boolean }) {
  return <span className={`avatar ${large ? "large" : ""}`}>{isImageSource(label) ? <img src={label} alt="" draggable={false}/> : label}{status && <i className={`status ${status}`} />}</span>;
}

function CallAvatar({ label, name }: { label: string; name: string }) {
  return <div className="call-avatar-shell">{isImageSource(label) ? <img src={label} alt={name} draggable={false}/> : <span className="call-avatar-initial">{label || name.slice(0, 1).toUpperCase()}</span>}</div>;
}

function BannerMedia({ className, src }: { className: string; src?: string }) {
  return <div className={`${className} banner-media`}>{src ? <img className="banner-media-image" src={src} alt="" draggable={false}/> : null}</div>;
}

function IconButton({ label, onClick, active, danger, children }: { label: string; onClick?: () => void; active?: boolean; danger?: boolean; children: ReactNode }) {
  return <button className={`icon-button ${active ? "active" : ""} ${danger ? "danger" : ""}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function LinkifiedText({ text }: { text?: string }) {
  const l = useL();
  if (!text) return <span className="muted-copy">{l("Описание пока не добавлено.", "No description yet.")}</span>;
  const parts = text.split(/((?:https?:\/\/[^\s]+)|(?:moon\.(?:dev|dex)\/[A-Za-z0-9_-]+))/gi);
  return <>{parts.map((part, index) => {
    if (/^moon\.(?:dev|dex)\//i.test(part)) {
      const code = part.split("/").pop() ?? "";
      return <a key={`${part}-${index}`} href={`${BASE_PATH}/?invite=${encodeURIComponent(code)}`}>{part}<Link2 size={11}/></a>;
    }
    if (/^https?:\/\//i.test(part)) return <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">{part}<ExternalLink size={11}/></a>;
    return <span key={`${part}-${index}`}>{part}</span>;
  })}</>;
}

function ServerRail({ openServerModal, openInviteModal, openEditServer, openServerSettings }: { openServerModal: () => void; openInviteModal: (serverId: string) => void; openEditServer: (serverId: string) => void; openServerSettings: (serverId: string) => void }) {
  const servers = useMoonStore((s) => s.servers);
  const appView = useMoonStore((s) => s.appView);
  const activeServerId = useMoonStore((s) => s.activeServerId);
  const currentUser = useMoonStore((s) => s.currentUser);
  const setActiveServer = useMoonStore((s) => s.setActiveServer);
  const openHome = useMoonStore((s) => s.openHome);
  const deleteServer = useMoonStore((s) => s.deleteServer);
  const leaveServer = useMoonStore((s) => s.leaveServer);
  const l = useL();
  const [context, setContext] = useState<{ serverId: string; x: number; y: number } | null>(null);
  const visibleServers = servers.filter((server) => server.ownerId === currentUser.id || server.memberIds?.includes(currentUser.id ?? ""));
  const contextServer = context ? servers.find((server) => server.id === context.serverId) : undefined;
  const isOwner = Boolean(contextServer && contextServer.ownerId === currentUser.id);

  useEffect(() => {
    if (!context) return;
    const close = () => setContext(null);
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [context]);

  const activate = (serverId: string, action: () => void) => { setActiveServer(serverId); setContext(null); action(); };

  return <aside className="server-rail" onContextMenu={(event) => event.preventDefault()}>
    <div className="server-wrap">{appView === "home" && <span className="active-pill"/>}<button onClick={openHome} className={`server-button home-server ${appView === "home" ? "is-active" : ""}`} title={l("Личные сообщения", "Direct Messages")}><img src={withBasePath("/logo.png")} alt="Moon" className="moon-home-logo"/></button></div>
    <div className="rail-divider"/>
    {visibleServers.map((server) => <div key={server.id} className="server-wrap">{appView === "server" && activeServerId === server.id && <span className="active-pill"/>}<button onClick={() => setActiveServer(server.id)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContext({ serverId: server.id, x: event.clientX, y: event.clientY }); }} className={`server-button ${appView === "server" && activeServerId === server.id ? "is-active" : ""}`} style={{ "--server-accent": server.accent } as CSSProperties} title={`${server.name} · Right click`}>{server.icon ? <img className="server-icon-image" src={server.icon} alt=""/> : server.initials}</button></div>)}
    <button className="server-button utility green" onClick={openServerModal} title={l("Создать сервер", "Create server")}><Plus size={24}/></button>
    {context && contextServer && <div className="context-menu server-context-menu" style={{ left: Math.min(context.x, window.innerWidth - 230), top: Math.min(context.y, window.innerHeight - 270) }} onClick={(event) => event.stopPropagation()}>
      <div className="context-title">{contextServer.name}</div>
      <button onClick={() => activate(contextServer.id, () => openInviteModal(contextServer.id))}><UserPlus size={16}/> {l("Пригласить людей", "Invite People")}</button>
      {isOwner && <button onClick={() => activate(contextServer.id, () => openEditServer(contextServer.id))}><Pencil size={16}/> {l("Редактировать сервер", "Edit Server")}</button>}
      {isOwner && <button onClick={() => activate(contextServer.id, () => openServerSettings(contextServer.id))}><Settings size={16}/> {l("Настройки сервера", "Server Settings")}</button>}
      <div className="context-separator"/>
      {isOwner ? <button className="danger" onClick={() => { if (window.confirm(`Delete ${contextServer.name}?`)) deleteServer(contextServer.id); setContext(null); }}><Trash2 size={16}/> {l("Удалить сервер", "Delete Server")}</button> : <button className="danger" onClick={() => { if (window.confirm(`Leave ${contextServer.name}?`)) leaveServer(contextServer.id); setContext(null); }}><LogOut size={16}/> {l("Покинуть сервер", "Leave Server")}</button>}
    </div>}
  </aside>;
}

function SelfProfilePopout({ close, openSettings }: { close: () => void; openSettings: (page?: string) => void }) {
  const user = useMoonStore((s) => s.currentUser);
  const developerMode = useMoonStore((s) => s.userSettings.developerMode);
  const setPresence = useMoonStore((s) => s.setPresence);
  const l = useL();
  const [statusOpen, setStatusOpen] = useState(false);
  const gradient = user.profileGradient ?? { from: "#5865f2", to: "#7c3aed", angle: 135 };
  const visibleStatus = user.status === "invisible" ? "offline" : (user.status ?? "online");
  const labels: Record<string, string> = { online: l("В сети", "Online"), idle: l("Неактивен", "Idle"), dnd: l("Не беспокоить", "Do Not Disturb"), invisible: l("Невидимый", "Invisible"), offline: l("Не в сети", "Offline") };
  return <div className="self-profile-popout" style={{ "--profile-from": gradient.from, "--profile-to": gradient.to, "--profile-angle": `${gradient.angle}deg` } as CSSProperties} onClick={(e) => e.stopPropagation()}>
    <BannerMedia className="self-pop-banner" src={user.banner}/>
    <div className="self-pop-avatar"><Avatar label={user.avatar} status={visibleStatus as any} large/></div>
    <button className="self-pop-close" onClick={close}><X size={15}/></button>
    <div className="self-pop-body">
      <h2>{user.displayName}<UserBadges user={user}/></h2><div className="self-pop-username">@{user.username}</div>
      <div className="self-bio"><LinkifiedText text={user.bio}/></div>
      <button className="self-edit" onClick={() => { close(); openSettings("Profiles"); }}><Pencil size={15}/> {l("Редактировать профиль", "Edit Profile")}</button>
      <div className="self-pop-separator"/>
      <div className="status-picker-wrap">
        <button className="self-menu-row" onClick={() => setStatusOpen((v) => !v)}><i className={`status-option ${user.status ?? "online"}`}/><span>{labels[user.status ?? "online"]}</span><ChevronDown size={15}/></button>
        {statusOpen && <div className="self-status-submenu">{(["online","idle","dnd","invisible"] as const).map((status) => <button key={status} onClick={() => { setPresence(status); setStatusOpen(false); }}><i className={`status-option ${status}`}/>{labels[status]}</button>)}</div>}
      </div>
      {developerMode && <button className="self-menu-row" onClick={() => navigator.clipboard?.writeText(user.id ?? "")}><Copy size={15}/><span>{l("Копировать ID пользователя", "Copy User ID")}</span><small>{user.id?.slice(-8)}</small></button>}
      <button className="self-menu-row" onClick={() => { close(); window.dispatchEvent(new Event("moon:logout")); }}><LogOut size={15}/><span>{l("Сменить аккаунт", "Switch Accounts")}</span></button>
    </div>
  </div>;
}

function UserPanel({ openSettings }: { openSettings: (page?: string) => void }) {
  const muted = useMoonStore((s) => s.muted);
  const deafened = useMoonStore((s) => s.deafened);
  const toggleMute = useMoonStore((s) => s.toggleMute);
  const toggleDeafen = useMoonStore((s) => s.toggleDeafen);
  const currentUser = useMoonStore((s) => s.currentUser);
  const [profileOpen, setProfileOpen] = useState(false);
  const visibleStatus = currentUser.status === "invisible" ? "offline" : (currentUser.status ?? "online");

  useEffect(() => {
    if (!profileOpen) return;
    const close = () => setProfileOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [profileOpen]);

  return <div className="user-panel">
    <div className="self-profile-wrap">
      <button className="self-profile" onClick={(e) => { e.stopPropagation(); setProfileOpen((v) => !v); }}><Avatar label={currentUser.avatar} status={visibleStatus as any}/><span><strong>{currentUser.displayName}<UserBadges user={currentUser}/></strong><small>@{currentUser.username}</small></span></button>
      {profileOpen && <SelfProfilePopout close={() => setProfileOpen(false)} openSettings={openSettings}/>} 
    </div>
    <div className="user-actions"><IconButton label={muted ? "Unmute" : "Mute"} active={muted} onClick={toggleMute}>{muted ? <MicOff size={18}/> : <Mic size={18}/>}</IconButton><IconButton label={deafened ? "Undeafen" : "Deafen"} active={deafened} onClick={toggleDeafen}>{deafened ? <VolumeX size={18}/> : <Headphones size={18}/>}</IconButton><IconButton label="User Settings" onClick={() => openSettings("My Account")}><Settings size={18}/></IconButton></div>
  </div>;
}

function ChannelCategory({ title, collapsed, onToggle, onAdd, children }: { title: string; collapsed?: boolean; onToggle: () => void; onAdd: () => void; children: ReactNode }) {
  const l = useL();
  return <section className="channel-category"><div className="category-header"><button onClick={onToggle}><ChevronDown size={12} className={collapsed ? "collapsed-chevron" : ""}/>{title}</button><button onClick={onAdd} title={l("Создать канал", "Create channel")}><Plus size={16}/></button></div>{!collapsed && children}</section>;
}

function ChannelSidebar({ openChannelModal, openInviteModal, openServerSettings, openSettings }: { openChannelModal: () => void; openInviteModal: () => void; openServerSettings: () => void; openSettings: (page?: string) => void }) {
  const servers = useMoonStore((s) => s.servers);
  const activeServerId = useMoonStore((s) => s.activeServerId);
  const activeChannelId = useMoonStore((s) => s.activeChannelId);
  const joinedVoiceId = useMoonStore((s) => s.joinedVoiceId);
  const setActiveChannel = useMoonStore((s) => s.setActiveChannel);
  const toggleVoice = useMoonStore((s) => s.toggleVoice);
  const currentUser = useMoonStore((s) => s.currentUser);
  const l = useL();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [serverMenu, setServerMenu] = useState(false);
  const server = servers.find((item) => item.id === activeServerId);
  if (!server) return <HomeSidebar openSettings={openSettings}/>;
  const textChannels = server.channels.filter((c) => c.type === "text");
  const voiceChannels = server.channels.filter((c) => c.type === "voice");
  const joinedChannel = server.channels.find((c) => c.id === joinedVoiceId);
  const isOwner = server.ownerId === currentUser.id;

  return <aside className="channel-sidebar">
    <div className="server-title-wrap"><button className="server-title" onClick={() => setServerMenu((v) => !v)}><span>{server.name}</span><ChevronDown size={18} className={serverMenu ? "rotated" : ""}/></button>{serverMenu && <div className="server-dropdown" onMouseLeave={() => setServerMenu(false)}><button onClick={() => { setServerMenu(false); openInviteModal(); }}><UserPlus size={16}/> Invite People</button>{isOwner && <button onClick={() => { setServerMenu(false); openChannelModal(); }}><Plus size={16}/> Create Channel</button>}{isOwner && <button onClick={() => { setServerMenu(false); openServerSettings(); }}><Settings size={16}/> Server Settings</button>}</div>}</div>
    <div className="channel-scroll">
      <ChannelCategory title={l("ТЕКСТОВЫЕ КАНАЛЫ", "TEXT CHANNELS")} collapsed={collapsed.text} onToggle={() => setCollapsed((s) => ({ ...s, text: !s.text }))} onAdd={openChannelModal}>{textChannels.map((channel) => <button key={channel.id} onClick={() => setActiveChannel(channel.id)} className={`channel-item ${activeChannelId === channel.id ? "active" : ""}`}><Hash size={18}/><span>{channel.name}</span></button>)}</ChannelCategory>
      <ChannelCategory title={l("ГОЛОСОВЫЕ КАНАЛЫ", "VOICE CHANNELS")} collapsed={collapsed.voice} onToggle={() => setCollapsed((s) => ({ ...s, voice: !s.voice }))} onAdd={openChannelModal}>{voiceChannels.map((channel) => <button key={channel.id} onClick={() => setActiveChannel(channel.id)} className={`channel-item ${activeChannelId === channel.id ? "active" : ""}`}><Speaker size={18}/><span>{channel.name}</span>{joinedVoiceId === channel.id && <span className="voice-live">LIVE</span>}</button>)}</ChannelCategory>
      {!textChannels.length && !voiceChannels.length && <div className="sidebar-empty"><Hash size={24}/><span>{l("Каналов пока нет", "No channels yet")}</span>{isOwner && <button onClick={openChannelModal}>{l("Создать канал", "Create Channel")}</button>}</div>}
    </div>
    {joinedChannel && <div className="voice-connected"><div><strong>{l("ГОЛОС ПОДКЛЮЧЁН", "VOICE CONNECTED")}</strong><span>{joinedChannel.name}</span><small>{server.name}</small></div><div><IconButton label="Disconnect" danger onClick={() => toggleVoice(joinedChannel.id)}><PhoneOff size={17}/></IconButton></div></div>}
    <UserPanel openSettings={openSettings}/>
  </aside>;
}

function DmContextMenu({ dm, member, x, y, close }: { dm: DirectMessage; member: Member; x: number; y: number; close: () => void }) {
  const currentUser = useMoonStore((s) => s.currentUser);
  const openDm = useMoonStore((s) => s.openDm);
  const closeDm = useMoonStore((s) => s.closeDm);
  const toggleDmPin = useMoonStore((s) => s.toggleDmPin);
  const toggleDmMute = useMoonStore((s) => s.toggleDmMute);
  const startCall = useMoonStore((s) => s.startCall);
  const sendFriendRequest = useMoonStore((s) => s.sendFriendRequest);
  const removeFriend = useMoonStore((s) => s.removeFriend);
  const blockUser = useMoonStore((s) => s.blockUser);
  const sendServerInvite = useMoonStore((s) => s.sendServerInvite);
  const servers = useMoonStore((s) => s.servers);
  const friends = useMoonStore((s) => s.friends);
  const relation = friends.find((friend) => friend.id === member.id)?.relation;
  const l = useL();
  const pinned = dm.pinnedFor?.includes(currentUser.id ?? "");
  const muted = dm.mutedFor?.includes(currentUser.id ?? "");
  const [serverSubmenu, setServerSubmenu] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const visibleServers = servers.filter((server) => server.ownerId === currentUser.id || server.memberIds?.includes(currentUser.id ?? ""));
  const addNote = () => { const note = window.prompt(`Private note for ${member.name}`, localStorage.getItem(`moon:note:${currentUser.id}:${member.id}`) ?? ""); if (note !== null) localStorage.setItem(`moon:note:${currentUser.id}:${member.id}`, note); close(); };
  return <>
    <div className="context-menu dm-context-menu" style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 500) }} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => { openDm(dm.id); close(); }}><Check size={16}/> {l("Отметить прочитанным", "Mark as Read")}</button>
      <button onClick={() => { toggleDmPin(dm.id); close(); }}><Pin size={16}/> {pinned ? l("Открепить", "Unpin") : l("Закрепить", "Pin")}</button>
      <button onClick={() => { toggleDmPin(dm.id); close(); }}><Star size={16}/> {pinned ? l("Убрать из избранного", "Remove from Favourites") : l("Добавить в избранное", "Add to Favourites")}</button>
      <div className="context-separator"/>
      <button onClick={() => setProfileOpen(true)}><Users size={16}/> {l("Профиль", "Profile")}</button>
      <button onClick={() => { startCall(dm.id, member.id, false); close(); }}><Phone size={16}/> {l("Начать звонок", "Start a Call")}</button>
      <button onClick={addNote}><Pencil size={16}/> {l("Добавить заметку", "Add Note")}</button>
      <button onClick={() => { closeDm(dm.id); close(); }}><X size={16}/> {l("Закрыть личные сообщения", "Close DM")}</button>
      <div className="context-separator"/>
      <button onClick={() => setServerSubmenu((v) => !v)}><UserPlus size={16}/> {l("Пригласить на сервер", "Invite to Server")} <ChevronDown size={14}/></button>
      {serverSubmenu && <div className="dm-server-submenu">{visibleServers.length ? visibleServers.map((server) => <button key={server.id} onClick={() => { void sendServerInvite(server.id, member.id); close(); }}>{server.icon ? <img src={server.icon} alt=""/> : <b>{server.initials}</b>}<span>{server.name}</span></button>) : <small>{l("Нет доступных серверов", "No servers available")}</small>}</div>}
      {relation === "friend" ? <button onClick={() => { removeFriend(member.id); close(); }}><UserMinus size={16}/> {l("Удалить из друзей", "Remove Friend")}</button> : <button onClick={() => { void sendFriendRequest(member.username ?? member.name); close(); }}><UserPlus size={16}/> {l("Добавить в друзья", "Add Friend")}</button>}
      <button className="danger" onClick={() => { blockUser(member.id); close(); }}><UserX size={16}/> {l("Заблокировать", "Block")}</button>
      <button onClick={() => { toggleDmMute(dm.id); close(); }}>{muted ? <Bell size={16}/> : <BellOff size={16}/>} {muted ? l("Включить уведомления", "Unmute") : l("Отключить уведомления", "Mute")}</button>
    </div>
    {profileOpen && <ProfilePopout memberId={member.id} close={() => { setProfileOpen(false); close(); }}/>} 
  </>;
}

function HomeSidebar({ openSettings }: { openSettings: (page?: string) => void }) {
  const activeDmId = useMoonStore((s) => s.activeDmId);
  const openDm = useMoonStore((s) => s.openDm);
  const closeDm = useMoonStore((s) => s.closeDm);
  const setHomeTab = useMoonStore((s) => s.setHomeTab);
  const dms = useMoonStore((s) => s.directMessages);
  const memberList = useMoonStore((s) => s.members);
  const friendList = useMoonStore((s) => s.friends);
  const currentUser = useMoonStore((s) => s.currentUser);
  const l = useL();
  const [query, setQuery] = useState("");
  const [context, setContext] = useState<{ dmId: string; x: number; y: number } | null>(null);
  const shown = dms.filter((dm) => dm.participantIds?.includes(currentUser.id ?? "") && !dm.hiddenFor?.includes(currentUser.id ?? "")).filter((dm) => {
    const peerId = dmPeerId(dm, currentUser.id);
    const member = memberList.find((m) => m.id === peerId) ?? friendList.find((m) => m.id === peerId);
    return member?.name.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => Number(b.pinnedFor?.includes(currentUser.id ?? "")) - Number(a.pinnedFor?.includes(currentUser.id ?? "")));
  const contextDm = context ? dms.find((dm) => dm.id === context.dmId) : undefined;
  const contextPeerId = contextDm ? dmPeerId(contextDm, currentUser.id) : undefined;
  const contextMember = contextPeerId ? memberList.find((m) => m.id === contextPeerId) ?? friendList.find((m) => m.id === contextPeerId) : undefined;

  useEffect(() => {
    if (!context) return;
    const close = () => setContext(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [context]);

  return <aside className="channel-sidebar dm-sidebar">
    <div className="dm-search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={l("Найти или начать беседу", "Find or start a conversation")}/></div>
    <div className="dm-nav"><button className={!activeDmId ? "active" : ""} onClick={() => setHomeTab("online")}><Users size={20}/> {l("Друзья", "Friends")}</button><button onClick={() => setHomeTab("plus")}><Gift size={20}/> Moon Plus</button></div>
    <div className="dm-heading"><span>{l("ЛИЧНЫЕ СООБЩЕНИЯ", "DIRECT MESSAGES")}</span><button title={l("Новое личное сообщение", "New DM")} onClick={() => setHomeTab("all")}><Plus size={15}/></button></div>
    <div className="dm-list">{shown.map((dm) => { const peerId = dmPeerId(dm, currentUser.id); const member = memberList.find((m) => m.id === peerId) ?? friendList.find((m) => m.id === peerId); if (!member) return null; const pinned = dm.pinnedFor?.includes(currentUser.id ?? ""); return <div key={dm.id} className={`dm-item-wrap ${activeDmId === dm.id ? "active" : ""}`} onContextMenu={(e) => { e.preventDefault(); setContext({ dmId: dm.id, x: e.clientX, y: e.clientY }); }}><button onClick={() => openDm(dm.id)} className={`dm-item ${activeDmId === dm.id ? "active" : ""}`}><Avatar label={member.avatar} status={member.status}/><span><strong><NameStyle user={member}>{member.name}</NameStyle><UserBadges user={member}/></strong><small>{member.activity ?? member.status}</small></span>{pinned && <Pin size={12} className="dm-pinned"/>}{dm.unread ? <b className="dm-badge">{dm.unread}</b> : null}</button><button className="dm-close-fixed" title={l("Закрыть личные сообщения", "Close DM")} onClick={(e) => { e.stopPropagation(); closeDm(dm.id); }}><X size={15}/></button></div>; })}</div>
    <UserPanel openSettings={openSettings}/>
    {context && contextDm && contextMember && <DmContextMenu dm={contextDm} member={contextMember} x={context.x} y={context.y} close={() => setContext(null)}/>} 
  </aside>;
}

function ChatHeader({ openPanel, onSearch }: { openPanel: (panel: SidePanel) => void; onSearch: (value: string) => void }) {
  const servers = useMoonStore((s) => s.servers);
  const activeServerId = useMoonStore((s) => s.activeServerId);
  const activeChannelId = useMoonStore((s) => s.activeChannelId);
  const toggleMemberList = useMoonStore((s) => s.toggleMemberList);
  const memberListOpen = useMoonStore((s) => s.memberListOpen);
  const l = useL();
  const [searchValue, setSearchValue] = useState("");
  const server = servers.find((item) => item.id === activeServerId);
  const channel = server?.channels.find((item) => item.id === activeChannelId);
  return <header className="chat-header"><div className="channel-heading">{channel?.type === "voice" ? <Speaker size={22}/> : <Hash size={22}/>}<strong>{channel?.name ?? "channel"}</strong><span className="header-divider"/><span className="channel-topic">{server?.name ?? APP_NAME}</span></div><div className="header-actions"><IconButton label="Pinned messages" onClick={() => openPanel("pins")}><Pin size={20}/></IconButton><IconButton label={memberListOpen ? "Hide member list" : "Show member list"} onClick={toggleMemberList}><Users size={20}/></IconButton><label className="searchbox"><input value={searchValue} onChange={(e) => setSearchValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSearch(searchValue); }} placeholder={l("Поиск", "Search")}/><Search size={16}/></label><IconButton label="Inbox" onClick={() => openPanel("inbox")}><Inbox size={20}/></IconButton><IconButton label="Help"><CircleHelp size={20}/></IconButton></div></header>;
}

function DmHeader({ member, dmId }: { member: Member; dmId: string }) {
  const startCall = useMoonStore((s) => s.startCall);
  const toggleDmPin = useMoonStore((s) => s.toggleDmPin);
  const sendFriendRequest = useMoonStore((s) => s.sendFriendRequest);
  const friends = useMoonStore((s) => s.friends);
  const isFriend = friends.some((friend) => friend.id === member.id && friend.relation === "friend");
  return <header className="chat-header dm-chat-header"><div className="channel-heading"><AtSign size={22}/><strong><NameStyle user={member}>{member.name}</NameStyle><UserBadges user={member}/></strong><span className="header-divider"/><span className="channel-topic">@{member.username ?? member.name.toLowerCase()}</span></div><div className="header-actions"><IconButton label="Start voice call" onClick={() => startCall(dmId, member.id, false)}><Phone size={20}/></IconButton><IconButton label="Start video call" onClick={() => startCall(dmId, member.id, true)}><Video size={20}/></IconButton><IconButton label="Pin conversation" onClick={() => toggleDmPin(dmId)}><Pin size={20}/></IconButton>{!isFriend && <IconButton label="Add friend" onClick={() => void sendFriendRequest(member.username ?? member.name)}><UserPlus size={20}/></IconButton>}</div></header>;
}

function MessageList({ targetId, title, direct = false }: { targetId: string; title: string; direct?: boolean }) {
  const messages = useMoonStore((s) => s.messages);
  const toggleReaction = useMoonStore((s) => s.toggleReaction);
  const deleteMessage = useMoonStore((s) => s.deleteMessage);
  const l = useL();
  const listRef = useRef<HTMLDivElement>(null);
  const current = messages.filter((message) => message.channelId === targetId);
  useEffect(() => { const node = listRef.current; if (node) node.scrollTop = node.scrollHeight; }, [current.length, targetId]);
  return <div className="message-list" ref={listRef}><div className="channel-intro"><div className="intro-icon">{direct ? <AtSign size={34}/> : <Hash size={34}/>}</div><h1>{direct ? title : l(`Добро пожаловать в #${title}`, `Welcome to #${title}`)}</h1><p>{direct ? l(`Это начало истории личных сообщений с ${title}.`, `This is the beginning of your direct message history with ${title}.`) : l(`Это начало канала #${title}.`, `This is the start of the #${title} channel.`)}</p></div>{current.length === 0 && <div className="empty-chat">{l("Сообщений пока нет. Начни переписку.", "No messages here yet. Start the conversation.")}</div>}{current.map((message) => <MessageRow key={message.id} message={message} toggleReaction={toggleReaction} deleteMessage={deleteMessage}/>)}</div>;
}

function MessageRow({ message, toggleReaction, deleteMessage }: { message: Message; toggleReaction: (id: string, emoji: string) => void; deleteMessage: (id: string) => void }) {
  const editMessage = useMoonStore((s) => s.editMessage);
  const messages = useMoonStore((s) => s.messages);
  const members = useMoonStore((s) => s.members);
  const setReplyingTo = useMoonStore((s) => s.setReplyingTo);
  const togglePin = useMoonStore((s) => s.togglePin);
  const l = useL();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const replied = message.replyTo ? messages.find((m) => m.id === message.replyTo) : undefined;
  const authorMember = message.authorId ? members.find((m) => m.id === message.authorId) : undefined;
  useEffect(() => setDraft(message.body), [message.body]);
  return <article className={`message-row ${message.pinned ? "is-pinned" : ""}`} onContextMenu={(event) => { event.preventDefault(); setMenu(true); }}><Avatar label={authorMember?.avatar ?? message.avatar}/><div className="message-content">{replied && <div className="reply-preview"><MessageCircleReply size={13}/><strong>{replied.author}</strong><span>{replied.body || replied.attachment?.name}</span></div>}<div className="message-meta"><strong><NameStyle user={authorMember}>{authorMember?.name ?? message.author}</NameStyle>{authorMember && <UserBadges user={authorMember}/>}</strong><span>{message.timestamp}</span>{message.edited && <span>{l("(изменено)", "(edited)")}</span>}{message.pinned && <Pin size={12}/>}</div>{editing ? <input className="inline-edit" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { editMessage(message.id, draft); setEditing(false); } if (e.key === "Escape") { setDraft(message.body); setEditing(false); } }} autoFocus/> : message.body ? <p><LinkifiedText text={message.body}/></p> : null}{message.invite && <ServerInviteCard invite={message.invite}/>} {message.attachment && <AttachmentCard attachment={message.attachment}/>} {message.reactions && <div className="reaction-row">{Object.entries(message.reactions).map(([emoji, count]) => <button className={message.reacted?.includes(emoji) ? "reacted" : ""} key={emoji} onClick={() => toggleReaction(message.id, emoji)}>{emoji} <span>{count}</span></button>)}</div>}</div><div className="message-toolbar"><IconButton label={l("Добавить реакцию", "Add reaction")} onClick={() => toggleReaction(message.id, "👍")}><Laugh size={16}/></IconButton><IconButton label={l("Ответить", "Reply")} onClick={() => setReplyingTo(message.id)}><MessageCircleReply size={16}/></IconButton><IconButton label={message.pinned ? l("Открепить", "Unpin") : l("Закрепить", "Pin")} onClick={() => togglePin(message.id)}><Pin size={16}/></IconButton><IconButton label={l("Ещё", "More")} onClick={() => setMenu((v) => !v)}><MoreHorizontal size={17}/></IconButton></div>{menu && <div className="context-menu" onMouseLeave={() => setMenu(false)}><button onClick={() => { toggleReaction(message.id, "🔥"); setMenu(false); }}><Smile size={16}/> {l("Добавить реакцию", "Add Reaction")}</button><button onClick={() => { setReplyingTo(message.id); setMenu(false); }}><MessageCircleReply size={16}/> {l("Ответить", "Reply")}</button><button onClick={() => { togglePin(message.id); setMenu(false); }}><Pin size={16}/> {message.pinned ? l("Открепить сообщение", "Unpin Message") : l("Закрепить сообщение", "Pin Message")}</button><button onClick={() => navigator.clipboard?.writeText(message.body)}><Copy size={16}/> {l("Копировать текст", "Copy Text")}</button>{message.own && <button onClick={() => { setEditing(true); setMenu(false); }}><Pencil size={16}/> {l("Изменить сообщение", "Edit Message")}</button>}{message.own && <button className="danger" onClick={() => deleteMessage(message.id)}><Trash2 size={16}/> {l("Удалить сообщение", "Delete Message")}</button>}</div>}</article>;
}

function ServerInviteCard({ invite }: { invite: { code: string; serverId: string; serverName: string } }) {
  const servers = useMoonStore((s) => s.servers);
  const currentUser = useMoonStore((s) => s.currentUser);
  const acceptInvite = useMoonStore((s) => s.acceptServerInvite);
  const l = useL();
  const server = servers.find((item) => item.id === invite.serverId);
  const joined = Boolean(server && (server.ownerId === currentUser.id || server.memberIds?.includes(currentUser.id ?? "")));
  return <div className="server-invite-card"><div className="server-invite-kicker">{l("ТЕБЯ ПРИГЛАСИЛИ НА СЕРВЕР", "YOU'VE BEEN INVITED TO JOIN A SERVER")}</div><div className="server-invite-main"><div className="server-invite-icon" style={{ background: server?.accent ?? "#5865f2" }}>{server?.icon ? <img src={server.icon} alt=""/> : server?.initials ?? "V"}</div><div><strong>{server?.name ?? invite.serverName}</strong><span>moon.dev/{invite.code}</span></div><button disabled={joined || !server} onClick={() => acceptInvite(invite.code)}>{joined ? l("Уже на сервере", "Joined") : server ? l("Принять", "Join") : l("Недействительно", "Invalid")}</button></div></div>;
}

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === "image" && (attachment.preview || attachment.url)) return <div className="attachment-image"><img src={attachment.preview || attachment.url} alt={attachment.name}/><span>{attachment.name}</span></div>;
  return <div className="attachment-file"><FileText size={28}/><span><strong>{attachment.name}</strong><small>{attachment.size ? `${Math.round(attachment.size / 1024)} KB` : "Attachment"}</small></span></div>;
}

function Composer({ targetId, placeholder }: { targetId: string; placeholder: string }) {
  const addMessage = useMoonStore((s) => s.addMessage);
  const replyingToId = useMoonStore((s) => s.replyingToId);
  const setReplyingTo = useMoonStore((s) => s.setReplyingTo);
  const messages = useMoonStore((s) => s.messages);
  const setTyping = useMoonStore((s) => s.setTyping);
  const typing = useMoonStore((s) => s.typing[targetId]) ?? EMPTY_TYPING;
  const l = useL();
  const [value, setValue] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | undefined>();
  const typingTimer = useRef<number | null>(null);
  const replied = replyingToId ? messages.find((message) => message.id === replyingToId) : undefined;
  const [sending, setSending] = useState(false);
  const submit = async () => {
    if (sending) return;
    setSending(true);
    try {
      let persisted = attachment;
      if (attachment?.file) {
        const url = await uploadLocalImage(attachment.file, "attachments");
        if (attachment.preview?.startsWith("blob:")) URL.revokeObjectURL(attachment.preview);
        persisted = { name: attachment.name, kind: attachment.kind, url, mimeType: attachment.mimeType, size: attachment.size };
      }
      addMessage(value, targetId, persisted);
      setValue("");
      setAttachment(undefined);
      setTyping(targetId, false);
    } catch (error) {
      console.error("Attachment upload failed", error);
    } finally {
      setSending(false);
    }
  };
  const onType = (next: string) => { setValue(next); setTyping(targetId, Boolean(next.trim())); if (typingTimer.current) window.clearTimeout(typingTimer.current); typingTimer.current = window.setTimeout(() => setTyping(targetId, false), 2200); };
  const selectFile = (file?: File) => { if (!file) return; const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined; setAttachment({ name: file.name, kind: preview ? "image" : "file", preview, mimeType: file.type, size: file.size, file }); };
  return <div className="composer-area">{replied && <div className="replying-bar"><span>{l("Ответ для", "Replying to")} <strong>{replied.author}</strong></span><button onClick={() => setReplyingTo(null)}><X size={15}/></button></div>}{attachment && <div className="attachment-preview"><FileText size={18}/><span>{attachment.name}</span><button onClick={() => setAttachment(undefined)}><X size={15}/></button></div>}<div className="composer" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); selectFile(e.dataTransfer.files?.[0]); }}><label className="composer-plus" title={l("Загрузить файл", "Upload file")}><Plus size={22}/><input type="file" hidden onChange={(e) => selectFile(e.target.files?.[0])}/></label><textarea value={value} onChange={(e) => onType(e.target.value)} onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} rows={1} placeholder={placeholder}/><div className="composer-actions"><button className="text-tool">GIF</button><button className="text-tool"><Gift size={19}/></button><IconButton label={l("Эмодзи", "Emoji")} onClick={() => setEmojiOpen((v) => !v)}><Smile size={20}/></IconButton></div>{emojiOpen && <EmojiPicker onPick={(emoji) => { setValue((v) => v + emoji); setEmojiOpen(false); }}/>}</div><div className="typing-line">{typing.length ? (typing.length === 1 ? l(`${typing[0]} печатает…`, `${typing[0]} is typing…`) : l(`${typing.join(", ")} печатают…`, `${typing.join(", ")} are typing…`)) : ""}</div></div>;
}

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const l = useL();
  const emojis = ["😀","😂","😍","😎","😭","😡","👍","👎","❤️","🔥","🎉","💀","🤝","✅","🚀","🎮","💯","🤔","👀","✨"];
  return <div className="emoji-picker"><input placeholder={l("Поиск эмодзи", "Search emoji")}/><div>{emojis.map((emoji) => <button key={emoji} onClick={() => onPick(emoji)}>{emoji}</button>)}</div></div>;
}

function MemberSidebar() {
  const members = useMoonStore((s) => s.members);
  const servers = useMoonStore((s) => s.servers);
  const activeServerId = useMoonStore((s) => s.activeServerId);
  const currentUser = useMoonStore((s) => s.currentUser);
  const l = useL();
  const [profile, setProfile] = useState<string | null>(null);
  const server = servers.find((item) => item.id === activeServerId);
  const allowed = members.filter((member) => member.id === server?.ownerId || server?.memberIds?.includes(member.id));
  const groups = ["ADMIN","ONLINE","OFFLINE"] as const;
  const groupName = (group: typeof groups[number]) => group === "ADMIN" ? l("АДМИНИСТРАТОР", "ADMIN") : group === "ONLINE" ? l("В СЕТИ", "ONLINE") : l("НЕ В СЕТИ", "OFFLINE");
  return <aside className="member-sidebar">{groups.map((group) => { const items = allowed.filter((member) => group === "ADMIN" ? member.id === server?.ownerId : group === "OFFLINE" ? member.status === "offline" : member.status !== "offline" && member.id !== server?.ownerId); if (!items.length) return null; return <section className="member-group" key={group}><h3>{groupName(group)} — {items.length}</h3>{items.map((member) => <button key={member.id} className={`member-item ${member.status === "offline" ? "offline" : ""}`} onClick={() => setProfile(member.id)}><Avatar label={member.avatar} status={member.status}/><span><strong>{member.id === currentUser.id ? `${member.name} ${l("(вы)", "(you)")}` : member.name}<UserBadges user={member}/></strong><small>{member.activity ?? `@${member.username ?? member.name.toLowerCase()}`}</small></span></button>)}</section>; })}{profile && <ProfilePopout memberId={profile} close={() => setProfile(null)}/>}</aside>;
}

function ProfilePopout({ memberId, close }: { memberId: string; close: () => void }) {
  const member = useMoonStore((s) => s.members.find((item) => item.id === memberId));
  const currentUser = useMoonStore((s) => s.currentUser);
  const createDm = useMoonStore((s) => s.createDm);
  const sendFriendRequest = useMoonStore((s) => s.sendFriendRequest);
  const developerMode = useMoonStore((s) => s.userSettings.developerMode);
  const l = useL();
  if (!member) return null;
  const gradient = member.profileGradient ?? { from: "#5865f2", to: "#7c3aed", angle: 135 };
  return <div className="profile-popout" style={{ "--profile-from": gradient.from, "--profile-to": gradient.to } as CSSProperties}><BannerMedia className="profile-banner" src={member.banner}/><button className="profile-close" onClick={close}><X size={15}/></button><div className="profile-avatar"><Avatar label={member.avatar} status={member.status} large/></div><div className="profile-body"><h2><NameStyle user={member}>{member.name}</NameStyle><UserBadges user={member}/></h2><p>@{member.username ?? member.name.toLowerCase()}</p>{developerMode && <div className="profile-id">ID: {member.id}<button onClick={() => navigator.clipboard?.writeText(member.id)}><Copy size={12}/></button></div>}<hr/><h4>{l("ОБО МНЕ", "ABOUT ME")}</h4><div className="profile-bio-links"><LinkifiedText text={member.bio}/></div>{member.id !== currentUser.id && <><button className="profile-message" onClick={() => { void createDm(member.id); close(); }}>{l("Сообщение", "Message")}</button><button className="secondary-button full-button" onClick={() => void sendFriendRequest(member.username ?? member.name)}>{l("Добавить в друзья", "Add Friend")}</button></>}</div></div>;
}

function FriendsScreen() {
  const homeTab = useMoonStore((s) => s.homeTab);
  const setHomeTab = useMoonStore((s) => s.setHomeTab);
  const friends = useMoonStore((s) => s.friends);
  const createDm = useMoonStore((s) => s.createDm);
  const sendFriendRequest = useMoonStore((s) => s.sendFriendRequest);
  const respond = useMoonStore((s) => s.respondFriendRequest);
  const cancelFriendRequest = useMoonStore((s) => s.cancelFriendRequest);
  const removeFriend = useMoonStore((s) => s.removeFriend);
  const [search, setSearch] = useState("");
  const [friendName, setFriendName] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const l = useL();
  if (homeTab === "plus") return <MoonPlusPage/>;
  const list = friends.filter((friend) => homeTab === "online" ? friend.relation === "friend" && friend.status !== "offline" : homeTab === "all" ? friend.relation === "friend" : homeTab === "pending" ? friend.relation === "pending" : homeTab === "blocked" ? friend.relation === "blocked" : true).filter((friend) => friend.name.toLowerCase().includes(search.toLowerCase()) || friend.username?.toLowerCase().includes(search.toLowerCase()));
  const send = async () => { const result = await sendFriendRequest(friendName); setNote({ ok: result.ok, text: result.message }); if (result.ok) setFriendName(""); };
  const tabLabel = (tab: HomeTab) => ({ online: l("В сети", "Online"), all: l("Все", "All"), pending: l("Ожидание", "Pending"), blocked: l("Заблокированные", "Blocked"), add: l("Добавить друга", "Add Friend"), plus: "Moon Plus" }[tab]);
  return <section className="friends-screen"><header className="friends-header"><strong><Users size={19}/> {l("Друзья", "Friends")}</strong>{(["online","all","pending","blocked"] as HomeTab[]).map((tab) => <button key={tab} className={homeTab === tab ? "active" : ""} onClick={() => setHomeTab(tab)}>{tabLabel(tab)}</button>)}<button className={`add-friend-tab ${homeTab === "add" ? "active" : ""}`} onClick={() => setHomeTab("add")}>{l("Добавить друга", "Add Friend")}</button></header>{homeTab === "add" ? <div className="add-friend-page"><h2>{l("ДОБАВИТЬ ДРУГА", "ADD FRIEND")}</h2><p>{l("Добавляй друзей по точному username Moon. Пользователь должен быть зарегистрирован в Moon.", "Add friends by their exact Moon username. The user must be registered in Moon.")}</p><div className="add-friend-box"><input value={friendName} onChange={(e) => { setFriendName(e.target.value); setNote(null); }} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} placeholder={l("Username Moon", "Moon username")}/><button disabled={!friendName.trim()} onClick={() => void send()}>{l("Отправить запрос", "Send Friend Request")}</button></div>{note && <div className={`success-note ${note.ok ? "" : "error-note"}`}>{note.ok ? <Check size={17}/> : <UserX size={17}/>} {note.text}</div>}</div> : <div className="friends-body"><label className="friends-search"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={l("Поиск", "Search")}/><Search size={18}/></label><h3>{homeTab.toUpperCase()} — {list.length}</h3>{!list.length && <div className="friends-empty"><Users size={38}/><strong>{homeTab === "pending" ? l("Нет ожидающих заявок", "No pending requests") : l("Здесь пока пусто", "Nothing here yet")}</strong><span>{homeTab === "all" ? l("Добавь пользователя Moon в друзья.", "Add another Moon user as a friend.") : l("Список появится здесь.", "Your list will appear here.")}</span></div>}<div className="friend-list">{list.map((friend) => <FriendRow key={`${friend.relation}-${friend.id}`} friend={friend} onMessage={() => void createDm(friend.id)} onAccept={friend.requestId ? () => void respond(friend.requestId!, "accept") : undefined} onIgnore={friend.requestId ? () => void respond(friend.requestId!, "reject") : undefined} onCancel={friend.requestId ? () => cancelFriendRequest(friend.requestId!) : undefined} onRemove={() => removeFriend(friend.id)}/>)}</div></div>}</section>;
}

function FriendRow({ friend, onMessage, onAccept, onIgnore, onCancel, onRemove }: { friend: Friend; onMessage: () => void; onAccept?: () => void; onIgnore?: () => void; onCancel?: () => void; onRemove: () => void }) {
  const l = useL();
  return <div className="friend-row"><Avatar label={friend.avatar} status={friend.status}/><div className="friend-info"><strong><NameStyle user={friend}>{friend.name}</NameStyle><UserBadges user={friend}/><small>@{friend.username ?? friend.name.toLowerCase()}</small></strong><span>{friend.relation === "pending" ? (friend.incoming ? l("Входящий запрос в друзья", "Incoming friend request") : l("Исходящая заявка — можно отменить", "Outgoing friend request — you can cancel it")) : friend.relation === "blocked" ? l("Заблокирован", "Blocked") : friend.activity ?? friend.status}</span></div><div className="friend-actions">{friend.relation === "friend" && <><IconButton label={l("Сообщение", "Message")} onClick={onMessage}><MessageCircle size={19}/></IconButton><IconButton label={l("Удалить из друзей", "Remove Friend")} onClick={onRemove}><UserMinus size={19}/></IconButton></>}{friend.relation === "pending" && friend.incoming && <><IconButton label={l("Принять", "Accept")} onClick={onAccept}><UserCheck size={19}/></IconButton><IconButton label={l("Игнорировать", "Ignore")} onClick={onIgnore}><UserX size={19}/></IconButton></>}{friend.relation === "pending" && !friend.incoming && <IconButton label={l("Отменить заявку", "Cancel request")} onClick={onCancel}><X size={19}/></IconButton>}</div></div>;
}

function MoonPlusPage() {
  const currentUser = useMoonStore((s) => s.currentUser);
  const purchasePlus = useMoonStore((s) => s.purchasePlus);
  const updateProfile = useMoonStore((s) => s.updateProfile);
  const setPlusStyle = useMoonStore((s) => s.setPlusStyle);
  const setVisible = useMoonStore((s) => s.setPlusBadgeVisible);
  const l = useL();
  const [note, setNote] = useState("");
  const previewAvatar = currentUser.plus && currentUser.avatar !== currentUser.displayName.slice(0,1).toUpperCase() ? currentUser.avatar : withBasePath("/plus/avatar.gif");
  const previewBanner = currentUser.plus && currentUser.banner ? currentUser.banner : withBasePath("/plus/banner.gif");
  const activate = () => { purchasePlus(); setNote(l("Moon Plus активирован.", "Moon Plus activated.")); };
  const applyGifPack = () => {
    if (!currentUser.plus) return;
    const result = updateProfile({ avatar: withBasePath("/plus/avatar.gif"), banner: withBasePath("/plus/banner.gif") });
    setNote(result.ok ? l("PLUS GIF-оформление применено.", "PLUS GIF styling applied.") : result.message ?? l("Не удалось применить оформление.", "Could not apply styling."));
  };
  return <div className="plus-page plus-page-v2">
    <div className="plus-hero"><div className="plus-logo"><Crown size={30}/></div><div><span>MOON PLUS</span><h1>{l("Больше персонализации профиля", "More profile personalization")}</h1><p>{l("Тестовая подписка за 100 ₽ — активация происходит сразу, без реального списания.", "Test subscription for 100 ₽ — activates instantly without a real charge.")}</p></div><div className="plus-price"><strong>100 ₽</strong><span>/ {l("месяц", "month")}</span></div></div>
    <div className="plus-subscription-layout">
      <aside className="plus-profile-preview"><div className="plus-preview-card"><BannerMedia className="plus-preview-banner" src={previewBanner}/><div className="plus-preview-body"><Avatar label={previewAvatar} status="online" large/><h2><NameStyle user={{...currentUser, plus:true}}>{currentUser.displayName}</NameStyle><UserBadges user={{...currentUser, plus:true, plusBadgeVisible:true}}/></h2><p>@{currentUser.username}</p><span>{l("Предпросмотр профиля Moon Plus", "Moon Plus profile preview")}</span></div></div><div className={`plus-status ${currentUser.plus ? "active" : ""}`}><Crown size={18}/><strong>{currentUser.plus ? l("Moon Plus активен", "Moon Plus active") : l("Moon Plus не активен", "Moon Plus inactive")}</strong></div>{!currentUser.plus ? <button className="plus-buy-button" onClick={activate}><Crown size={18}/>{l("Купить Moon Plus — 100 ₽", "Buy Moon Plus — 100 ₽")}</button> : <><button className="secondary-button full-button" onClick={applyGifPack}>{l("Применить GIF avatar.gif + banner.gif", "Apply GIF avatar.gif + banner.gif")}</button><ToggleSetting title={l("Показывать корону Plus", "Show Plus crown")} description={l("Можно скрыть корону рядом с никнеймом.", "You can hide the crown next to your nickname.")} checked={currentUser.plusBadgeVisible !== false} onChange={setVisible}/></>}{note && <div className="profile-save-note">{note}</div>}</aside>
      <main className="plus-main"><div className="plus-benefits"><div><ImageIcon size={24}/><h3>{l("GIF-аватар", "GIF avatar")}</h3><p>{l("Поддержка анимированных GIF-аватарок без остановки анимации.", "Animated GIF avatars stay animated across Moon.")}</p></div><div><Palette size={24}/><h3>{l("GIF-баннер", "GIF banner")}</h3><p>{l("Анимированный GIF-баннер в карточках и профиле.", "Animated GIF profile banners.")}</p></div><div><Crown size={24}/><h3>{l("Стиль никнейма", "Nickname style")}</h3><p>{l("Смена шрифта и цвета никнейма.", "Change nickname font and color.")}</p></div><div><Link2 size={24}/><h3>{l("Кастомная ссылка", "Custom invite link")}</h3><p>{l("Создавай ссылки вида moon.dev/Moon.", "Create links like moon.dev/Moon.")}</p></div></div>{currentUser.plus && <div className="plus-style-editor"><h3>{l("СТИЛЬ НИКНЕЙМА", "NICKNAME STYLE")}</h3><label>{l("Цвет", "Color")}<input type="color" value={currentUser.nicknameColor ?? "#f2f3f5"} onChange={(e) => setPlusStyle({ nicknameColor: e.target.value })}/></label><label>{l("Шрифт", "Font")}<select value={currentUser.nicknameFont ?? "default"} onChange={(e) => setPlusStyle({ nicknameFont: e.target.value as any })}><option value="default">Default</option><option value="serif">Serif</option><option value="mono">Mono</option><option value="rounded">Rounded</option></select></label><div className="plus-style-live"><NameStyle user={currentUser}>{currentUser.displayName}</NameStyle><UserBadges user={currentUser}/></div></div>}</main>
    </div>
  </div>;
}


function DmProfileSidebar({ member }: { member: Member }) {
  const currentUser = useMoonStore((s) => s.currentUser);
  const servers = useMoonStore((s) => s.servers);
  const friends = useMoonStore((s) => s.friends);
  const sendFriendRequest = useMoonStore((s) => s.sendFriendRequest);
  const developerMode = useMoonStore((s) => s.userSettings.developerMode);
  const l = useL();
  const mutualServers = servers.filter((server) => (server.ownerId === currentUser.id || server.memberIds?.includes(currentUser.id ?? "")) && (server.ownerId === member.id || server.memberIds?.includes(member.id))).length;
  const isFriend = friends.some((friend) => friend.id === member.id && friend.relation === "friend");
  const gradient = member.profileGradient ?? { from: "#5865f2", to: "#7c3aed", angle: 135 };
  return <aside className="dm-profile-sidebar" style={{ "--profile-from": gradient.from, "--profile-to": gradient.to } as CSSProperties}><BannerMedia className="dm-profile-banner" src={member.banner}/><div className="dm-profile-avatar"><Avatar label={member.avatar} status={member.status} large/></div><div className="dm-profile-content"><h2><NameStyle user={member}>{member.name}</NameStyle><UserBadges user={member}/></h2><p>@{member.username ?? member.name.toLowerCase()}</p><div className="dm-profile-meta"><span>{isFriend ? l("✓ В друзьях", "✓ Friends") : l("Не в друзьях", "Not friends")}</span><span>{mutualServers} {l("общих серверов", "Mutual Servers")}</span></div><hr/><h4>{l("ОБО МНЕ", "ABOUT ME")}</h4><div className="profile-bio-links"><LinkifiedText text={member.bio}/></div>{developerMode && <><h4>USER ID</h4><button className="copy-id-row" onClick={() => navigator.clipboard?.writeText(member.id)}><code>{member.id}</code><Copy size={13}/></button></>}{!isFriend && <button className="secondary-button full-button" onClick={() => void sendFriendRequest(member.username ?? member.name)}>{l("Добавить в друзья", "Add Friend")}</button>}</div></aside>;
}

function DirectMessageChat({ dmId }: { dmId: string }) {
  const dms = useMoonStore((s) => s.directMessages);
  const friendList = useMoonStore((s) => s.friends);
  const memberList = useMoonStore((s) => s.members);
  const currentUser = useMoonStore((s) => s.currentUser);
  const showDmProfile = useMoonStore((s) => s.userSettings.showDmProfile);
  const calls = useMoonStore((s) => s.calls);
  const dm = dms.find((item) => item.id === dmId);
  const peerId = dm ? dmPeerId(dm, currentUser.id) : undefined;
  const member = friendList.find((item) => item.id === peerId) ?? memberList.find((item) => item.id === peerId);
  if (!dm || !member) return <FriendsScreen/>;
  const call = calls.find((item) => item.dmId === dmId && item.status !== "ended");
  return <div className={`dm-layout ${showDmProfile ? "with-profile" : ""}`}><div className="dm-main"><DmHeader member={member} dmId={dmId}/>{call && !(call.status === "ringing" && call.calleeId === currentUser.id) && <DmCallStage call={call}/>}<MessageList targetId={dm.id} title={member.name} direct/><Composer targetId={dm.id} placeholder={`Message @${member.name}`}/></div>{showDmProfile && <DmProfileSidebar member={member}/>}</div>;
}

function VoiceRoom({ channelId, name }: { channelId: string; name: string }) {
  const joinedVoiceId = useMoonStore((s) => s.joinedVoiceId);
  const toggleVoice = useMoonStore((s) => s.toggleVoice);
  const muted = useMoonStore((s) => s.muted);
  const deafened = useMoonStore((s) => s.deafened);
  const toggleMute = useMoonStore((s) => s.toggleMute);
  const toggleDeafen = useMoonStore((s) => s.toggleDeafen);
  const camera = useMoonStore((s) => s.cameraEnabled);
  const screen = useMoonStore((s) => s.screenShareEnabled);
  const setCamera = useMoonStore((s) => s.setCameraEnabled);
  const setScreen = useMoonStore((s) => s.setScreenShareEnabled);
  const currentUser = useMoonStore((s) => s.currentUser);
  const joined = joinedVoiceId === channelId;
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (!joined) { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; return; }
    void navigator.mediaDevices?.getUserMedia({ audio: true }).then((stream) => { streamRef.current = stream; stream.getAudioTracks().forEach((track) => { track.enabled = !muted; }); }).catch(() => undefined);
    return () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; };
  }, [joined]);
  useEffect(() => { streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; }); }, [muted]);
  return <div className="voice-room"><div className={`voice-orb ${joined ? "connected" : ""}`}><Speaker size={44}/></div><h1>{name}</h1><p>{joined ? `Connected as ${currentUser.displayName}. Microphone permission is active in the browser.` : "Join this room to activate voice controls."}</p>{joined && <div className="voice-controls"><IconButton label={muted ? "Unmute" : "Mute"} active={muted} onClick={toggleMute}>{muted ? <MicOff size={20}/> : <Mic size={20}/>}</IconButton><IconButton label={deafened ? "Undeafen" : "Deafen"} active={deafened} onClick={toggleDeafen}>{deafened ? <VolumeX size={20}/> : <Headphones size={20}/>}</IconButton><IconButton label={camera ? "Camera off" : "Camera on"} active={camera} onClick={() => setCamera(!camera)}>{camera ? <Video size={20}/> : <VideoOff size={20}/>}</IconButton><IconButton label={screen ? "Stop sharing" : "Share screen"} active={screen} onClick={() => setScreen(!screen)}><MonitorUp size={20}/></IconButton></div>}<button className={`primary-button small ${joined ? "danger-button" : ""}`} onClick={() => toggleVoice(channelId)}>{joined ? "Disconnect" : "Join Voice"}</button></div>;
}

function IncomingCallToast({ call }: { call: CallSession }) {
  const currentUser = useMoonStore((s) => s.currentUser);
  const members = useMoonStore((s) => s.members);
  const acceptCall = useMoonStore((s) => s.acceptCall);
  const declineCall = useMoonStore((s) => s.declineCall);
  const peerId = call.callerId === currentUser.id ? call.calleeId : call.callerId;
  const peer = members.find((member) => member.id === peerId);
  const l = useL();
  return <div className="incoming-call-card"><div className="incoming-call-icon"><PhoneIncoming size={22}/></div><Avatar label={peer?.avatar ?? "?"} status={peer?.status}/><div><strong>{peer?.name ?? l("Неизвестный пользователь", "Unknown user")}</strong><span>{call.video ? l("Входящий видеозвонок", "Incoming video call") : l("Входящий звонок", "Incoming voice call")}</span></div><button className="call-accept" onClick={() => acceptCall(call.id)}><Phone size={19}/></button><button className="call-decline" onClick={() => declineCall(call.id)}><PhoneOff size={19}/></button></div>;
}

function DmCallStage({ call }: { call: CallSession }) {
  type WebRtcSignal = { id: string; callId: string; fromId: string; toId: string; type: "ready" | "offer" | "answer" | "ice"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
  const currentUser = useMoonStore((s) => s.currentUser);
  const members = useMoonStore((s) => s.members);
  const muted = useMoonStore((s) => s.muted);
  const deafened = useMoonStore((s) => s.deafened);
  const camera = useMoonStore((s) => s.cameraEnabled);
  const screen = useMoonStore((s) => s.screenShareEnabled);
  const toggleMute = useMoonStore((s) => s.toggleMute);
  const toggleDeafen = useMoonStore((s) => s.toggleDeafen);
  const setCamera = useMoonStore((s) => s.setCameraEnabled);
  const setScreen = useMoonStore((s) => s.setScreenShareEnabled);
  const endCall = useMoonStore((s) => s.endCall);
  const setCallMedia = useMoonStore((s) => s.setCallMedia);
  const userSettings = useMoonStore((s) => s.userSettings);
  const l = useL();
  const peerId = call.callerId === currentUser.id ? call.calleeId : call.callerId;
  const peer = members.find((member) => member.id === peerId);
  const outgoing = call.status === "ringing" && call.callerId === currentUser.id;
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const sendOfferRef = useRef<() => Promise<void>>(async () => undefined);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const answered = useRef(false);
  const [connection, setConnection] = useState<"ringing" | "connecting" | "connected" | "failed">(call.status === "ringing" ? "ringing" : "connecting");
  const [mediaError, setMediaError] = useState("");
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [peerSpeaking, setPeerSpeaking] = useState(false);
  const [, forceTime] = useState(0);

  const emitSignal = (payload: Omit<WebRtcSignal, "id" | "callId" | "fromId" | "toId">) => {
    if (!currentUser.id) return;
    const detail: WebRtcSignal = { id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, callId: call.id, fromId: currentUser.id, toId: peerId, ...payload };
    window.dispatchEvent(new CustomEvent("moon:webrtc-signal", { detail }));
  };

  useEffect(() => { if (call.status !== "active") return; const timer = window.setInterval(() => forceTime((v) => v + 1), 1000); return () => window.clearInterval(timer); }, [call.status]);

  useEffect(() => {
    if (call.status !== "active" || !currentUser.id || !peerId || !navigator.mediaDevices?.getUserMedia) return;
    let cancelled = false;
    let readyTimer: number | null = null;
    let offerRetry: number | null = null;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }] });
    pcRef.current = pc;
    videoSenderRef.current = null;
    setConnection("connecting");
    setMediaError("");
    const remote = new MediaStream();
    remoteStream.current = remote;
    if (remoteAudio.current) remoteAudio.current.srcObject = remote;
    if (remoteVideo.current) remoteVideo.current.srcObject = remote;
    pc.ontrack = (event) => {
      const tracks = event.streams[0]?.getTracks() ?? [event.track];
      for (const track of tracks) if (!remote.getTracks().some((item) => item.id === track.id)) remote.addTrack(track);
      if (remoteAudio.current) void remoteAudio.current.play().catch(() => undefined);
      if (remoteVideo.current) void remoteVideo.current.play().catch(() => undefined);
    };
    pc.onicecandidate = (event) => { if (event.candidate) emitSignal({ type: "ice", candidate: event.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setConnection("connected");
      else if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") setConnection("failed");
      else setConnection("connecting");
    };

    const ensureLocal = async () => {
      if (localStream.current) return localStream.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: userSettings.inputDeviceId !== "default" ? { deviceId: { exact: userSettings.inputDeviceId } } : true,
        video: call.video ? true : false,
      });
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return stream; }
      localStream.current = stream;
      stream.getAudioTracks().forEach((track) => { track.enabled = !muted; pc.addTrack(track, stream); });
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) { videoTrack.enabled = camera; videoSenderRef.current = pc.addTrack(videoTrack, stream); }
      if (localVideo.current) { localVideo.current.srcObject = stream; void localVideo.current.play().catch(() => undefined); }
      return stream;
    };
    const flushIce = async () => { const queued = pendingIce.current.splice(0); for (const candidate of queued) { try { await pc.addIceCandidate(candidate); } catch { /* stale candidate */ } } };
    const sendOffer = async () => {
      if (cancelled || pc.signalingState !== "stable") return;
      try { await ensureLocal(); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); emitSignal({ type: "offer", sdp: offer }); } catch { setConnection("failed"); }
    };
    sendOfferRef.current = sendOffer;
    const onSignal = async (event: Event) => {
      const signal = (event as CustomEvent<WebRtcSignal>).detail;
      if (!signal || signal.callId !== call.id || signal.toId !== currentUser.id || signal.fromId !== peerId) return;
      try {
        if (signal.type === "ready") { if (call.callerId === currentUser.id) void sendOffer(); return; }
        await ensureLocal();
        if (signal.type === "offer" && signal.sdp) {
          if (pc.signalingState !== "stable") { try { await pc.setLocalDescription({ type: "rollback" }); } catch { /* glare */ } }
          await pc.setRemoteDescription(signal.sdp); await flushIce(); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); emitSignal({ type: "answer", sdp: answer });
        } else if (signal.type === "answer" && signal.sdp) {
          answered.current = true; await pc.setRemoteDescription(signal.sdp); await flushIce();
        } else if (signal.type === "ice" && signal.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate); else pendingIce.current.push(signal.candidate);
        }
      } catch { setConnection("failed"); }
    };
    window.addEventListener("moon:webrtc-signal-remote", onSignal);

    void ensureLocal().then(() => {
      if (cancelled) return;
      if (call.calleeId === currentUser.id) {
        emitSignal({ type: "ready" });
        readyTimer = window.setInterval(() => { if (pc.connectionState !== "connected") emitSignal({ type: "ready" }); }, 1000);
      } else {
        window.setTimeout(() => void sendOffer(), 450);
        offerRetry = window.setInterval(() => { if (!answered.current && pc.connectionState !== "connected") void sendOffer(); }, 2200);
      }
    }).catch(() => { setConnection("failed"); setMediaError(l("Нет доступа к микрофону или камере.", "Microphone or camera access denied.")); });

    return () => {
      cancelled = true;
      window.removeEventListener("moon:webrtc-signal-remote", onSignal);
      if (readyTimer !== null) window.clearInterval(readyTimer);
      if (offerRetry !== null) window.clearInterval(offerRetry);
      pc.close(); if (pcRef.current === pc) pcRef.current = null;
      localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null;
      screenStream.current?.getTracks().forEach((track) => track.stop()); screenStream.current = null;
      remoteStream.current = null; videoSenderRef.current = null;
      pendingIce.current = []; answered.current = false; sendOfferRef.current = async () => undefined;
    };
  }, [call.status, call.id, call.callerId, call.calleeId, call.video, currentUser.id, peerId, userSettings.inputDeviceId]);

  useEffect(() => { localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; }); setCallMedia(call.id, { muted, deafened, camera, screen }); }, [muted, deafened, camera, screen, call.id, setCallMedia]);
  useEffect(() => { if (remoteAudio.current) { remoteAudio.current.muted = deafened; const sink = remoteAudio.current as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }; if (sink.setSinkId && userSettings.outputDeviceId && userSettings.outputDeviceId !== "default") void sink.setSinkId(userSettings.outputDeviceId).catch(() => undefined); } }, [deafened, userSettings.outputDeviceId]);

  useEffect(() => {
    if (call.status !== "active") { setLocalSpeaking(false); setPeerSpeaking(false); return; }
    let stopped = false;
    const cleanups: Array<() => void> = [];
    const watch = (streamRef: { current: MediaStream | null }, setSpeaking: (value: boolean) => void) => {
      let started = false;
      const wait = window.setInterval(() => {
        if (stopped || started || !streamRef.current?.getAudioTracks().length) return;
        started = true; window.clearInterval(wait);
        try {
          const ctx = new AudioContext();
          const analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = .6;
          ctx.createMediaStreamSource(streamRef.current).connect(analyser);
          const data = new Uint8Array(analyser.fftSize);
          const sample = window.setInterval(() => {
            analyser.getByteTimeDomainData(data);
            let sum = 0; for (const value of data) { const normalized = (value - 128) / 128; sum += normalized * normalized; }
            setSpeaking(Math.sqrt(sum / data.length) > .035);
          }, 110);
          cleanups.push(() => { window.clearInterval(sample); setSpeaking(false); void ctx.close(); });
        } catch { setSpeaking(false); }
      }, 180);
      cleanups.push(() => window.clearInterval(wait));
    };
    watch(localStream, setLocalSpeaking); watch(remoteStream, setPeerSpeaking);
    return () => { stopped = true; cleanups.forEach((cleanup) => cleanup()); };
  }, [call.status, call.id]);

  const toggleCamera = async () => {
    if (camera) { localStream.current?.getVideoTracks().forEach((track) => { track.enabled = false; }); setCamera(false); return; }
    let track = localStream.current?.getVideoTracks()[0];
    if (!track) {
      try {
        const extra = await navigator.mediaDevices.getUserMedia({ video: true }); track = extra.getVideoTracks()[0];
        if (track && localStream.current) { localStream.current.addTrack(track); if (!videoSenderRef.current) { videoSenderRef.current = pcRef.current?.addTrack(track, localStream.current) ?? null; void sendOfferRef.current(); } }
      } catch { setMediaError(l("Не удалось включить камеру.", "Could not enable camera.")); return; }
    }
    if (track) track.enabled = true;
    if (!screen && localVideo.current && localStream.current) { localVideo.current.srcObject = localStream.current; void localVideo.current.play().catch(() => undefined); }
    setCamera(true);
  };

  const stopScreenShare = async () => {
    screenStream.current?.getTracks().forEach((track) => track.stop()); screenStream.current = null;
    const cameraTrack = localStream.current?.getVideoTracks()[0] ?? null;
    if (videoSenderRef.current) await videoSenderRef.current.replaceTrack(camera && cameraTrack ? cameraTrack : null).catch(() => undefined);
    if (localVideo.current) { localVideo.current.srcObject = camera && localStream.current ? localStream.current : null; if (camera) void localVideo.current.play().catch(() => undefined); }
    setScreen(false);
  };

  const toggleScreen = async () => {
    if (screen) { await stopScreenShare(); return; }
    if (!window.isSecureContext) { setMediaError(l("Демонстрация экрана требует защищённое HTTPS-соединение.", "Screen sharing requires a secure HTTPS connection.")); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) { setMediaError(l("Этот браузер не поддерживает демонстрацию экрана.", "This browser does not support screen sharing.")); return; }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setMediaError(name === "NotAllowedError" ? l("Доступ к демонстрации экрана не был разрешён.", "Screen sharing permission was not granted.") : name === "NotFoundError" ? l("Не найден экран или окно для демонстрации.", "No screen or window was available to share.") : l("Не удалось открыть выбор экрана.", "Could not open the screen picker."));
      setScreen(false);
      return;
    }

    const track = stream.getVideoTracks()[0];
    if (!track) { stream.getTracks().forEach((item) => item.stop()); setMediaError(l("Браузер не вернул видеопоток экрана.", "The browser returned no screen video track.")); return; }
    try {
      screenStream.current?.getTracks().forEach((item) => item.stop());
      screenStream.current = stream;
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(track);
      } else if (pcRef.current) {
        videoSenderRef.current = pcRef.current.addTrack(track, stream);
        await sendOfferRef.current();
      } else {
        throw new Error("WebRTC connection is not ready.");
      }
      if (localVideo.current) { localVideo.current.srcObject = stream; await localVideo.current.play().catch(() => undefined); }
      setScreen(true);
      setMediaError("");
      track.addEventListener("ended", () => { void stopScreenShare(); }, { once: true });
    } catch (error) {
      stream.getTracks().forEach((item) => item.stop());
      screenStream.current = null;
      setScreen(false);
      setMediaError(l("Экран выбран, но не удалось передать его в звонок. Переподключись к звонку и попробуй снова.", "The screen was selected, but its video track could not be sent. Rejoin the call and try again."));
      console.error("Moon screen share:", error);
    }
  };

  const elapsed = call.startedAt ? Math.floor((Date.now() - call.startedAt) / 1000) : 0;
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const peerState = call.participantState[peerId];
  const peerVideo = Boolean(peerState?.camera || peerState?.screen);
  const localVideoOn = Boolean(camera || screen);

  return <div className="dm-call-stage"><audio ref={remoteAudio} autoPlay/><div className="dm-call-status"><span className={`call-connection ${connection}`}><i/>{outgoing ? l("Звоним…", "Calling…") : connection === "connected" ? `${l("Подключено", "Connected")} · ${duration}` : connection === "failed" ? l("Не удалось подключить медиа.", "Media connection failed.") : l("Подключение…", "Connecting…")}</span>{mediaError && <span className="call-media-error">{mediaError}</span>}</div><div className="dm-call-people"><div className={`dm-call-person ${peerSpeaking && !peerState?.muted ? "speaking" : ""} ${peerVideo ? "has-video" : "avatar-only"} ${peerState?.screen ? "screen-sharing" : ""}`}><video ref={remoteVideo} autoPlay playsInline muted className={peerVideo ? "" : "call-video-hidden"}/>{!peerVideo && <CallAvatar label={peer?.avatar ?? "?"} name={peer?.name ?? l("Пользователь", "User")}/>}<span><NameStyle user={peer}>{peer?.name ?? l("Пользователь", "User")}</NameStyle><UserBadges user={peer ?? {}}/></span><div className="peer-media-badges">{peerState?.screen && <MonitorUp size={15}/>} {peerState?.muted && <MicOff size={15}/>} {peerState?.deafened && <VolumeX size={15}/>}</div></div><div className={`dm-call-person local ${localSpeaking && !muted ? "speaking" : ""} ${localVideoOn ? "has-video" : "avatar-only"} ${screen ? "screen-sharing" : ""}`}><video ref={localVideo} muted autoPlay playsInline className={localVideoOn ? "" : "call-video-hidden"}/>{!localVideoOn && <CallAvatar label={currentUser.avatar} name={currentUser.displayName}/>}<span><NameStyle user={currentUser}>{currentUser.displayName}</NameStyle><UserBadges user={currentUser}/></span></div></div><div className="dm-call-controls"><button className={muted ? "active" : ""} title={muted ? l("Включить микрофон", "Unmute") : l("Выключить микрофон", "Mute")} onClick={toggleMute}>{muted ? <MicOff size={20}/> : <Mic size={20}/>}</button><button className={deafened ? "active" : ""} title={deafened ? l("Включить звук", "Undeafen") : l("Отключить звук", "Deafen")} onClick={toggleDeafen}>{deafened ? <VolumeX size={20}/> : <Headphones size={20}/>}</button><button className={camera ? "active" : ""} title={l("Камера", "Camera")} onClick={() => void toggleCamera()}>{camera ? <Video size={20}/> : <VideoOff size={20}/>}</button><button className={screen ? "active" : ""} title={l("Демонстрация экрана", "Share Screen")} onClick={() => void toggleScreen()}><MonitorUp size={20}/></button><button className="hangup" title={l("Завершить звонок", "End Call")} onClick={() => endCall(call.id)}><PhoneOff size={20}/></button></div></div>;
}


function ModalShell({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  useEffect(() => { const handler = (e: globalThis.KeyboardEvent) => e.key === "Escape" && close(); window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [close]);
  return <div className="modal-overlay" onMouseDown={(e) => e.currentTarget === e.target && close()}><div className="modal-card"><button className="modal-x" onClick={close}><X size={18}/></button><h2>{title}</h2>{children}</div></div>;
}

function CreateServerModal({ close }: { close: () => void }) {
  const createServer = useMoonStore((s) => s.createServer);
  const l = useL();
  const [name, setName] = useState(l("Мой сервер", "My Server"));
  return <ModalShell title={l("Создай свой сервер", "Create your server")} close={close}><p className="modal-muted">{l("Новый аккаунт начинается с чистого листа. Создавай только нужные серверы.", "Your account starts clean. Create only the server you actually need.")}</p><label className="field-label">{l("НАЗВАНИЕ СЕРВЕРА", "SERVER NAME")}<input value={name} onChange={(e) => setName(e.target.value)}/></label><button className="primary-button" onClick={() => { createServer(name); close(); }}>{l("Создать сервер", "Create Server")}</button></ModalShell>;
}

function CreateChannelModal({ close }: { close: () => void }) {
  const createChannel = useMoonStore((s) => s.createChannel);
  const l = useL();
  const [type, setType] = useState<"Text" | "Voice">("Text");
  const [name, setName] = useState("new-channel");
  return <ModalShell title={l("Создать канал", "Create channel")} close={close}><div className="segmented">{(["Text","Voice"] as const).map((item) => <button className={type === item ? "selected" : ""} key={item} onClick={() => setType(item)}>{item === "Text" ? l("Текстовый", "Text") : l("Голосовой", "Voice")}</button>)}</div><label className="field-label">{l("НАЗВАНИЕ КАНАЛА", "CHANNEL NAME")}<input value={name} onChange={(e) => setName(e.target.value.replace(/\s+/g,"-"))}/></label><button className="primary-button" onClick={() => { createChannel(name, type === "Voice" ? "voice" : "text"); close(); }}>{l("Создать канал", "Create Channel")}</button></ModalShell>;
}

function InviteModal({ close }: { close: () => void }) {
  const serverId = useMoonStore((s) => s.activeServerId);
  const servers = useMoonStore((s) => s.servers);
  const currentUser = useMoonStore((s) => s.currentUser);
  const memberList = useMoonStore((s) => s.members);
  const friends = useMoonStore((s) => s.friends);
  const invites = useMoonStore((s) => s.invites);
  const createInvite = useMoonStore((s) => s.createServerInvite);
  const sendInvite = useMoonStore((s) => s.sendServerInvite);
  const server = servers.find((item) => item.id === serverId);
  const l = useL();
  const [code, setCode] = useState("");
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const candidates = Array.from(new Map([...friends.filter((friend) => friend.relation === "friend"), ...memberList].map((member) => [member.id, member])).values()).filter((member) => member.id !== currentUser.id && !(server?.memberIds ?? []).includes(member.id));

  useEffect(() => {
    if (!serverId || code) return;
    const existing = [...invites].reverse().find((invite) => invite.serverId === serverId && invite.creatorId === currentUser.id && !invite.revoked);
    if (existing) { setCode(existing.code); return; }
    const result = createInvite(serverId);
    if (result.ok && result.code) setCode(result.code);
  }, [serverId, code, invites, currentUser.id, createInvite]);

  const copyWorkingLink = async () => {
    if (!code) return;
    const url = `${window.location.origin}${BASE_PATH}/?invite=${encodeURIComponent(code)}`;
    await navigator.clipboard?.writeText(url);
    setNote(l("Ссылка-приглашение скопирована.", "Invite link copied."));
  };
  const createCustom = () => {
    const result = createInvite(serverId, custom);
    if (result.ok && result.code) { setCode(result.code); setNote(l("Кастомная ссылка создана.", "Custom link created.")); }
    else setNote(result.message ?? l("Не удалось создать ссылку.", "Could not create link."));
  };

  return <ModalShell title={`${l("Пригласить людей на", "Invite people to")} ${server?.name ?? APP_NAME}`} close={close}><p className="modal-muted">{l("Приглашение отправляется в личные сообщения. Пользователь вступит на сервер только после нажатия «Принять».", "Invites are sent through DMs. A user joins only after accepting the invite.")}</p><div className="invite-link-box"><div><small>{l("ССЫЛКА-ПРИГЛАШЕНИЕ", "INVITE LINK")}</small><strong>moon.dev/{code || "..."}</strong></div><button onClick={() => void copyWorkingLink()}><Copy size={16}/>{l("Копировать", "Copy")}</button></div>{currentUser.plus ? <div className="custom-invite-box"><label className="field-label">{l("КАСТОМНАЯ ССЫЛКА MOON PLUS", "MOON PLUS CUSTOM LINK")}<div className="custom-invite-input"><span>moon.dev/</span><input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))} placeholder="Moon"/><button disabled={custom.length < 3} onClick={createCustom}>{l("Создать", "Create")}</button></div></label></div> : <div className="plus-invite-hint"><Crown size={15}/>{l("Кастомные ссылки вида moon.dev/Moon доступны с Moon Plus.", "Custom links like moon.dev/Moon require Moon Plus.")}</div>}{note && <div className="profile-save-note">{note}</div>}<div className="local-invite-list"><h4>{l("ОТПРАВИТЬ В ЛИЧНЫЕ СООБЩЕНИЯ", "SEND TO DIRECT MESSAGES")}</h4>{candidates.length ? candidates.map((account) => <div className="local-invite-user" key={account.id}><Avatar label={account.avatar}/><span><strong>{account.name}<UserBadges user={account}/></strong><small>@{account.username ?? account.name.toLowerCase()}</small></span><button disabled={!code} onClick={() => { void sendInvite(serverId, account.id, code).then((result) => setNote(result.message)); }}>{l("Отправить", "Send")}</button></div>) : <div className="panel-empty compact"><UserCheck size={28}/><strong>{l("Некого приглашать", "No users to invite")}</strong><span>{l("Сначала добавь пользователя в друзья.", "Add a friend first.")}</span></div>}</div></ModalShell>;
}


function InviteAcceptModal({ code, close }: { code: string; close: () => void }) {
  const invites = useMoonStore((s) => s.invites);
  const servers = useMoonStore((s) => s.servers);
  const acceptInvite = useMoonStore((s) => s.acceptServerInvite);
  const l = useL();
  const invite = invites.find((item) => item.code.toLowerCase() === code.toLowerCase() && !item.revoked);
  const server = invite ? servers.find((item) => item.id === invite.serverId) : undefined;
  const accept = () => { const result = acceptInvite(code); if (result.ok) close(); };
  return <ModalShell title={l("Приглашение на сервер", "Server Invite")} close={close}>{invite && server ? <div className="invite-accept"><div className="server-edit-icon" style={{ background: server.accent }}>{server.icon ? <img src={server.icon} alt=""/> : server.initials}</div><h2>{server.name}</h2><p>{l("Тебя пригласили присоединиться к серверу Moon.", "You've been invited to join this Moon server.")}</p><code>moon.dev/{invite.code}</code><button className="primary-button" onClick={accept}>{l("Принять приглашение", "Accept Invite")}</button></div> : <div className="panel-empty compact"><UserX size={30}/><strong>{l("Приглашение недействительно", "Invite invalid")}</strong><span>{l("Ссылка могла быть удалена или сервер больше не существует.", "The link may have been revoked or the server no longer exists.")}</span></div>}</ModalShell>;
}

function EditServerModal({ close }: { close: () => void }) {
  const serverId = useMoonStore((s) => s.activeServerId);
  const servers = useMoonStore((s) => s.servers);
  const updateServer = useMoonStore((s) => s.updateServer);
  const l = useL();
  const server = servers.find((item) => item.id === serverId);
  const [name, setName] = useState(server?.name ?? "");
  const [accent, setAccent] = useState(server?.accent ?? "#5865f2");
  const [icon, setIcon] = useState(server?.icon ?? "");
  if (!server) return null;
  const upload = (file?: File) => { if (file) void uploadLocalImage(file, "server-icon").then(setIcon).catch(() => undefined); };
  return <ModalShell title={l("Редактировать сервер", "Edit server")} close={close}><div className="edit-server-preview"><div className="server-edit-icon" style={{ background: accent }}>{icon ? <img src={icon} alt=""/> : server.initials}</div><span><strong>{name || server.name}</strong><small>{l("Изменения синхронизируются между подключёнными аккаунтами", "Changes sync to connected accounts")}</small></span></div><label className="field-label">{l("НАЗВАНИЕ СЕРВЕРА", "SERVER NAME")}<input value={name} onChange={(event) => setName(event.target.value)}/></label><label className="field-label">{l("ЦВЕТ АКЦЕНТА", "ACCENT COLOR")}<div className="color-field"><input type="color" value={accent} onChange={(event) => setAccent(event.target.value)}/><code>{accent}</code></div></label><label className="upload-button"><ImageIcon size={17}/> {l("Загрузить иконку сервера", "Upload Server Icon")}<input type="file" accept="image/*" onChange={(event) => upload(event.target.files?.[0])}/></label><button className="primary-button" onClick={() => { updateServer(serverId, { name, accent, icon: icon || undefined }); close(); }}><Save size={17}/> {l("Сохранить изменения", "Save Changes")}</button></ModalShell>;
}

function ServerSettingsModal({ close }: { close: () => void }) {
  const serverId = useMoonStore((s) => s.activeServerId);
  const servers = useMoonStore((s) => s.servers);
  const updateServer = useMoonStore((s) => s.updateServer);
  const createRole = useMoonStore((s) => s.createRole);
  const l = useL();
  const server = servers.find((item) => item.id === serverId);
  const [page, setPage] = useState<"overview" | "roles">("overview");
  const [name, setName] = useState(server?.name ?? "");
  const [accent, setAccent] = useState(server?.accent ?? "#5865f2");
  const [roleName, setRoleName] = useState(l("Новая роль", "New Role"));
  if (!server) return null;
  return <div className="settings-screen server-settings-screen"><aside><div className="settings-nav"><h4>{server.name}</h4><button className={page === "overview" ? "active" : ""} onClick={() => setPage("overview")}>{l("Обзор", "Overview")}</button><button className={page === "roles" ? "active" : ""} onClick={() => setPage("roles")}>{l("Роли", "Roles")}</button></div></aside><main><button className="settings-close" onClick={close}><X size={22}/><small>ESC</small></button><div className="settings-content"><h1>{page === "roles" ? l("Роли", "Roles") : l("Обзор сервера", "Server Overview")}</h1>{page === "overview" ? <div className="settings-card"><h3>{l("НАЗВАНИЕ СЕРВЕРА", "SERVER NAME")}</h3><input className="settings-text" value={name} onChange={(e) => setName(e.target.value)}/><h3>{l("АКЦЕНТ", "ACCENT")}</h3><div className="color-field"><input type="color" value={accent} onChange={(e) => setAccent(e.target.value)}/><code>{accent}</code></div><button className="primary-button small" onClick={() => updateServer(serverId, { name, accent })}>{l("Сохранить сервер", "Save Server")}</button></div> : <><div className="role-list">{(server.roles ?? []).map((role) => <div className="role-line" key={role.id}><i style={{ background: role.color }}/><div><strong>{role.name}</strong><small>{role.permissions.length} {l("разрешений", "permissions")}</small></div></div>)}</div><div className="settings-card"><h3>{l("СОЗДАТЬ РОЛЬ", "CREATE ROLE")}</h3><input className="settings-text" value={roleName} onChange={(e) => setRoleName(e.target.value)}/><button className="primary-button small" onClick={() => { createRole(serverId, { name: roleName, color: "#99aab5", permissions: ["MANAGE_MESSAGES"] }); setRoleName(l("Новая роль", "New Role")); }}>{l("Создать роль", "Create Role")}</button></div></>}</div></main></div>;
}

function ToggleSetting({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="settings-toggle"><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}/></label>;
}

function SettingsModal({ close, initialPage }: { close: () => void; initialPage: string }) {
  const theme = useMoonStore((s) => s.theme);
  const setTheme = useMoonStore((s) => s.setTheme);
  const [page, setPage] = useState(initialPage);
  const l = useL();
  const pages = [
    ["My Account", l("Моя учётная запись", "My Account")],
    ["Profiles", l("Профили", "Profiles")],
    ["Appearance", l("Внешний вид", "Appearance")],
    ["Voice & Video", l("Голос и видео", "Voice & Video")],
    ["Notifications", l("Уведомления", "Notifications")],
    ["Privacy & Safety", l("Конфиденциальность", "Privacy & Safety")],
    ["Language", l("Язык", "Language")],
    ["Developer", l("Для разработчиков", "Developer")],
  ] as const;
  const title = pages.find(([id]) => id === page)?.[1] ?? page;
  useEffect(() => { const handler = (e: globalThis.KeyboardEvent) => e.key === "Escape" && close(); window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [close]);
  return <div className="settings-screen"><aside><div className="settings-nav"><h4>{l("НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ", "USER SETTINGS")}</h4>{pages.map(([id, label]) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>{label}</button>)}</div></aside><main><button className="settings-close" onClick={close}><X size={22}/><small>ESC</small></button><div className="settings-content"><h1>{title}</h1>{page === "My Account" ? <AccountSettings openProfile={() => setPage("Profiles")}/> : page === "Profiles" ? <ProfileEditor/> : page === "Appearance" ? <AppearanceSettings theme={theme} setTheme={setTheme}/> : page === "Voice & Video" ? <VoiceSettings/> : page === "Notifications" ? <NotificationSettings/> : page === "Privacy & Safety" ? <PrivacySettings/> : page === "Language" ? <LanguageSettings/> : <DeveloperSettings/>}</div></main></div>;
}


function AppearanceSettings({ theme, setTheme }: { theme: "dark" | "light"; setTheme: (theme: "dark" | "light") => void }) {
  const settings = useMoonStore((s) => s.userSettings);
  const setSetting = useMoonStore((s) => s.setUserSetting);
  const l = useL();
  return <><h4>{l("ТЕМА", "THEME")}</h4><div className="theme-cards"><button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>{l("Тёмная", "Dark")}</button><button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>{l("Светлая", "Light")}</button></div><h4>{l("ОТОБРАЖЕНИЕ СООБЩЕНИЙ", "MESSAGE DISPLAY")}</h4><div className="segmented"><button className={!settings.compactMessages ? "selected" : ""} onClick={() => setSetting("compactMessages", false)}>{l("Уютное", "Cozy")}</button><button className={settings.compactMessages ? "selected" : ""} onClick={() => setSetting("compactMessages", true)}>{l("Компактное", "Compact")}</button></div><label className="range-setting"><span>{l("Размер текста чата", "Chat Font Scaling")} <b>{settings.chatFontSize}px</b></span><input type="range" min="12" max="20" value={settings.chatFontSize} onChange={(e) => setSetting("chatFontSize", Number(e.target.value))}/></label><ToggleSetting title={l("Уменьшить анимации", "Reduce Motion")} description={l("Отключает большую часть UI-анимаций.", "Disable most UI animations.")} checked={settings.reducedMotion} onChange={(value) => setSetting("reducedMotion", value)}/></>;
}


function VoiceSettings() {
  const l = useL();
  const muted = useMoonStore((s) => s.muted);
  const toggleMute = useMoonStore((s) => s.toggleMute);
  const settings = useMoonStore((s) => s.userSettings);
  const setSetting = useMoonStore((s) => s.setUserSetting);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const testStream = useRef<MediaStream | null>(null);
  useEffect(() => { void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => undefined); return () => testStream.current?.getTracks().forEach((track) => track.stop()); }, []);
  const startTest = async () => {
    if (testing) { testStream.current?.getTracks().forEach((track) => track.stop()); testStream.current = null; setTesting(false); setLevel(0); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: settings.inputDeviceId !== "default" ? { deviceId: { exact: settings.inputDeviceId } } : true }); testStream.current = stream; setTesting(true); const ctx = new AudioContext(); const analyser = ctx.createAnalyser(); ctx.createMediaStreamSource(stream).connect(analyser); const data = new Uint8Array(analyser.frequencyBinCount); const tick = () => { if (!testStream.current) { void ctx.close(); return; } analyser.getByteFrequencyData(data); setLevel(Math.min(100, Math.round(data.reduce((a, b) => a + b, 0) / data.length))); requestAnimationFrame(tick); }; tick(); } catch { setTesting(false); }
  };
  const inputs = devices.filter((device) => device.kind === "audioinput");
  const outputs = devices.filter((device) => device.kind === "audiooutput");
  return <><div className="settings-card"><h3>{l("УСТРОЙСТВО ВВОДА", "INPUT DEVICE")}</h3><select value={settings.inputDeviceId} onChange={(e) => setSetting("inputDeviceId", e.target.value)}><option value="default">{l("Микрофон по умолчанию", "Default Microphone")}</option>{inputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${device.deviceId.slice(0, 5)}`}</option>)}</select><h3>{l("УСТРОЙСТВО ВЫВОДА", "OUTPUT DEVICE")}</h3><select value={settings.outputDeviceId} onChange={(e) => setSetting("outputDeviceId", e.target.value)}><option value="default">{l("Вывод по умолчанию", "Default Output")}</option>{outputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Output ${device.deviceId.slice(0, 5)}`}</option>)}</select></div><div className="settings-panel"><strong>{l("ТЕСТ МИКРОФОНА", "MIC TEST")}</strong><span>{muted ? l("Микрофон выключен", "Microphone is muted") : testing ? `${l("Уровень входа", "Input level")}: ${level}%` : l("Проверь выбранный микрофон", "Check your selected microphone")}</span><button onClick={() => void startTest()}>{testing ? l("Остановить", "Stop Test") : l("Проверить", "Let's Check")}</button></div><div className="settings-panel"><strong>{l("ГЛОБАЛЬНЫЙ MUTE", "GLOBAL MUTE")}</strong><span>{l("Если включить микрофон — наушники тоже включатся. Deafen всегда выключает микрофон.", "Unmuting the microphone also undeafens headphones. Deafening always mutes the microphone.")}</span><button onClick={toggleMute}>{muted ? l("Включить микрофон", "Unmute") : l("Выключить микрофон", "Mute")}</button></div></>;
}

function NotificationSettings() {
  const l = useL();
  const settings = useMoonStore((s) => s.userSettings);
  const setSetting = useMoonStore((s) => s.setUserSetting);
  const requestPermission = async () => { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); };
  return <div className="settings-card"><ToggleSetting title={l("Уведомления на рабочем столе", "Enable Desktop Notifications")} description={l("Разрешить Moon показывать уведомления браузера.", "Allow Moon to show browser notifications.")} checked={settings.notifications} onChange={(value) => { setSetting("notifications", value); if (value) void requestPermission(); }}/><ToggleSetting title={l("Уведомления о личных сообщениях", "Direct Message Notifications")} description={l("Уведомлять о новых личных сообщениях.", "Notify when a DM arrives.")} checked={settings.dmNotifications} onChange={(value) => setSetting("dmNotifications", value)}/><ToggleSetting title={l("Запросы в друзья", "Friend Request Notifications")} description={l("Уведомлять о новых запросах в друзья.", "Notify when somebody sends a friend request.")} checked={settings.friendRequestNotifications} onChange={(value) => setSetting("friendRequestNotifications", value)}/></div>;
}

function PrivacySettings() {
  const l = useL();
  const settings = useMoonStore((s) => s.userSettings);
  const setSetting = useMoonStore((s) => s.setUserSetting);
  return <div className="settings-card"><ToggleSetting title={l("Показывать профиль справа в ЛС", "Show DM Profile Panel")} description={l("Показывать профиль собеседника справа от переписки.", "Show the other user's profile on the right side of direct messages.")} checked={settings.showDmProfile} onChange={(value) => setSetting("showDmProfile", value)}/><ToggleSetting title={l("Режим стримера", "Streamer Mode")} description={l("Скрывать чувствительные данные аккаунта.", "Hide sensitive account details in account settings.")} checked={settings.streamerMode} onChange={(value) => setSetting("streamerMode", value)}/></div>;
}

function LanguageSettings() {
  const language = useMoonStore((s) => s.userSettings.language);
  const setSetting = useMoonStore((s) => s.setUserSetting);
  return <div className="settings-card"><h3>LANGUAGE / ЯЗЫК</h3><div className="language-options"><button className={language === "ru" ? "active" : ""} onClick={() => setSetting("language", "ru")}><Languages size={18}/> Русский</button><button className={language === "en" ? "active" : ""} onClick={() => setSetting("language", "en")}><Languages size={18}/> English</button></div><p className="settings-description">{language === "ru" ? "Основные элементы интерфейса Moon переключаются на русский язык сразу." : "Main Moon interface elements switch to English immediately."}</p></div>;
}

function DeveloperSettings() {
  const settings = useMoonStore((s) => s.userSettings);
  const currentUser = useMoonStore((s) => s.currentUser);
  const setSetting = useMoonStore((s) => s.setUserSetting);
  const l = useL();
  return <div className="settings-card"><ToggleSetting title={l("Режим разработчика", "Developer Mode")} description={l("Показывает User ID в профилях и других меню.", "Shows User IDs in profiles and context areas.")} checked={settings.developerMode} onChange={(value) => setSetting("developerMode", value)}/>{settings.developerMode && <div className="developer-info"><Code2 size={22}/><div><strong>{currentUser.developer ? l("Аккаунт разработчика Moon", "Moon developer account") : l("Режим разработчика включён", "Developer mode enabled")}</strong><span>{l("ID становятся доступны для копирования.", "User IDs are now available to copy.")}</span></div></div>}</div>;
}


function ProfileEditor() {
  const currentUser = useMoonStore((s) => s.currentUser);
  const updateProfile = useMoonStore((s) => s.updateProfile);
  const l = useL();
  const initialGradient = currentUser.profileGradient ?? { from: "#5865f2", to: "#7c3aed", angle: 135 };
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [username, setUsername] = useState(currentUser.username);
  const [bio, setBio] = useState(currentUser.bio ?? "");
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [banner, setBanner] = useState(currentUser.banner ?? "");
  const [from, setFrom] = useState(initialGradient.from);
  const [to, setTo] = useState(initialGradient.to);
  const [angle, setAngle] = useState(initialGradient.angle);
  const [note, setNote] = useState("");
  const upload = (kind: "avatar" | "banner", file?: File) => {
    if (!file) return;
    if (file.type === "image/gif" && !currentUser.plus) { setNote(l("GIF-аватары и GIF-баннеры доступны только с Moon Plus.", "GIF avatars and banners require Moon Plus.")); return; }
    setNote(l("Загрузка изображения…", "Uploading image…"));
    void uploadLocalImage(file, kind).then((url) => {
      if (kind === "avatar") setAvatar(url); else setBanner(url);
      setNote(file.type === "image/gif" ? l("GIF загружен. Нажми «Сохранить профиль».", "GIF uploaded. Click Save Profile.") : l("Изображение загружено. Нажми «Сохранить профиль».", "Image uploaded. Click Save Profile."));
    }).catch((error) => setNote(error instanceof Error ? error.message : l("Не удалось загрузить изображение.", "Could not upload image.")));
  };
  const save = () => { const result = updateProfile({ displayName, username, bio, avatar, banner: banner || undefined, profileGradient: { from, to, angle } }); setNote(result.ok ? l("Профиль сохранён и синхронизирован.", "Profile saved and synced.") : result.message ?? l("Не удалось сохранить профиль.", "Could not save profile.")); };
  return <div className="profile-editor-layout"><div className="profile-editor-form"><label className="field-label">{l("ОТОБРАЖАЕМОЕ ИМЯ", "DISPLAY NAME")}<input value={displayName} onChange={(e) => setDisplayName(e.target.value)}/></label><label className="field-label">USERNAME<input value={username} onChange={(e) => setUsername(e.target.value)}/></label><label className="field-label">{l("ОБО МНЕ", "ABOUT ME")}<textarea value={bio} maxLength={300} onChange={(e) => setBio(e.target.value)} placeholder={l("Ссылки https://... в профиле будут кликабельными.", "Links like https://... are clickable in your profile.")}/></label><div className="profile-upload-grid"><label className="upload-button"><ImageIcon size={17}/> {l("Сменить аватар", "Change Avatar")}<input type="file" accept="image/*,.gif" onChange={(e) => upload("avatar", e.target.files?.[0])}/></label><label className="upload-button"><ImageIcon size={17}/> {l("Сменить баннер", "Change Banner")}<input type="file" accept="image/*,.gif" onChange={(e) => upload("banner", e.target.files?.[0])}/></label></div><div className="gradient-editor"><h3><Palette size={16}/> {l("ГРАДИЕНТ ПРОФИЛЯ", "PROFILE GRADIENT")}</h3><label>{l("Начало", "Start")} <input type="color" value={from} onChange={(e) => setFrom(e.target.value)}/></label><label>{l("Конец", "End")} <input type="color" value={to} onChange={(e) => setTo(e.target.value)}/></label><label className="range-setting"><span>{l("Угол", "Angle")} <b>{angle}°</b></span><input type="range" min="0" max="360" value={angle} onChange={(e) => setAngle(Number(e.target.value))}/></label></div>{note && <div className="profile-save-note">{note}</div>}<button className="primary-button profile-save" onClick={save}><Save size={17}/> {l("Сохранить профиль", "Save Profile")}</button></div><div className="profile-preview-wrap"><h4>{l("ПРЕДПРОСМОТР", "PREVIEW")}</h4><div className="profile-preview-card" style={{ background: `linear-gradient(${angle}deg, ${from}, ${to})` }}><BannerMedia className="profile-preview-banner" src={banner || undefined}/><div className="profile-preview-body"><Avatar label={avatar} status="online" large/><h2>{displayName || l("Отображаемое имя", "Display Name")}</h2><p>@{username || "username"}</p><hr/><h4>{l("ОБО МНЕ", "ABOUT ME")}</h4><div className="profile-bio-links"><LinkifiedText text={bio}/></div></div></div></div></div>;
}

function AccountSettings({ openProfile }: { openProfile: () => void }) {
  const currentUser = useMoonStore((s) => s.currentUser);
  const streamerMode = useMoonStore((s) => s.userSettings.streamerMode);
  const developerMode = useMoonStore((s) => s.userSettings.developerMode);
  const l = useL();
  const [passwordResetBusy, setPasswordResetBusy] = useState(false);
  const gradient = currentUser.profileGradient ?? { from: "#5865f2", to: "#7c3aed", angle: 135 };
  const resetPassword = async () => {
    if (passwordResetBusy) return;
    setPasswordResetBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const email = data.user?.email;
      if (!email) throw new Error(l("У аккаунта не найден email.", "No email was found for this account."));
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      sessionStorage.setItem("moon:auth-recovery-email", email);
      sessionStorage.setItem("moon:auth-open-recovery", "1");
      await supabase.auth.signOut();
    } catch (error) {
      alert(error instanceof Error ? error.message : l("Не удалось отправить код сброса пароля.", "Could not send the password reset code."));
      setPasswordResetBusy(false);
    }
  };
  return <><div className="account-card" style={{ background: `linear-gradient(${gradient.angle}deg,${gradient.from},${gradient.to})` }}><BannerMedia className="account-banner" src={currentUser.banner}/><div className="account-info"><Avatar label={currentUser.avatar} status="online" large/><h2><NameStyle user={currentUser}>{currentUser.displayName}</NameStyle><UserBadges user={currentUser}/></h2><p>@{currentUser.username}</p><button className="primary-button small" onClick={openProfile}>{l("Редактировать профиль", "Edit User Profile")}</button></div></div>{developerMode && <div className="settings-panel"><strong>USER ID</strong><span>{streamerMode ? l("Скрыто режимом стримера", "Hidden by Streamer Mode") : currentUser.id}</span><button onClick={() => navigator.clipboard?.writeText(currentUser.id ?? "")}>{l("Копировать", "Copy")}</button></div>}<div className="settings-panel"><strong>{l("СЕССИЯ", "SESSION")}</strong><span>{l("Сессия защищена Supabase Auth и сохраняется в браузере.", "This session is protected by Supabase Auth and persisted in the browser.")}</span><div className="account-session-actions"><button onClick={() => void resetPassword()} disabled={passwordResetBusy}>{passwordResetBusy ? l("Отправляем код…", "Sending code…") : l("Сбросить пароль", "Reset password")}</button><button className="danger-text" onClick={() => window.dispatchEvent(new Event("moon:logout"))}>{l("Выйти", "Log Out")}</button></div></div></>;
}

function SidePanelOverlay({ panel, close, searchQuery, setSearchQuery, targetId }: { panel: Exclude<SidePanel, null>; close: () => void; searchQuery: string; setSearchQuery: (v: string) => void; targetId: string }) {
  const messages = useMoonStore((s) => s.messages);
  const notices = useMoonStore((s) => s.notices);
  const markRead = useMoonStore((s) => s.markNotificationsRead);
  const l = useL();
  const pins = messages.filter((m) => m.channelId === targetId && m.pinned);
  const results = useMemo(() => searchMessages(messages, searchQuery), [messages, searchQuery]);
  const title = panel === "pins" ? l("Закреплённые сообщения", "Pinned Messages") : panel === "inbox" ? l("Входящие", "Inbox") : l("Поиск", "Search");
  return <aside className="side-panel-overlay"><div className="panel-header"><h2>{title}</h2><div className="panel-head-actions">{panel === "inbox" && notices.some((n) => !n.read) && <button className="mark-read" onClick={markRead}>{l("Прочитать всё", "Mark read")}</button>}<button onClick={close}><X size={20}/></button></div></div>{panel === "search" && <><label className="panel-search"><Search size={17}/><input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={l("Поиск сообщений", "Search messages")}/></label><div className="panel-scroll">{results.map((message) => <PanelMessage key={message.id} message={message}/>)}</div></>}{panel === "pins" && <div className="panel-scroll">{pins.length ? pins.map((message) => <PanelMessage key={message.id} message={message}/>) : <div className="panel-empty"><Pin size={35}/><strong>{l("Нет закреплённых сообщений", "No pinned messages")}</strong></div>}</div>}{panel === "inbox" && <div className="panel-scroll">{notices.length ? notices.map((notice) => <div className={`notice-card ${notice.read ? "read" : ""}`} key={notice.id}><Avatar label={notice.avatar}/><div><strong>{notice.author}</strong><p>{notice.text}</p><span>{notice.location} · {notice.time}</span></div></div>) : <div className="panel-empty"><Inbox size={35}/><strong>{l("Входящие пусты", "Inbox is empty")}</strong></div>}</div>}</aside>;
}

function PanelMessage({ message }: { message: Message }) { return <div className="panel-message"><Avatar label={message.avatar}/><div><strong>{message.author}</strong><span>{message.timestamp}</span><p>{message.body || message.attachment?.name}</p></div></div>; }
function searchMessages(messages: Message[], query: string) { const q = query.trim().toLowerCase(); return messages.filter((message) => !q || message.body.toLowerCase().includes(q) || message.author.toLowerCase().includes(q)).reverse(); }

export function MoonApp() {
  const [modal, setModal] = useState<Modal>(null);
  const [settingsInitialPage, setSettingsInitialPage] = useState("My Account");
  const [panel, setPanel] = useState<SidePanel>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);
  const servers = useMoonStore((s) => s.servers);
  const theme = useMoonStore((s) => s.theme);
  const appView = useMoonStore((s) => s.appView);
  const memberListOpen = useMoonStore((s) => s.memberListOpen);
  const activeServerId = useMoonStore((s) => s.activeServerId);
  const activeChannelId = useMoonStore((s) => s.activeChannelId);
  const activeDmId = useMoonStore((s) => s.activeDmId);
  const currentUser = useMoonStore((s) => s.currentUser);
  const userSettings = useMoonStore((s) => s.userSettings);
  const calls = useMoonStore((s) => s.calls);
  const setActiveServer = useMoonStore((s) => s.setActiveServer);
  const activeServer = servers.find((s) => s.id === activeServerId);
  const channel = activeServer?.channels.find((c) => c.id === activeChannelId);
  const showMemberColumn = appView === "server" && memberListOpen && Boolean(activeServer);
  const targetId = appView === "home" && activeDmId ? activeDmId : activeChannelId;
  const activeCall = calls.find((call) => call.status !== "ended" && (call.callerId === currentUser.id || call.calleeId === currentUser.id));
  const openSearch = (value: string) => { setSearchQuery(value); setPanel("search"); };
  const openSettings = (page = "My Account") => { setSettingsInitialPage(page); setModal("settings"); };

  useEffect(() => startSupabaseRealtimeSync(), []);
  useEffect(() => { const code = new URLSearchParams(window.location.search).get("invite"); if (code) setPendingInviteCode(code); }, []);
  useEffect(() => {
    const visible = servers.filter((server) => server.ownerId === currentUser.id || server.memberIds?.includes(currentUser.id ?? ""));
    const requested = new URLSearchParams(window.location.search).get("server");
    if (requested && visible.some((server) => server.id === requested) && requested !== activeServerId) setActiveServer(requested);
  }, [servers, currentUser.id, activeServerId, setActiveServer]);

  const appStyle = { "--chat-font-size": `${userSettings.chatFontSize}px` } as CSSProperties;
  return <div className={`moon-app theme-${theme} ${showMemberColumn ? "" : "no-members"} ${userSettings.compactMessages ? "compact-messages" : ""} ${userSettings.reducedMotion ? "reduce-motion" : ""}`} style={appStyle}>
    <ServerRail openServerModal={() => setModal("server")} openInviteModal={(serverId) => { useMoonStore.getState().setActiveServer(serverId); setModal("invite"); }} openEditServer={(serverId) => { useMoonStore.getState().setActiveServer(serverId); setModal("editServer"); }} openServerSettings={(serverId) => { useMoonStore.getState().setActiveServer(serverId); setModal("serverSettings"); }}/>
    {appView === "server" && activeServer ? <ChannelSidebar openChannelModal={() => setModal("channel")} openInviteModal={() => setModal("invite")} openServerSettings={() => setModal("serverSettings")} openSettings={openSettings}/> : <HomeSidebar openSettings={openSettings}/>} 
    <section className="main-column">{appView === "home" ? (activeDmId ? <DirectMessageChat dmId={activeDmId}/> : <FriendsScreen/>) : activeServer ? <><ChatHeader openPanel={setPanel} onSearch={openSearch}/>{channel?.type === "voice" ? <VoiceRoom channelId={channel.id} name={channel.name}/> : channel ? <><MessageList targetId={channel.id} title={channel.name}/><Composer targetId={channel.id} placeholder={`Message #${channel.name}`}/></> : <div className="empty-server-main"><Hash size={52}/><h2>No channels yet</h2><p>Create your first channel from the server sidebar.</p></div>}</> : <FriendsScreen/>}</section>
    {showMemberColumn && <MemberSidebar/>}
    {pendingInviteCode && <InviteAcceptModal code={pendingInviteCode} close={() => { setPendingInviteCode(null); const url = new URL(window.location.href); url.searchParams.delete("invite"); window.history.replaceState({}, "", `${url.pathname}${url.search}`); }}/>} {modal === "server" && <CreateServerModal close={() => setModal(null)}/>} {modal === "channel" && <CreateChannelModal close={() => setModal(null)}/>} {modal === "settings" && <SettingsModal close={() => setModal(null)} initialPage={settingsInitialPage}/>} {modal === "invite" && <InviteModal close={() => setModal(null)}/>} {modal === "serverSettings" && <ServerSettingsModal close={() => setModal(null)}/>} {modal === "editServer" && <EditServerModal close={() => setModal(null)}/>} {panel && <SidePanelOverlay panel={panel} close={() => setPanel(null)} searchQuery={searchQuery} setSearchQuery={setSearchQuery} targetId={targetId}/>} {activeCall?.status === "ringing" && activeCall.calleeId === currentUser.id && <IncomingCallToast call={activeCall}/>} 
  </div>;
}
