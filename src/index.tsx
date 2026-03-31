import { useAgent } from "agents/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BandMemberAvatars } from "./components/BandMemberAvatars";
import { HeroBackdrop } from "./components/HeroBackdrop";
import { CommandHistory } from "./components/CommandHistory";
import { MemoryTimeline } from "./components/MemoryTimeline";
import { Waveform } from "./components/Waveform";
import type {
  CurrentMixInfo,
  JamRoomStateShape,
  VoiceCommandResult,
} from "./types";
import "./styles.css";

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function getRoomFromLocation(): string {
  const q = new URLSearchParams(window.location.search).get("room");
  return q && q.length > 2 ? q : "jam-default";
}

function EternalJamApp() {
  const [roomId, setRoomId] = useState<string>(() => getRoomFromLocation());
  const [roomState, setRoomState] = useState<JamRoomStateShape | null>(null);
  const [textCmd, setTextCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [shareUrl, setShareUrl] = useState(() => window.location.href);
  const [liveAnalyser, setLiveAnalyser] = useState<AnalyserNode | null>(null);
  const [copied, setCopied] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  const connected = roomState !== null;
  const generating =
    roomState?.generationPhase === "directing" ||
    roomState?.generationPhase === "generating";

  const agent = useAgent<JamRoomStateShape>({
    agent: "JamRoom",
    name: roomId,
    onStateUpdate: (s) => setRoomState(s),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("room", roomId);
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
    setShareUrl(window.location.href);
  }, [roomId]);

  const playLatestMix = useCallback(async () => {
    if (!roomId) return;
    setStatus("Loading mix…");
    try {
      const info = (await agent.call("getCurrentMix", [])) as CurrentMixInfo;
      const el = audioRef.current;
      if (!el) return;
      el.pause();
      const prev = el.src;
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      if (info.audioBase64) {
        const blob = base64ToBlob(info.audioBase64, info.mime);
        el.src = URL.createObjectURL(blob);
      } else {
        el.src = info.audioUrlPath;
      }
      await el.play();
      setStatus("Playing");
    } catch (e) {
      console.error(e);
      setStatus("Could not play audio — the room may not have a mix yet");
    }
  }, [roomId, agent]);

  useEffect(() => {
    if (!roomState?.mixVersion) return;
    void playLatestMix();
  }, [roomState?.mixVersion, playLatestMix]);

  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el?.src.startsWith("blob:")) URL.revokeObjectURL(el.src);
    };
  }, []);

  const ensureMicGraph = useCallback(async () => {
    if (analyserRef.current) return analyserRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    analyserRef.current = an;
    setLiveAnalyser(an);
    return an;
  }, []);

  const stopMic = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setLiveAnalyser(null);
  }, []);

  useEffect(() => () => stopMic(), [stopMic]);

  const startRecording = useCallback(async () => {
    if (recording || busy) return;
    setStatus("Listening… (release to send)");
    await ensureMicGraph();
    const stream = mediaStreamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorderRef.current = rec;
    rec.ondataavailable = (ev) => {
      if (ev.data.size) chunksRef.current.push(ev.data);
    };
    rec.start();
    setRecording(true);
  }, [recording, busy, ensureMicGraph]);

  const stopRecordingAndSend = useCallback(async () => {
    if (!recording) return;
    const rec = recorderRef.current;
    if (!rec) return;
    setRecording(false);
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    setStatus("Transcribing…");
    const fd = new FormData();
    fd.set("audio", blob, "voice.webm");
    const res = await fetch(`/api/jam/${encodeURIComponent(roomId)}/transcribe`, {
      method: "POST",
      body: fd,
    });
    const data = (await res.json()) as { text?: string; error?: string };
    if (!res.ok || !data.text) {
      setStatus(data.error ?? "Transcription failed");
      return;
    }
    setBusy(true);
    setStatus("Directing the band…");
    await agent.ready;
    const r = (await agent.call("voiceCommand", [
      data.text,
      "voice",
    ])) as VoiceCommandResult;
    setBusy(false);
    if (!r.ok) setStatus(r.error ?? "Command failed");
    else setStatus("Got it.");
    stopMic();
  }, [recording, roomId, agent, stopMic]);

  // Spacebar push-to-talk (only when not focused on a text input)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      void startRecording();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      void stopRecordingAndSend();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startRecording, stopRecordingAndSend]);

  const sendText = async () => {
    const t = textCmd.trim();
    if (!t) return;
    setBusy(true);
    setStatus("Sending…");
    await agent.ready;
    const r = (await agent.call("voiceCommand", [
      t,
      "text",
    ])) as VoiceCommandResult;
    setBusy(false);
    setTextCmd("");
    if (!r.ok) setStatus(r.error ?? "Failed");
    else setStatus("Queued generation");
  };

  const createRoom = async () => {
    const res = await fetch("/api/jam/rooms", { method: "POST" });
    const data = (await res.json()) as { id?: string };
    if (data.id) setRoomId(data.id);
  };

  const runDemo = async (id: string) => {
    setBusy(true);
    setStatus("Demo style…");
    await agent.ready;
    const r = (await agent.call("loadDemoStyle", [id])) as {
      ok: boolean;
      error?: string;
    };
    setBusy(false);
    setStatus(r.ok ? "Demo rolling" : r.error ?? "Demo failed");
  };

  const exportTrack = async () => {
    setBusy(true);
    await agent.ready;
    const r = (await agent.call("exportTrack", [])) as {
      ok: boolean;
      r2Key?: string;
      error?: string;
    };
    setBusy(false);
    setStatus(
      r.ok
        ? `Exported${r.r2Key ? ` → ${r.r2Key}` : ""}`
        : r.error ?? "Export failed",
    );
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const moodLine = useMemo(() => {
    if (!roomState) return "Connecting to jam room…";
    const { mood, generationPhase, lastError } = roomState;
    return `${mood.genre} · ${mood.bpm} BPM · ${mood.emotion} · ${generationPhase}${lastError ? ` · ${lastError}` : ""}`;
  }, [roomState]);

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-main">
          <HeroBackdrop />
          <div className="hero-text">
            <h1>Eternal Jam Session</h1>
            <p className="tag">
              Voice-direct an AI band. The room remembers every prompt, evolves
              while you are away, and syncs in realtime across collaborators.
            </p>
          </div>
        </div>
        <div className="pill-row">
          <span className={`conn-dot ${connected ? "connected" : ""}`} />
          <span className="pill">{connected ? `Room: ${roomId}` : "Connecting…"}</span>
          <span className="pill">Cloudflare Agents + DO</span>
          <span className="pill">ElevenLabs Music · STT · SFX</span>
        </div>
      </header>

      <section className={`panel ${generating ? "panel-generating" : ""}`}>
        <Waveform analyser={liveAnalyser} />
        {roomState && (
          <BandMemberAvatars
            stems={roomState.activeStems}
            phase={roomState.generationPhase}
          />
        )}

        {generating && (
          <div className="gen-bar">
            <div className="gen-bar-fill" />
            <span className="gen-bar-label">
              {roomState?.generationPhase === "directing"
                ? "AI is planning the next section…"
                : "Generating music…"}
            </span>
          </div>
        )}

        <div className="panel-meta">
          <p className="status-line">{moodLine}</p>
          {roomState?.lastError ? (
            <p className="error">{roomState.lastError}</p>
          ) : null}
        </div>

        <div className="control-suite">
          <div className="controls">
            <input
              ref={textInputRef}
              type="text"
              className="control-input"
              placeholder='Try: "make the sax argue with the drums"'
              value={textCmd}
              onChange={(e) => setTextCmd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && void sendText()}
              disabled={busy}
              maxLength={500}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !textCmd.trim()}
              onClick={() => void sendText()}
            >
              Send
            </button>
            <button
              type="button"
              className={`btn-mic ${recording ? "recording" : ""}`}
              disabled={busy}
              onMouseDown={() => void startRecording()}
              onMouseUp={() => void stopRecordingAndSend()}
              onMouseLeave={() => recording && void stopRecordingAndSend()}
              onTouchStart={(e) => {
                e.preventDefault();
                void startRecording();
              }}
              onTouchEnd={() => void stopRecordingAndSend()}
              aria-label="Hold to talk — or press spacebar"
            >
              {recording ? "Release to send" : "Hold to talk"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => void playLatestMix()}
            >
              Play last mix
            </button>
          </div>

          <div className="share-field">
            <button type="button" className="btn-ghost" onClick={() => void createRoom()}>
              New room
            </button>
            <input readOnly value={shareUrl} aria-label="Share link" />
            <button type="button" className="btn-ghost" onClick={copyShareLink}>
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => void exportTrack()}
            >
              Export
            </button>
          </div>

          <div className="demo-row">
            <span className="muted demo-label">Demo styles</span>
            {(["lofi-sunday", "neon-night", "soul-basement"] as const).map((id) => (
              <button
                key={id}
                type="button"
                className="btn-ghost btn-ghost--compact"
                disabled={busy}
                onClick={() => void runDemo(id)}
              >
                {id.replace(/-/g, " ")}
              </button>
            ))}
          </div>

          {status ? <p className="status-line status-line--suite">{status}</p> : null}

          <p className="hint muted">
            Spacebar works as push-to-talk when focus is outside the text input.
          </p>
        </div>
      </section>

      <div className="grid-2">
        <div className="panel">
          <CommandHistory timeline={roomState?.timeline ?? []} />
        </div>
        <div className="panel">
          <MemoryTimeline timeline={roomState?.timeline ?? []} />
        </div>
      </div>

      <audio ref={audioRef} className="visually-hidden" controls={false} />
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<EternalJamApp />);
