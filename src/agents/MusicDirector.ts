import { z } from "zod";
import {
  DIRECTOR_JSON_SCHEMA_HINT,
  MUSIC_DIRECTOR_SYSTEM,
} from "../lib/prompts";
import type { DirectorPlan, JamHistoryEntry, JamMood } from "../types";

const DirectorSchema = z.object({
  elevenMusicPrompt: z.string().min(8),
  musicLengthMs: z.number().min(3000).max(600_000),
  forceInstrumental: z.boolean(),
  separateStems: z.boolean(),
  stemNotes: z.string(),
  sfxPrompt: z.string().optional(),
});

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return s.trim();
}

function summarizeHistory(entries: JamHistoryEntry[], max = 12): string {
  return entries
    .slice(-max)
    .map((e) => `- (${e.source}) ${e.userPrompt}`)
    .join("\n");
}

/**
 * Uses Workers AI to turn a natural-language command into a structured ElevenLabs plan.
 */
export async function craftDirectorPlan(
  env: Env,
  command: string,
  history: JamHistoryEntry[],
  mood: JamMood,
): Promise<DirectorPlan> {
  const historySummary = summarizeHistory(history);
  const user = `Command: ${command}

Current mood: ${JSON.stringify(mood)}

Prior prompts (most recent last):
${historySummary || "(none yet)"}

${DIRECTOR_JSON_SCHEMA_HINT}`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      { role: "system", content: MUSIC_DIRECTOR_SYSTEM },
      { role: "user", content: user },
    ];

  let rawText = "";
  try {
    const out = await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as keyof AiModels,
      {
        messages,
      },
    );
    rawText =
      typeof out === "object" && out !== null && "response" in out
        ? String((out as { response: string }).response)
        : JSON.stringify(out);
  } catch (e) {
    console.error("Workers AI director failed", e);
    return fallbackPlan(command, mood);
  }

  const parsed = tryParseDirector(rawText);
  if (parsed) return parsed;
  return fallbackPlan(command, mood);
}

function tryParseDirector(rawText: string): DirectorPlan | null {
  const cleaned = stripJsonFences(rawText);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const json = JSON.parse(cleaned.slice(start, end + 1));
    const r = DirectorSchema.safeParse(json);
    if (!r.success) return null;
    return r.data;
  } catch {
    return null;
  }
}

function fallbackPlan(command: string, mood: JamMood): DirectorPlan {
  return {
    elevenMusicPrompt: `${mood.genre} jam around ${mood.bpm} BPM, ${mood.emotion} energy. User direction: ${command}. Cohesive groove, modern production, wide stereo, punchy low end.`,
    musicLengthMs: 24_000,
    forceInstrumental: true,
    separateStems: /sax|drum|bass|melody|argue|layer|stem/i.test(command),
    stemNotes:
      "Keep rhythmic push-pull between harmonic and percussive elements.",
    sfxPrompt: /drop|impact|hit/i.test(command)
      ? "short sub drop impact with airy noise tail"
      : undefined,
  };
}
