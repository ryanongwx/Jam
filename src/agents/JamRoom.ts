import { Agent, callable } from "agents";
import { craftDirectorPlan } from "./MusicDirector";
import { defaultBandRoster, rosterToVoiceMap } from "./BandMemberAgent";
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  createElevenClient,
  generateSoundEffect,
  separateStemsFromBuffer,
  streamMusicSection,
} from "../lib/elevenlabs";
import type {
  CurrentMixInfo,
  DirectorPlan,
  ExportTrackResult,
  JamHistoryEntry,
  JamMood,
  JamRoomStateShape,
  JamSnapshot,
  StemLayer,
  VoiceCommandResult,
} from "../types";

function evolveMood(prev: JamMood, plan: DirectorPlan): JamMood {
  const delta = (plan.musicLengthMs % 19) - 9;
  return {
    ...prev,
    bpm: Math.min(155, Math.max(68, prev.bpm + delta)),
    energy: Math.min(
      1,
      Math.max(0.08, prev.energy + (plan.separateStems ? 0.06 : -0.02)),
    ),
  };
}

export class JamRoom extends Agent<Env, JamRoomStateShape> {
  initialState: JamRoomStateShape = {
    roomId: "",
    mood: {
      genre: "electronic soul",
      bpm: 94,
      energy: 0.55,
      emotion: "hopeful",
    },
    bandMembers: rosterToVoiceMap(defaultBandRoster()),
    currentCompositionId: null,
    lastEvolvedAt: null,
    lastCommandAt: 0,
    lastError: null,
    mixVersion: 0,
    generationPhase: "idle",
    activeStems: [
      { role: "drums", label: "Drums", level: 0.5 },
      { role: "bass", label: "Bass", level: 0.45 },
      { role: "melody", label: "Melody", level: 0.5 },
      { role: "vocals", label: "Vox", level: 0.2 },
      { role: "fx", label: "FX", level: 0.25 },
    ],
    timeline: [],
    demoMode: false,
  };

  private ensureSchema(): void {
    this
      .sql`CREATE TABLE IF NOT EXISTS jam_mix (id TEXT PRIMARY KEY, mime TEXT NOT NULL, b64 TEXT NOT NULL, created_at INTEGER NOT NULL)`;
    this
      .sql`CREATE TABLE IF NOT EXISTS jam_hist (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, user_text TEXT NOT NULL, music_prompt TEXT NOT NULL, source TEXT NOT NULL)`;
  }

  async onStart(): Promise<void> {
    this.ensureSchema();
    this.setState({ ...this.state, roomId: this.name });
    const ms = Number(this.env.JAM_EVOLVE_INTERVAL_MS ?? 2_700_000);
    const sec = Math.max(120, Math.floor(ms / 1000));
    await this.scheduleEvery(sec, "idleEvolveJam");
  }

  /** Invoked by Agents scheduler — keeps the jam evolving when the room is quiet. */
  async idleEvolveJam(): Promise<void> {
    try {
      const interval = Number(this.env.JAM_EVOLVE_INTERVAL_MS ?? 2_700_000);
      const quietFor = Math.max(120_000, interval / 2);
      if (Date.now() - this.state.lastCommandAt < quietFor) return;
      await this.runMusicPipeline(
        "AUTO: Continue the jam in the same style with subtle variation — keep groove, texture, and emotional arc coherent.",
        "auto",
      );
    } catch (e) {
      console.error("idleEvolveJam failed", e);
    }
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.endsWith("/jam-mix")) {
      const rows = this.sql<{ b64: string; mime: string }>`
        SELECT b64, mime FROM jam_mix WHERE id = 'latest' LIMIT 1`;
      if (!rows.length) {
        return new Response("No mix yet", {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      }
      const body = base64ToArrayBuffer(rows[0].b64);
      return new Response(body, {
        headers: {
          "Content-Type": rows[0].mime,
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  }

  private loadHistoryFromSql(): JamHistoryEntry[] {
    const rows = this.sql<{
      id: number;
      created_at: number;
      user_text: string;
      music_prompt: string;
      source: string;
    }>`
      SELECT id, created_at, user_text, music_prompt, source FROM jam_hist ORDER BY id ASC LIMIT 80`;
    return rows.map((r) => ({
      id: String(r.id),
      at: r.created_at,
      userPrompt: r.user_text,
      musicPrompt: r.music_prompt,
      source: r.source as JamHistoryEntry["source"],
    }));
  }

  private async runMusicPipeline(
    userText: string,
    source: JamHistoryEntry["source"],
  ): Promise<VoiceCommandResult> {
    if (!this.env.ELEVENLABS_API_KEY?.trim()) {
      this.setState({
        ...this.state,
        lastError: "Missing ELEVENLABS_API_KEY",
        generationPhase: "idle",
      });
      return { ok: false, error: "Missing ELEVENLABS_API_KEY" };
    }

    this.setState({
      ...this.state,
      lastCommandAt: Date.now(),
      lastError: null,
      generationPhase: "directing",
    });

    const history = this.loadHistoryFromSql();
    const plan = await craftDirectorPlan(
      this.env,
      userText,
      history,
      this.state.mood,
    );
    plan.musicLengthMs = Math.min(plan.musicLengthMs, 55_000);

    this.setState({ ...this.state, generationPhase: "generating" });

    const client = createElevenClient(this.env.ELEVENLABS_API_KEY);
    let lastBroadcast = 0;
    let seq = 0;
    const buffer = await streamMusicSection(client, plan, (chunk) => {
      seq += 1;
      const now = Date.now();
      if (now - lastBroadcast < 320) return;
      lastBroadcast = now;
      const n = Math.min(chunk.byteLength, 16_384);
      const slice = new Uint8Array(n);
      slice.set(chunk.subarray(0, n));
      try {
        this.broadcast(
          JSON.stringify({
            t: "jam-audio",
            n: seq,
            p: arrayBufferToBase64(slice.buffer),
          }),
        );
      } catch {
        /* ignore broadcast errors */
      }
    });

    if (plan.sfxPrompt) {
      void generateSoundEffect(this.env.ELEVENLABS_API_KEY, plan.sfxPrompt).catch(
        () => undefined,
      );
    }

    if (plan.separateStems) {
      void separateStemsFromBuffer(client, buffer, "section.mp3").catch(
        () => undefined,
      );
    }

    const b64 = arrayBufferToBase64(buffer);
    try {
      this.sql`DELETE FROM jam_mix WHERE id = 'latest'`;
      this.sql`INSERT INTO jam_mix (id, mime, b64, created_at) VALUES ('latest', 'audio/mpeg', ${b64}, ${Date.now()})`;
      this.sql`INSERT INTO jam_hist (created_at, user_text, music_prompt, source) VALUES (${Date.now()}, ${userText}, ${plan.elevenMusicPrompt}, ${source})`;
    } catch (e) {
      console.error("Failed to persist mix", e);
      this.setState({
        ...this.state,
        lastError: "Could not persist mix (too large for SQLite?). Shorten section.",
        generationPhase: "idle",
      });
      return { ok: false, error: "Persist failed" };
    }

    const mixVersion = this.state.mixVersion + 1;
    const timeline = [
      ...this.state.timeline,
      {
        id: crypto.randomUUID(),
        text: userText,
        at: Date.now(),
        source,
      },
    ].slice(-40);

    const stemLayers: StemLayer[] = [
      {
        role: "drums",
        label: "Drums",
        level: plan.separateStems ? 0.88 : 0.55,
      },
      {
        role: "bass",
        label: "Bass",
        level: plan.separateStems ? 0.78 : 0.48,
      },
      {
        role: "melody",
        label: "Melody",
        level: plan.separateStems ? 0.85 : 0.52,
      },
      {
        role: "vocals",
        label: "Vox",
        level: plan.forceInstrumental ? 0.12 : 0.62,
      },
      {
        role: "fx",
        label: "FX",
        level: plan.sfxPrompt ? 0.72 : 0.22,
      },
    ];

    const mood = evolveMood(this.state.mood, plan);

    this.setState({
      ...this.state,
      mood,
      mixVersion,
      generationPhase: "ready",
      timeline,
      activeStems: stemLayers,
      currentCompositionId: `mix-${mixVersion}`,
      lastEvolvedAt: source === "auto" ? Date.now() : this.state.lastEvolvedAt,
    });

    return { ok: true, musicPrompt: plan.elevenMusicPrompt, mixVersion };
  }

  @callable()
  async voiceCommand(
    text: string,
    source: "voice" | "text" = "text",
  ): Promise<VoiceCommandResult> {
    const t = text.trim();
    if (!t) return { ok: false, error: "Empty command" };
    return this.runMusicPipeline(t, source);
  }

  @callable()
  async getCurrentMix(): Promise<CurrentMixInfo> {
    const rows = this.sql<{ b64: string; mime: string }>`
      SELECT b64, mime FROM jam_mix WHERE id = 'latest' LIMIT 1`;
    const maxEmbed = 600_000;
    const b64 = rows[0]?.b64;
    return {
      mixVersion: this.state.mixVersion,
      mime: rows[0]?.mime ?? "audio/mpeg",
      audioBase64:
        b64 && b64.length > 0 && b64.length <= maxEmbed ? b64 : undefined,
      audioUrlPath: `/api/jam/${encodeURIComponent(this.name)}/audio`,
      mood: this.state.mood,
      stems: this.state.activeStems,
    };
  }

  @callable()
  async exportTrack(): Promise<ExportTrackResult> {
    const rows = this.sql<{ b64: string }>`
      SELECT b64 FROM jam_mix WHERE id = 'latest' LIMIT 1`;
    if (!rows.length) return { ok: false, error: "No mix to export yet." };
    const bytes = base64ToArrayBuffer(rows[0].b64);
    const bucket = this.env.JAM_BUCKET;
    if (!bucket) {
      return {
        ok: false,
        error: "R2 binding JAM_BUCKET not configured (optional).",
      };
    }
    const key = `jam/${this.name}/${Date.now()}.mp3`;
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: "audio/mpeg" },
    });
    return { ok: true, r2Key: key };
  }

  @callable()
  async getJamSnapshot(): Promise<JamSnapshot> {
    return {
      mood: this.state.mood,
      mixVersion: this.state.mixVersion,
      timeline: this.state.timeline,
      bandMembers: this.state.bandMembers,
      lastEvolvedAt: this.state.lastEvolvedAt,
    };
  }

  @callable()
  async loadDemoStyle(
    styleId: string,
  ): Promise<{ ok: boolean; styleId: string }> {
    const presets: Record<string, JamMood & { seed: string }> = {
      "lofi-sunday": {
        genre: "lo-fi hip hop",
        bpm: 82,
        energy: 0.32,
        emotion: "nostalgic",
        seed: "dusty vinyl, mellow Rhodes, brushed snare, tape wobble",
      },
      "neon-night": {
        genre: "synthwave",
        bpm: 110,
        energy: 0.78,
        emotion: "euphoric",
        seed: "wide supersaw pads, gated snare, rolling arpeggio bass",
      },
      "soul-basement": {
        genre: "neo-soul",
        bpm: 92,
        energy: 0.5,
        emotion: "intimate",
        seed: "live kit ghost notes, round electric bass, Wurlitzer chords",
      },
    };
    const p = presets[styleId];
    if (!p) return { ok: false, styleId };
    const { seed, ...mood } = p;
    this.setState({ ...this.state, mood, demoMode: true });
    await this.runMusicPipeline(`Demo style (${styleId}): ${seed}`, "text");
    return { ok: true, styleId };
  }
}
