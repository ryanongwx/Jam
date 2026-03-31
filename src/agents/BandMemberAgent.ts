export type BandRole = "drums" | "bass" | "melody" | "vocals" | "fx";

/**
 * Lightweight "sub-agent" descriptor: each band member has a stable role label
 * and optional ElevenLabs voice id (for TTS / vocal hooks).
 */
export class BandMemberAgent {
  constructor(
    readonly role: BandRole,
    readonly displayName: string,
    public voiceId: string,
  ) {}
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
