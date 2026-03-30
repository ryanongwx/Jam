export type JamMood = {
  genre: string;
  bpm: number;
  energy: number;
  emotion: string;
};

export type JamHistoryEntry = {
  id: string;
  at: number;
  userPrompt: string;
  musicPrompt: string;
  compositionId?: string;
  source: "voice" | "text" | "auto";
};

export type StemLayer = {
  role: "drums" | "bass" | "melody" | "vocals" | "fx";
  label: string;
  /** Relative level 0–1 for client mixing visualization */
  level: number;
};

export type JamRoomStateShape = {
  roomId: string;
  mood: JamMood;
  bandMembers: Record<string, string>;
  currentCompositionId: string | null;
  lastEvolvedAt: number | null;
  lastCommandAt: number;
  lastError: string | null;
  mixVersion: number;
  generationPhase: "idle" | "directing" | "generating" | "mixing" | "ready";
  activeStems: StemLayer[];
  /** Lightweight timeline for UI sync (full log also in SQL) */
  timeline: { id: string; text: string; at: number; source: JamHistoryEntry["source"] }[];
  demoMode: boolean;
};

/** Client-side RPC typing for `useAgent` (no server imports). */
export type JamRoomRpc = {
  voiceCommand(
    text: string,
    source?: "voice" | "text",
  ): Promise<VoiceCommandResult>;
  getCurrentMix(): Promise<CurrentMixInfo>;
  exportTrack(): Promise<ExportTrackResult>;
  getJamSnapshot(): Promise<JamSnapshot>;
  loadDemoStyle(styleId: string): Promise<{ ok: boolean; styleId: string }>;
};

export type VoiceCommandResult = {
  ok: boolean;
  musicPrompt?: string;
  mixVersion?: number;
  error?: string;
};

export type CurrentMixInfo = {
  mixVersion: number;
  mime: string;
  /** Present when mix is small enough for RPC; otherwise fetch /api/jam/:id/audio */
  audioBase64?: string;
  audioUrlPath: string;
  mood: JamMood;
  stems: StemLayer[];
};

export type ExportTrackResult = {
  ok: boolean;
  r2Key?: string;
  publicUrl?: string;
  error?: string;
};

export type JamSnapshot = {
  mood: JamMood;
  mixVersion: number;
  timeline: JamRoomStateShape["timeline"];
  bandMembers: Record<string, string>;
  lastEvolvedAt: number | null;
};

/** Parsed Workers AI output + fallbacks for ElevenLabs Music. */
export type DirectorPlan = {
  elevenMusicPrompt: string;
  musicLengthMs: number;
  forceInstrumental: boolean;
  /** When true, server runs stem separation on the composed loop */
  separateStems: boolean;
  stemNotes: string;
  sfxPrompt?: string;
};
