import { transcribeAudioBlob } from "../lib/elevenlabs";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * HTTP helpers for shareable room links, audio download, and batch STT (Scribe v2).
 * WebSocket + RPC remain on the Agents route.
 */
export async function handleJamHttp(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);

  if (url.pathname === "/api/jam/rooms" && request.method === "POST") {
    const id = `jam-${crypto.randomUUID()}`;
    return json({ id });
  }

  const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

  let m = url.pathname.match(/^\/api\/jam\/([^/]+)\/transcribe$/);
  if (m && request.method === "POST") {
    if (!env.ELEVENLABS_API_KEY) {
      return json({ error: "ELEVENLABS_API_KEY not set" }, 500);
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_AUDIO_BYTES) {
      return json({ error: "Audio file too large (max 10 MB)" }, 413);
    }
    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return json({ error: "Expected multipart field 'audio'" }, 400);
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return json({ error: "Audio file too large (max 10 MB)" }, 413);
    }
    try {
      const text = await transcribeAudioBlob(env.ELEVENLABS_API_KEY, file);
      return json({ text });
    } catch (e) {
      console.error("transcribe", e);
      return json({ error: "Transcription failed" }, 502);
    }
  }

  m = url.pathname.match(/^\/api\/jam\/([^/]+)\/audio$/);
  if (m && request.method === "GET") {
    const roomId = decodeURIComponent(m[1]);
    const id = env.JamRoom.idFromName(roomId);
    const stub = env.JamRoom.get(id);
    return stub.fetch(new Request("https://jam.internal/jam-mix"));
  }

  return json({ error: "Not found" }, 404);
}
