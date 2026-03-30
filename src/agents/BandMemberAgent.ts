import type { JamMood } from "../types";

export type BandRole = "drums" | "bass" | "melody" | "vocals" | "fx";

/**
 * Lightweight “sub-agent” descriptor: each band member has a stable role label,
 * optional ElevenLabs voice id (for TTS / vocal hooks), and reacts to mood.
 */
export class BandMemberAgent {
  constructor(
    readonly role: BandRole,
    readonly displayName: string,
    public voiceId: string,
  ) {}

  /** Energy 0–1 for UI pulses when this stem is emphasized */
  reactToMood(mood: JamMood): number {
    const base = mood.energy;
    switch (this.role) {
      case "drums":
        return Math.min(1, base + 0.15);
      case "bass":
        return Math.min(1, base + 0.05);
      case "melody":
        return Math.min(1, base + 0.1);
      case "vocals":
        return Math.min(1, base + 0.08);
      default:
        return base;
    }
  }
}

/** Default voices: swap for Voice Design IDs; all use Rachel as a safe preset. */
export function defaultBandRoster(): Record<BandRole, BandMemberAgent> {
  const v = "21m00Tcm4TlvDq8ikWAM";
  return {
    drums: new BandMemberAgent("drums", "Kit", v),
    bass: new BandMemberAgent("bass", "Low", v),
    melody: new BandMemberAgent("melody", "Keys", v),
    vocals: new BandMemberAgent("vocals", "Vox", v),
    fx: new BandMemberAgent("fx", "Spark", v),
  };
}

export function rosterToVoiceMap(
  roster: Record<BandRole, BandMemberAgent>,
): Record<string, string> {
  return Object.fromEntries(
    Object.values(roster).map((m) => [m.role, m.voiceId]),
  );
}
