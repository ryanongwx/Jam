import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { DirectorPlan } from "../types";

export function createElevenClient(apiKey: string) {
  return new ElevenLabsClient({ apiKey });
}

/** Read a ReadableStream from the ElevenLabs SDK into an ArrayBuffer (Workers-safe). */
export async function readReadableStreamToBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Compose a section (full buffer). Prefer mp3_44100_128 for quality vs size. */
export async function composeMusicSection(
  client: ElevenLabsClient,
  plan: DirectorPlan,
): Promise<{ buffer: ArrayBuffer; mime: string }> {
  const stream = await client.music.compose({
    prompt: plan.elevenMusicPrompt,
    musicLengthMs: plan.musicLengthMs,
    modelId: "music_v1",
    forceInstrumental: plan.forceInstrumental,
    outputFormat: "mp3_44100_128",
  });
  const buffer = await readReadableStreamToBuffer(stream);
  return { buffer, mime: "audio/mpeg" };
}

/** Stream chunks to a callback (e.g. RPC streaming or progress). */
export async function streamMusicSection(
  client: ElevenLabsClient,
  plan: Pick<DirectorPlan, "elevenMusicPrompt" | "musicLengthMs" | "forceInstrumental">,
  onChunk: (chunk: Uint8Array) => void,
): Promise<ArrayBuffer> {
  const stream = await client.music.stream({
    prompt: plan.elevenMusicPrompt,
    musicLengthMs: plan.musicLengthMs,
    modelId: "music_v1",
    forceInstrumental: plan.forceInstrumental,
    outputFormat: "mp3_44100_128",
  });
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      onChunk(value);
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

/** Separate stems from a composed buffer (returns streamed multi-part or single — we collect bytes). */
export async function separateStemsFromBuffer(
  client: ElevenLabsClient,
  buffer: ArrayBuffer,
  filename: string,
): Promise<ArrayBuffer> {
  const file = new File([buffer], filename, { type: "audio/mpeg" });
  const stream = await client.music.separateStems({
    file,
    outputFormat: "mp3_44100_128",
  });
  return readReadableStreamToBuffer(stream);
}

/** Short SFX layer (optional). */
export async function generateSoundEffect(
  apiKey: string,
  text: string,
): Promise<ArrayBuffer | null> {
  if (!text.trim()) return null;
  const client = createElevenClient(apiKey);
  const stream = await client.textToSoundEffects.convert({
    text,
    durationSeconds: 2,
    promptInfluence: 0.35,
  });
  return readReadableStreamToBuffer(stream);
}

/** Batch STT via Scribe v2 (multipart file from Worker). */
function speechToTextToPlainText(res: unknown): string {
  if (!res || typeof res !== "object") return "";
  if ("text" in res && typeof (res as { text: string }).text === "string") {
    return (res as { text: string }).text;
  }
  if (
    "transcripts" in res &&
    Array.isArray((res as { transcripts: { text?: string }[] }).transcripts)
  ) {
    return (res as { transcripts: { text?: string }[] })
      .transcripts.map((t) => t.text ?? "")
      .join(" ")
      .trim();
  }
  return "";
}

export async function transcribeAudioBlob(
  apiKey: string,
  blob: Blob,
): Promise<string> {
  const client = createElevenClient(apiKey);
  const res = await client.speechToText.convert({
    file: blob,
    modelId: "scribe_v2",
    enableLogging: true,
  });
  return speechToTextToPlainText(res).trim();
}

/** TTS for optional “band chatter” / vocal hooks (per-band voices). */
export async function ttsLine(
  apiKey: string,
  voiceId: string,
  text: string,
): Promise<ArrayBuffer> {
  const client = createElevenClient(apiKey);
  const stream = await client.textToSpeech.convert(voiceId, {
    text,
    modelId: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
  });
  return readReadableStreamToBuffer(stream);
}
