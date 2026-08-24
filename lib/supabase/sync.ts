"use client";

import { useMoonStore, type LocalSharedState } from "@/lib/store";
import { getSupabaseBrowserClient } from "./client";

const STATE_ID = "global";

type TypingPayload = { targetId: string; typing: boolean; userId: string; userName: string };
type SignalPayload = { id: string; callId: string; fromId: string; toId: string; type: "ready" | "offer" | "answer" | "ice"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

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
    actorId: state.currentUser.id,
    updatedAt,
  };
}

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
    updatedAt: Math.max(previous.updatedAt ?? 0, incoming.updatedAt ?? 0),
  };
}

function contentSignature() {
  return JSON.stringify(snapshot(0));
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

export function startSupabaseRealtimeSync() {
  if (typeof window === "undefined") return () => undefined;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return () => undefined;

  let stopped = false;
  let applyingRemote = false;
  let lastSignature = "";
  let publishTimer: number | null = null;
  const source = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const seenSignals = new Set<string>();

  const deliverSignal = (payload: SignalPayload) => {
    if (!payload?.id || seenSignals.has(payload.id)) return;
    if (payload.toId && payload.toId !== useMoonStore.getState().currentUser.id) return;
    seenSignals.add(payload.id);
    window.setTimeout(() => seenSignals.delete(payload.id), 20000);
    window.dispatchEvent(new CustomEvent("moon:webrtc-signal-remote", { detail: payload }));
  };

  const applyState = (payload: LocalSharedState) => {
    if (stopped || !payload) return;
    applyingRemote = true;
    const merged = mergeShared(snapshot(0), payload);
    useMoonStore.getState().hydrateLocalShared(merged);
    queueMicrotask(() => {
      applyingRemote = false;
      lastSignature = contentSignature();
    });
  };

  const loadState = async () => {
    const { data } = await supabase.from("moon_shared_state").select("payload").eq("id", STATE_ID).maybeSingle();
    if (data?.payload) applyState(data.payload as LocalSharedState);
    lastSignature = contentSignature();
  };

  const publish = async () => {
    if (stopped || applyingRemote) return;
    const local = snapshot();
    let merged = local;
    try {
      const { data } = await supabase.from("moon_shared_state").select("payload").eq("id", STATE_ID).maybeSingle();
      if (data?.payload) merged = mergeShared(data.payload as LocalSharedState, local);
    } catch { /* use local snapshot */ }

    const { data: authData } = await supabase.auth.getUser();
    await supabase.from("moon_shared_state").upsert({
      id: STATE_ID,
      payload: merged,
      updated_by: authData.user?.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    lastSignature = contentSignature();
  };

  const schedulePublish = () => {
    if (publishTimer !== null) window.clearTimeout(publishTimer);
    publishTimer = window.setTimeout(() => {
      publishTimer = null;
      void publish();
    }, 180);
  };

  const channel = supabase
    .channel("moon-live-v1", { config: { broadcast: { self: false } } })
    .on("postgres_changes", { event: "*", schema: "public", table: "moon_shared_state", filter: `id=eq.${STATE_ID}` }, (event: any) => {
      const payload = event?.new?.payload;
      if (payload) applyState(payload as LocalSharedState);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, async () => {
      // Profile changes are also reflected in the shared state by each active client.
      // Trigger a light republish so avatars/names converge quickly.
      schedulePublish();
    })
    .on("broadcast", { event: "typing" }, ({ payload }: any) => applyTyping(payload as TypingPayload))
    .on("broadcast", { event: "signal" }, ({ payload }: any) => deliverSignal(payload as SignalPayload))
    .subscribe();

  const unsubscribe = useMoonStore.subscribe(() => {
    if (applyingRemote) return;
    const signature = contentSignature();
    if (signature === lastSignature) return;
    schedulePublish();
  });

  const onTyping = (event: Event) => {
    const detail = (event as CustomEvent<TypingPayload>).detail;
    if (!detail) return;
    void channel.send({ type: "broadcast", event: "typing", payload: { ...detail, source } });
  };
  const onSignal = (event: Event) => {
    const detail = (event as CustomEvent<SignalPayload>).detail;
    if (!detail) return;
    void channel.send({ type: "broadcast", event: "signal", payload: detail });
  };

  window.addEventListener("moon:local-typing", onTyping);
  window.addEventListener("moon:webrtc-signal", onSignal);
  void loadState().then(() => schedulePublish());

  return () => {
    stopped = true;
    if (publishTimer !== null) window.clearTimeout(publishTimer);
    unsubscribe();
    window.removeEventListener("moon:local-typing", onTyping);
    window.removeEventListener("moon:webrtc-signal", onSignal);
    void supabase.removeChannel(channel);
  };
}
