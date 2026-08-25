"use client";

import { useMoonStore, type LocalSharedState } from "./store";
import { isSupabaseConfigured } from "./supabase/client";
import { startSupabaseRealtimeSync } from "./supabase/sync";

const SHARED_KEY = "moon:shared-chat:v4";
const CHANNEL_NAME = "moon:realtime:v4";

type TypingPayload = { targetId: string; typing: boolean; userId: string; userName: string };
type SignalPayload = { id: string; callId: string; fromId: string; toId: string; type: "ready" | "offer" | "answer" | "ice"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type WireMessage =
  | { kind: "state"; payload: LocalSharedState; source: string }
  | { kind: "typing"; payload: TypingPayload; source: string }
  | { kind: "signal"; payload: SignalPayload; source: string };

type HubEnvelope = { kind: "state" | "typing" | "signal"; source: string; payload: LocalSharedState | TypingPayload | SignalPayload; updatedAt: number };

function snapshot(updatedAt = Date.now()): LocalSharedState {
  const state = useMoonStore.getState();
  return {
    servers: state.servers,
    members: state.members,
    messages: state.messages.map(({ own: _own, ...message }) => message),
    notices: state.notices,
    directMessages: state.directMessages,
    friendLinks: state.friendLinks,
    calls: state.calls,
    invites: state.invites,
    deletedMessageIds: state.deletedMessageIds,
    actorId: state.currentUser.id,
    updatedAt,
  };
}

function contentSignature() { return JSON.stringify(snapshot(0)); }
function mergeById<T extends { id?: string }>(base: T[] = [], incoming: T[] = []) {
  const map = new Map<string, T>();
  for (const item of base) if (item?.id) map.set(item.id, item);
  for (const item of incoming) if (item?.id) map.set(item.id, { ...(map.get(item.id) ?? {} as T), ...item });
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

function mergeShared(previous: LocalSharedState, incoming: LocalSharedState): LocalSharedState {
  const actorId = incoming.actorId;
  let friendLinks = previous.friendLinks ?? [];
  if (actorId) {
    const unrelated = friendLinks.filter((link) => link.fromId !== actorId && link.toId !== actorId);
    const actorLinks = (incoming.friendLinks ?? []).filter((link) => link.fromId === actorId || link.toId === actorId);
    friendLinks = mergeById(unrelated, actorLinks);
  } else friendLinks = mergeById(friendLinks, incoming.friendLinks ?? []);
  const deletedMessageIds = Array.from(new Set([...(previous.deletedMessageIds ?? []), ...(incoming.deletedMessageIds ?? [])]));
  return {
    ...previous, ...incoming,
    servers: mergeById(previous.servers, incoming.servers), members: mergeById(previous.members, incoming.members),
    messages: mergeById(previous.messages, incoming.messages).filter((message) => !deletedMessageIds.includes(message.id ?? "")), notices: mergeById(previous.notices, incoming.notices),
    directMessages: mergeById(previous.directMessages, incoming.directMessages), friendLinks, calls: mergeCalls(previous.calls, incoming.calls),
    invites: mergeById(previous.invites, incoming.invites), deletedMessageIds, updatedAt: Math.max(previous.updatedAt ?? 0, incoming.updatedAt ?? 0),
  };
}


function applyTyping(payload: TypingPayload) {
  const me = useMoonStore.getState().currentUser.id;
  if (!payload.targetId || payload.userId === me) return;
  useMoonStore.setState((state) => {
    const current = state.typing[payload.targetId] ?? [];
    const next = payload.typing ? Array.from(new Set([...current, payload.userName])) : current.filter((name) => name !== payload.userName);
    return { typing: { ...state.typing, [payload.targetId]: next } };
  });
  if (payload.typing) window.setTimeout(() => {
    useMoonStore.setState((state) => ({ typing: { ...state.typing, [payload.targetId]: (state.typing[payload.targetId] ?? []).filter((name) => name !== payload.userName) } }));
  }, 4500);
}

export function startLocalRealtimeSync() {
  if (typeof window === "undefined") return () => undefined;
  if (isSupabaseConfigured()) return startSupabaseRealtimeSync();
  const source = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  let applyingRemote = false;
  let lastSignature = "";
  let hubEvents: EventSource | null = null;
  let hubPoll: number | null = null;
  let signalPoll: number | null = null;
  let lastSignalPollAt = Date.now() - 1000;
  let lastHubUpdatedAt = 0;
  let stopped = false;
  const seenSignals = new Set<string>();

  const deliverSignal = (payload: SignalPayload) => {
    if (!payload?.id || seenSignals.has(payload.id)) return;
    seenSignals.add(payload.id);
    window.setTimeout(() => seenSignals.delete(payload.id), 15000);
    window.dispatchEvent(new CustomEvent("moon:webrtc-signal-remote", { detail: payload }));
  };

  const pushHub = (payload: LocalSharedState) => {
    if (stopped) return;
    void fetch("/api/local-hub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, payload }) })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (typeof data?.updatedAt === "number") lastHubUpdatedAt = Math.max(lastHubUpdatedAt, data.updatedAt);
      })
      .catch(() => undefined);
  };

  const applyState = (payload: LocalSharedState) => {
    if (stopped) return;
    applyingRemote = true;
    const merged = mergeShared(snapshot(0), payload);
    useMoonStore.getState().hydrateLocalShared(merged);
    queueMicrotask(() => { applyingRemote = false; lastSignature = contentSignature(); });
  };

  const publishCurrent = () => {
    if (stopped) return;
    const payload = snapshot();
    lastSignature = contentSignature();
    try { localStorage.setItem(SHARED_KEY, JSON.stringify(payload)); } catch { /* BroadcastChannel + local hub continue working even if browser storage is full. */ }
    channel?.postMessage({ kind: "state", payload, source } satisfies WireMessage);
    pushHub(payload);
  };

  const pullHub = async () => {
    if (stopped) return;
    try {
      const response = await fetch("/api/local-hub", { cache: "no-store" });
      if (!response.ok || stopped) return;
      const data = await response.json().catch(() => ({}));
      const updatedAt = typeof data?.updatedAt === "number" ? data.updatedAt : 0;
      if (data?.payload && updatedAt > lastHubUpdatedAt) {
        lastHubUpdatedAt = updatedAt;
        applyState(data.payload as LocalSharedState);
      }
    } catch { /* the BroadcastChannel/localStorage layer still works */ }
  };

  const pullSignals = async () => {
    if (stopped) return;
    const me = useMoonStore.getState().currentUser.id;
    if (!me) return;
    try {
      const response = await fetch(`/api/local-hub/signal?after=${lastSignalPollAt}&to=${encodeURIComponent(me)}`, { cache: "no-store" });
      if (!response.ok || stopped) return;
      const data = await response.json().catch(() => ({}));
      const signals = Array.isArray(data?.signals) ? data.signals as HubEnvelope[] : [];
      for (const envelope of signals) if (envelope.payload) deliverSignal(envelope.payload as SignalPayload);
      if (typeof data?.now === "number") lastSignalPollAt = Math.max(lastSignalPollAt, data.now - 10);
    } catch { /* SSE/BroadcastChannel may still deliver signals */ }
  };

  const saved = localStorage.getItem(SHARED_KEY);
  if (saved) {
    try { applyState(JSON.parse(saved) as LocalSharedState); }
    catch { /* first local run */ }
  } else {
    const initial = snapshot();
    try { localStorage.setItem(SHARED_KEY, JSON.stringify(initial)); } catch { /* local hub remains the source of truth */ }
    lastSignature = contentSignature();
  }

  const unsubscribe = useMoonStore.subscribe(() => {
    if (applyingRemote) return;
    const signature = contentSignature();
    if (signature === lastSignature) return;
    publishCurrent();
  });

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SHARED_KEY || !event.newValue) return;
    try { applyState(JSON.parse(event.newValue) as LocalSharedState); } catch { /* ignore */ }
  };
  const onTyping = (event: Event) => {
    const detail = (event as CustomEvent<TypingPayload>).detail;
    if (!detail) return;
    channel?.postMessage({ kind: "typing", payload: detail, source } satisfies WireMessage);
    void fetch("/api/local-hub/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, payload: detail }) }).catch(() => undefined);
  };
  const onSignal = (event: Event) => {
    const detail = (event as CustomEvent<SignalPayload>).detail;
    if (!detail) return;
    channel?.postMessage({ kind: "signal", payload: detail, source } satisfies WireMessage);
    void fetch("/api/local-hub/signal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, payload: detail }) }).catch(() => undefined);
  };

  if (channel) channel.onmessage = (event: MessageEvent<WireMessage>) => {
    if (!event.data || event.data.source === source) return;
    if (event.data.kind === "state") applyState(event.data.payload);
    else if (event.data.kind === "typing") applyTyping(event.data.payload);
    else deliverSignal(event.data.payload);
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("moon:local-typing", onTyping);
  window.addEventListener("moon:webrtc-signal", onSignal);

  void fetch("/api/local-hub", { cache: "no-store" }).then(async (response) => {
    if (stopped || !response.ok) return;
    const data = await response.json().catch(() => ({}));
    if (typeof data?.updatedAt === "number") lastHubUpdatedAt = data.updatedAt;
    if (data?.payload) applyState(data.payload as LocalSharedState);
    queueMicrotask(publishCurrent);
    if (stopped) return;
    hubEvents = new EventSource("/api/local-hub/events");
    hubEvents.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data) as HubEnvelope;
        if (envelope.source === source || !envelope.payload) return;
        lastHubUpdatedAt = Math.max(lastHubUpdatedAt, envelope.updatedAt ?? 0);
        if (envelope.kind === "typing") applyTyping(envelope.payload as TypingPayload);
        else if (envelope.kind === "signal") deliverSignal(envelope.payload as SignalPayload);
        else applyState(envelope.payload as LocalSharedState);
      } catch { /* ignore malformed dev event */ }
    };
    hubPoll = window.setInterval(() => void pullHub(), 1200);
  }).catch(() => {
    publishCurrent();
    hubPoll = window.setInterval(() => void pullHub(), 1200);
  });
  signalPoll = window.setInterval(() => void pullSignals(), 450);
  void pullSignals();

  return () => {
    stopped = true;
    unsubscribe();
    channel?.close();
    hubEvents?.close();
    if (hubPoll !== null) window.clearInterval(hubPoll);
    if (signalPoll !== null) window.clearInterval(signalPoll);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("moon:local-typing", onTyping);
    window.removeEventListener("moon:webrtc-signal", onSignal);
  };
}
