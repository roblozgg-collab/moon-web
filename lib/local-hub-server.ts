import fs from "node:fs";
import path from "node:path";

export type HubEnvelope = { kind: "state" | "typing" | "signal"; source: string; payload: unknown; updatedAt: number };
type HubListener = (event: HubEnvelope) => void;
type HubState = {
  payload: unknown | null;
  updatedAt: number;
  listeners: Set<HubListener>;
  developerClaims: Map<string, string>;
  recentSignals: HubEnvelope[];
};

declare global {
  // eslint-disable-next-line no-var
  var __moonLocalHub: HubState | undefined;
}

const CLAIM_DIR = path.join(process.cwd(), ".moon-local");
const CLAIM_FILE = path.join(CLAIM_DIR, "developer-claims.json");

function loadDeveloperClaims() {
  try {
    const raw = JSON.parse(fs.readFileSync(CLAIM_FILE, "utf8")) as Record<string, string>;
    return new Map(Object.entries(raw));
  } catch {
    return new Map<string, string>();
  }
}

function persistDeveloperClaims(claims: Map<string, string>) {
  try {
    fs.mkdirSync(CLAIM_DIR, { recursive: true });
    fs.writeFileSync(CLAIM_FILE, JSON.stringify(Object.fromEntries(claims), null, 2), "utf8");
  } catch {
    // Persistence is best-effort in the local development build.
  }
}

export function getLocalHub() {
  if (!globalThis.__moonLocalHub) {
    globalThis.__moonLocalHub = {
      payload: null,
      updatedAt: 0,
      listeners: new Set(),
      developerClaims: loadDeveloperClaims(),
      recentSignals: [],
    };
  }
  return globalThis.__moonLocalHub;
}


function mergeById<T extends { id?: string }>(base: T[] = [], incoming: T[] = []) {
  const map = new Map<string, T>();
  for (const item of base) if (item?.id) map.set(item.id, item);
  for (const item of incoming) if (item?.id) map.set(item.id, { ...(map.get(item.id) ?? {} as T), ...item } as T);
  return Array.from(map.values());
}

function mergeCalls(base: any[] = [], incoming: any[] = []) {
  const map = new Map<string, any>();
  for (const item of base) if (item?.id) map.set(item.id, item);
  for (const item of incoming) {
    if (!item?.id) continue;
    const previous = map.get(item.id);
    map.set(item.id, { ...previous, ...item, participantState: { ...(previous?.participantState ?? {}), ...(item.participantState ?? {}) } });
  }
  return Array.from(map.values());
}

function mergeSharedPayload(previous: any, incoming: any) {
  if (!previous) return incoming;
  const actorId = incoming?.actorId as string | undefined;
  let friendLinks = Array.isArray(previous.friendLinks) ? previous.friendLinks : [];
  if (actorId && Array.isArray(incoming.friendLinks)) {
    const unrelated = friendLinks.filter((link: any) => link?.fromId !== actorId && link?.toId !== actorId);
    const actorLinks = incoming.friendLinks.filter((link: any) => link?.fromId === actorId || link?.toId === actorId);
    friendLinks = mergeById(unrelated, actorLinks);
  } else if (Array.isArray(incoming.friendLinks)) friendLinks = mergeById(friendLinks, incoming.friendLinks);

  return {
    ...previous,
    ...incoming,
    servers: mergeById(previous.servers, incoming.servers),
    members: mergeById(previous.members, incoming.members),
    messages: mergeById(previous.messages, incoming.messages),
    notices: mergeById(previous.notices, incoming.notices),
    directMessages: mergeById(previous.directMessages, incoming.directMessages),
    friendLinks,
    calls: mergeCalls(previous.calls, incoming.calls),
    invites: mergeById(previous.invites, incoming.invites),
  };
}

export function publishLocalHub(source: string, payload: unknown) {
  const hub = getLocalHub();
  hub.payload = mergeSharedPayload(hub.payload, payload);
  hub.updatedAt = Date.now();
  const event: HubEnvelope = { kind: "state", source, payload: hub.payload, updatedAt: hub.updatedAt };
  for (const listener of hub.listeners) listener(event);
  return event;
}

export function emitLocalHub(source: string, kind: "typing" | "signal", payload: unknown) {
  const hub = getLocalHub();
  const event: HubEnvelope = { kind, source, payload, updatedAt: Date.now() };
  if (kind === "signal") {
    hub.recentSignals.push(event);
    // Keep a short mailbox so WebRTC messages survive UI mount/SSE races.
    const cutoff = Date.now() - 60_000;
    hub.recentSignals = hub.recentSignals.filter((item) => item.updatedAt >= cutoff).slice(-500);
  }
  for (const listener of hub.listeners) listener(event);
  return event;
}

const DEVELOPER_NAMES = new Set(["stalinovskiy", "palych"]);

export function claimDeveloperName(username: string, claimant: string) {
  const normalized = username.trim().toLowerCase();
  if (!DEVELOPER_NAMES.has(normalized)) return { developer: false, claimed: false };
  const hub = getLocalHub();
  const current = hub.developerClaims.get(normalized);
  if (current && current !== claimant) return { developer: false, claimed: false };

  const payload = hub.payload as { members?: Array<{ id?: string; username?: string; developer?: boolean }> } | null;
  const alreadyClaimed = payload?.members?.find((member) => member.developer && member.username?.toLowerCase() === normalized && member.id !== claimant);
  if (alreadyClaimed) {
    hub.developerClaims.set(normalized, alreadyClaimed.id ?? "claimed");
    persistDeveloperClaims(hub.developerClaims);
    return { developer: false, claimed: false };
  }

  hub.developerClaims.set(normalized, claimant);
  persistDeveloperClaims(hub.developerClaims);
  return { developer: true, claimed: true };
}


export function findHubUserByUsername(username: string) {
  const normalized = username.trim().toLowerCase().replace(/^@/, "");
  const payload = getLocalHub().payload as { members?: Array<Record<string, unknown>> } | null;
  return payload?.members?.find((member) => String(member.username ?? "").toLowerCase() === normalized) ?? null;
}
