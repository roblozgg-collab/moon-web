"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMoonStore, type VoicePeer } from "@/lib/store";

const remoteStreams = new Map<string, MediaStream>();
let localPreviewStream: MediaStream | null = null;

export function getVoiceRemoteStream(userId: string) { return remoteStreams.get(userId) ?? null; }
export function getVoiceLocalStream() { return localPreviewStream; }
function mediaChanged() { if (typeof window !== "undefined") window.dispatchEvent(new Event("moon:voice-media")); }

type VoiceSignal = {
  roomId: string;
  id: string;
  fromId: string;
  toId: string;
  type: "offer" | "answer" | "ice";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type PeerBundle = {
  pc: RTCPeerConnection;
  remote: MediaStream;
  pendingIce: RTCIceCandidateInit[];
  audio: HTMLAudioElement;
  videoSender: RTCRtpSender | null;
};

export function VoiceSessionLayer() {
  const joinedVoiceId = useMoonStore((s) => s.joinedVoiceId);
  const currentUser = useMoonStore((s) => s.currentUser);
  const muted = useMoonStore((s) => s.muted);
  const deafened = useMoonStore((s) => s.deafened);
  const camera = useMoonStore((s) => s.cameraEnabled);
  const screen = useMoonStore((s) => s.screenShareEnabled);
  const inputDeviceId = useMoonStore((s) => s.userSettings.inputDeviceId);
  const outputDeviceId = useMoonStore((s) => s.userSettings.outputDeviceId);
  const setVoicePeers = useMoonStore((s) => s.setVoicePeers);
  const setVoiceConnection = useMoonStore((s) => s.setVoiceConnection);
  const setScreenShareEnabled = useMoonStore((s) => s.setScreenShareEnabled);
  const setCameraEnabled = useMoonStore((s) => s.setCameraEnabled);
  const sessionRef = useRef<{ channel: any; local: MediaStream; cameraStream: MediaStream | null; screenStream: MediaStream | null; peers: Map<string, PeerBundle>; stopped: boolean; speakingCleanup: Array<() => void> } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const userId = currentUser.id;
    if (!joinedVoiceId || !userId || !supabase || !navigator.mediaDevices?.getUserMedia) {
      setVoiceConnection("disconnected");
      setVoicePeers([]);
      return;
    }
    let disposed = false;
    setVoiceConnection("connecting");
    const peers = new Map<string, PeerBundle>();
    const speakingCleanup: Array<() => void> = [];
    let local!: MediaStream;
    let cameraStream: MediaStream | null = null;
    let screenStream: MediaStream | null = null;
    const channel = supabase.channel(`moon-voice:${joinedVoiceId}`, { config: { presence: { key: userId }, broadcast: { self: false } } });

    const localPeer = (): VoicePeer => ({ id: userId, name: currentUser.displayName, username: currentUser.username, avatar: currentUser.avatar, muted: useMoonStore.getState().muted, deafened: useMoonStore.getState().deafened, camera: useMoonStore.getState().cameraEnabled, screen: useMoonStore.getState().screenShareEnabled });
    const currentVideoTrack = () => { const session = sessionRef.current; return session?.screenStream?.getVideoTracks()[0] ?? (useMoonStore.getState().cameraEnabled ? session?.cameraStream?.getVideoTracks()[0] ?? null : null); };
    const emit = (toId: string, payload: Omit<VoiceSignal, "id" | "roomId" | "fromId" | "toId">) => {
      void channel.send({ type: "broadcast", event: "voice-signal", payload: { roomId: joinedVoiceId, id: `vs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, fromId: userId, toId, ...payload } satisfies VoiceSignal });
    };

    const updatePeerSpeaking = (id: string, speaking: boolean) => {
      useMoonStore.setState((state) => ({ voicePeers: state.voicePeers.map((peer) => peer.id === id ? { ...peer, speaking } : peer) }));
    };
    const watchSpeaking = (id: string, stream: MediaStream) => {
      if (!stream.getAudioTracks().length) return;
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = .65;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const timer = window.setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let sum = 0; for (const value of data) { const n = (value - 128) / 128; sum += n * n; }
          updatePeerSpeaking(id, Math.sqrt(sum / data.length) > .035);
        }, 120);
        speakingCleanup.push(() => { window.clearInterval(timer); updatePeerSpeaking(id, false); void ctx.close(); });
      } catch { /* browser audio analysis is optional */ }
    };

    const publishPresence = async () => {
      if (disposed) return;
      const state = useMoonStore.getState();
      await channel.track({ userId: userId, name: state.currentUser.displayName, username: state.currentUser.username, avatar: state.currentUser.avatar, muted: state.muted, deafened: state.deafened, camera: state.cameraEnabled, screen: state.screenShareEnabled, joinedAt: Date.now() });
    };

    const offer = async (peerId: string, bundle: PeerBundle) => {
      if (bundle.pc.signalingState !== "stable") return;
      try {
        const description = await bundle.pc.createOffer();
        await bundle.pc.setLocalDescription(description);
        emit(peerId, { type: "offer", sdp: description });
      } catch { /* peer may be closing */ }
    };

    const ensurePeer = (peerId: string) => {
      const existing = peers.get(peerId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }] });
      const remote = new MediaStream();
      const audio = new Audio(); audio.autoplay = true; audio.srcObject = remote; audio.muted = useMoonStore.getState().deafened;
      const bundle: PeerBundle = { pc, remote, pendingIce: [], audio, videoSender: null };
      peers.set(peerId, bundle);
      local.getAudioTracks().forEach((track) => pc.addTrack(track, local));
      const videoTrack = currentVideoTrack();
      if (videoTrack) bundle.videoSender = pc.addTrack(videoTrack, screenStream ?? cameraStream ?? local);
      pc.ontrack = (event) => {
        const tracks = event.streams[0]?.getTracks() ?? [event.track];
        for (const track of tracks) if (!remote.getTracks().some((item) => item.id === track.id)) remote.addTrack(track);
        remoteStreams.set(peerId, remote); mediaChanged();
        void audio.play().catch(() => undefined);
        if (!speakingCleanup.some((cleanup: any) => cleanup.__voicePeer === peerId)) {
          const before = speakingCleanup.length; watchSpeaking(peerId, remote);
          for (let i = before; i < speakingCleanup.length; i++) (speakingCleanup[i] as any).__voicePeer = peerId;
        }
      };
      pc.onicecandidate = (event) => { if (event.candidate) emit(peerId, { type: "ice", candidate: event.candidate.toJSON() }); };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          remoteStreams.delete(peerId); mediaChanged();
        }
      };
      return bundle;
    };

    const syncPresence = () => {
      const state = channel.presenceState() as Record<string, any[]>;
      const seen = new Set<string>();
      const remotePeers: VoicePeer[] = [];
      for (const entries of Object.values(state)) for (const entry of entries ?? []) {
        const id = String(entry.userId ?? "");
        if (!id || id === userId || seen.has(id)) continue;
        seen.add(id);
        const old = useMoonStore.getState().voicePeers.find((peer) => peer.id === id);
        remotePeers.push({ id, name: String(entry.name ?? "User"), username: entry.username ? String(entry.username) : undefined, avatar: String(entry.avatar ?? "?"), muted: Boolean(entry.muted), deafened: Boolean(entry.deafened), camera: Boolean(entry.camera), screen: Boolean(entry.screen), speaking: old?.speaking });
        const bundle = ensurePeer(id);
        if (userId < id && bundle.pc.signalingState === "stable" && bundle.pc.connectionState !== "connected") window.setTimeout(() => void offer(id, bundle), 250);
      }
      for (const [id, bundle] of peers) if (!seen.has(id)) { bundle.pc.close(); bundle.audio.pause(); peers.delete(id); remoteStreams.delete(id); }
      const me = useMoonStore.getState().voicePeers.find((peer) => peer.id === userId);
      setVoicePeers([{ ...localPeer(), speaking: me?.speaking }, ...remotePeers]);
      mediaChanged();
    };

    const onSignal = async ({ payload }: any) => {
      const signal = payload as VoiceSignal;
      if (!signal || signal.roomId !== joinedVoiceId || signal.toId !== userId || signal.fromId === userId) return;
      const bundle = ensurePeer(signal.fromId);
      try {
        if (signal.type === "offer" && signal.sdp) {
          if (bundle.pc.signalingState !== "stable") { try { await bundle.pc.setLocalDescription({ type: "rollback" }); } catch { /* ignore glare */ } }
          await bundle.pc.setRemoteDescription(signal.sdp);
          for (const ice of bundle.pendingIce.splice(0)) await bundle.pc.addIceCandidate(ice).catch(() => undefined);
          const answer = await bundle.pc.createAnswer(); await bundle.pc.setLocalDescription(answer); emit(signal.fromId, { type: "answer", sdp: answer });
        } else if (signal.type === "answer" && signal.sdp) {
          await bundle.pc.setRemoteDescription(signal.sdp);
          for (const ice of bundle.pendingIce.splice(0)) await bundle.pc.addIceCandidate(ice).catch(() => undefined);
        } else if (signal.type === "ice" && signal.candidate) {
          if (bundle.pc.remoteDescription) await bundle.pc.addIceCandidate(signal.candidate); else bundle.pendingIce.push(signal.candidate);
        }
      } catch { /* stale peer/signaling packet */ }
    };

    const start = async () => {
      try {
        local = await navigator.mediaDevices.getUserMedia({ audio: inputDeviceId !== "default" ? { deviceId: { exact: inputDeviceId } } : true, video: false });
      } catch {
        setVoiceConnection("failed");
        useMoonStore.getState().toggleVoice(joinedVoiceId);
        return;
      }
      if (disposed) { local.getTracks().forEach((track) => track.stop()); return; }
      local.getAudioTracks().forEach((track) => { track.enabled = !useMoonStore.getState().muted; });
      localPreviewStream = local; mediaChanged();
      sessionRef.current = { channel, local, cameraStream, screenStream, peers, stopped: false, speakingCleanup };
      watchSpeaking(userId, local);
      channel.on("presence", { event: "sync" }, syncPresence).on("presence", { event: "join" }, syncPresence).on("presence", { event: "leave" }, syncPresence).on("broadcast", { event: "voice-signal" }, onSignal).subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") { await publishPresence(); setVoiceConnection("connected"); syncPresence(); }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setVoiceConnection("failed");
      });
    };
    void start();

    return () => {
      disposed = true;
      const session = sessionRef.current;
      if (session?.channel === channel) sessionRef.current = null;
      for (const cleanup of speakingCleanup) cleanup();
      for (const bundle of peers.values()) { bundle.pc.close(); bundle.audio.pause(); }
      peers.clear(); remoteStreams.clear();
      localPreviewStream = null; mediaChanged();
      if (typeof local !== "undefined") local.getTracks().forEach((track) => track.stop());
      session?.cameraStream?.getTracks().forEach((track) => track.stop());
      session?.screenStream?.getTracks().forEach((track) => track.stop());
      void supabase.removeChannel(channel);
      setVoicePeers([]);
    };
  }, [joinedVoiceId, currentUser.id, inputDeviceId, setVoiceConnection, setVoicePeers]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || !joinedVoiceId) return;
    session.local.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    for (const bundle of session.peers.values()) bundle.audio.muted = deafened;
    const sinkId = outputDeviceId;
    if (sinkId && sinkId !== "default") for (const bundle of session.peers.values()) {
      const audio = bundle.audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (audio.setSinkId) void audio.setSinkId(sinkId).catch(() => undefined);
    }
    void session.channel.track({ userId: currentUser.id, name: currentUser.displayName, username: currentUser.username, avatar: currentUser.avatar, muted, deafened, camera, screen, joinedAt: Date.now() });
    useMoonStore.setState((state) => ({ voicePeers: state.voicePeers.map((peer) => peer.id === currentUser.id ? { ...peer, muted, deafened, camera, screen, name: currentUser.displayName, username: currentUser.username, avatar: currentUser.avatar } : peer) }));
  }, [muted, deafened, currentUser.id, currentUser.displayName, currentUser.username, currentUser.avatar, joinedVoiceId, outputDeviceId, camera, screen]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || !joinedVoiceId) return;
    let cancelled = false;
    const renegotiate = async () => {
      for (const [peerId, bundle] of session.peers) {
        if (bundle.pc.signalingState !== "stable") continue;
        try {
          const offer = await bundle.pc.createOffer(); await bundle.pc.setLocalDescription(offer);
          void session.channel.send({ type: "broadcast", event: "voice-signal", payload: { roomId: joinedVoiceId, id: `vs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, fromId: currentUser.id, toId: peerId, type: "offer", sdp: offer } });
        } catch { /* peer may be changing */ }
      }
    };
    const applyVideo = async () => {
      try {
        if (screen) {
          if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Screen sharing is not supported");
          session.screenStream?.getTracks().forEach((track) => track.stop());
          const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          if (cancelled) { display.getTracks().forEach((track) => track.stop()); return; }
          session.screenStream = display;
          const track = display.getVideoTracks()[0];
          track.addEventListener("ended", () => setScreenShareEnabled(false), { once: true });
          for (const bundle of session.peers.values()) {
            if (bundle.videoSender) await bundle.videoSender.replaceTrack(track); else bundle.videoSender = bundle.pc.addTrack(track, display);
          }
          localPreviewStream = display; mediaChanged();
          await renegotiate();
        } else {
          session.screenStream?.getTracks().forEach((track) => track.stop()); session.screenStream = null;
          let cameraTrack: MediaStreamTrack | null = null;
          if (camera) {
            if (!session.cameraStream?.getVideoTracks().length) session.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            cameraTrack = session.cameraStream.getVideoTracks()[0] ?? null;
          } else {
            session.cameraStream?.getTracks().forEach((track) => track.stop()); session.cameraStream = null;
          }
          for (const bundle of session.peers.values()) {
            if (bundle.videoSender) await bundle.videoSender.replaceTrack(cameraTrack); else if (cameraTrack && session.cameraStream) bundle.videoSender = bundle.pc.addTrack(cameraTrack, session.cameraStream);
          }
          localPreviewStream = cameraTrack && session.cameraStream ? new MediaStream([cameraTrack, ...session.local.getAudioTracks()]) : session.local; mediaChanged();
          await renegotiate();
        }
      } catch {
        if (screen) setScreenShareEnabled(false);
        if (camera) setCameraEnabled(false);
      }
    };
    void applyVideo();
    return () => { cancelled = true; };
  }, [camera, screen, joinedVoiceId, currentUser.id, setScreenShareEnabled, setCameraEnabled]);

  return null;
}
