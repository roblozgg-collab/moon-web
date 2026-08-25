export type Channel = { id: string; name: string; type: "text" | "voice"; unread?: boolean };
export type Role = { id: string; name: string; color: string; position: number; displaySeparately?: boolean; mentionable?: boolean; permissions: string[] };
export type ProfileGradient = { from: string; to: string; angle: number };
export type Server = { id: string; name: string; initials: string; accent: string; icon?: string; banner?: string; ownerId?: string; memberIds?: string[]; bannedMemberIds?: string[]; mutedMembers?: Record<string, number>; channels: Channel[]; roles?: Role[]; roleAssignments?: Record<string, string[]> };
export type Member = { id: string; name: string; username?: string; status: "online" | "idle" | "dnd" | "offline"; role: string; activity?: string; avatar: string; banner?: string; bio?: string; profileGradient?: ProfileGradient; plus?: boolean; plusBadgeVisible?: boolean; developer?: boolean; nicknameColor?: string; nicknameColorEnabled?: boolean; nicknameFont?: "default" | "serif" | "mono" | "rounded"; nicknameFontEnabled?: boolean; createdAt?: string; adminNameGradient?: { from: string; to: string } | null };
export type Attachment = { name: string; kind: "image" | "file"; preview?: string; url?: string; mimeType?: string; size?: number; file?: File };
export type Message = {
  id: string;
  channelId: string;
  author: string;
  authorId?: string;
  avatar: string;
  timestamp: string;
  body: string;
  reactions?: Record<string, number>;
  reacted?: string[];
  own?: boolean;
  edited?: boolean;
  pinned?: boolean;
  replyTo?: string;
  attachment?: Attachment;
  invite?: { code: string; serverId: string; serverName: string };
};
export type Friend = Member & { relation: "friend" | "pending" | "blocked"; since?: string; requestId?: string; incoming?: boolean };
export type FriendLink = { id: string; fromId: string; toId: string; status: "pending" | "accepted" | "blocked"; createdAt: number };
export type DirectMessage = { id: string; memberId: string; participantIds?: string[]; unread?: number; hiddenFor?: string[]; pinnedFor?: string[]; mutedFor?: string[] };
export type ServerInvite = { id: string; code: string; serverId: string; creatorId: string; createdAt: number; custom?: boolean; revoked?: boolean };
export type Notice = { id: string; type: "mention" | "unread"; author: string; avatar: string; text: string; location: string; time: string; read?: boolean };
export type CallParticipantState = { muted: boolean; deafened: boolean; camera: boolean; screen: boolean };
export type CallSession = {
  id: string;
  dmId: string;
  callerId: string;
  calleeId: string;
  status: "ringing" | "active" | "ended";
  video: boolean;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  participantState: Record<string, CallParticipantState>;
};

// New accounts start clean: no demo servers, channels, friends, DMs or messages.
export const servers: Server[] = [];
export const members: Member[] = [];
export const friends: Friend[] = [];
export const directMessages: DirectMessage[] = [];
export const notices: Notice[] = [];
export const initialMessages: Message[] = [];
