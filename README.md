# Eternal Jam Session

**Hackathon:** ElevenHacks (Cloudflare + ElevenLabs)  
**Pitch:** A never-ending, persistent, collaborative music room. You direct an AI band with **voice or text**; the jam **remembers** every prompt; the track **keeps evolving** while you are away—then syncs instantly when collaborators join.

## Innovation highlights

1. **Voice as creative director (not chat)** — Push-to-talk (batch Scribe v2 STT) turns performance language into ElevenLabs Music prompts. Text fallback stays first-class.
2. **Persistent musical memory + autonomous evolution** — One **Durable Object (`JamRoom`)** per room with **Agents SDK** state sync + **SQLite** history. **`scheduleEvery`** fires an **idle evolution** on a configurable interval (default 45 minutes via `JAM_EVOLVE_INTERVAL_MS`).
3. **Multi-user realtime** — All clients attach to the same DO name; **state broadcasts** keep mood, timeline, stems, and mix version aligned; optional **WebSocket `broadcast` snippets** during streaming generation.
4. **Coordinated “sub-agents”** — `BandMemberAgent` models drums / bass / melody / vocals / FX with distinct voice IDs (swap for **Voice Design** IDs). **Workers AI** (`MusicDirector`) turns natural language into structured ElevenLabs plans (JSON), including **stem strategy** and optional **SFX** prompts.
5. **ElevenLabs depth** — Official **`@elevenlabs/elevenlabs-js`**: **Music stream** (low-latency chunks), **compose**, **stem separation** (best-effort), **Sound Effects**, **TTS**, **Speech-to-Text**.

## Stack (as built)

| Layer | Tech |
| --- | --- |
| Edge + static | **Cloudflare Workers** + **Assets** (Vite-built React SPA) |
| Stateful core | **Durable Object** `JamRoom` via **Cloudflare Agents SDK** (`Agent`, `@callable`, schedules) |
| AI direction | **Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| Audio APIs | **ElevenLabs** Music / STT / TTS / SFX |
| Optional export | **R2** binding `JAM_BUCKET` (uncomment in `wrangler.toml`) |

## Quick start

```bash
npm install
cp .dev.vars.example .dev.vars
# add ELEVENLABS_API_KEY
npm run build
npx wrangler dev
```

Open the URL Wrangler prints (same origin for `/agents/...` WebSockets + `/api/...` routes).

### Deploy (single command)

```bash
npm run deploy
```

Set secrets in production:

```bash
npx wrangler secret put ELEVENLABS_API_KEY
```

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | **Yes** | Music + STT + SFX + TTS |
| `JAM_EVOLVE_INTERVAL_MS` | No | In `wrangler.toml` (`vars`); default 2_700_000 ms |
| `JAM_BUCKET` | No | R2 binding for `exportTrack()` |
| `CLOUDFLARE_AI_GATEWAY` | No | Extend `MusicDirector` to thread gateway options if desired |

## Architecture (high level)

```text
Browser (React + Web Audio + mic)
    │  WebSocket + RPC (Agents)
    ▼
Worker (`src/server.ts`)
    ├─ routeAgentRequest → JamRoom DO
    ├─ /api/jam/rooms (create shareable id)
    ├─ /api/jam/:room/transcribe (multipart → ElevenLabs STT)
    └─ /api/jam/:room/audio (DO fetch → latest MP3)
              │
              ▼
       JamRoom (Agent + SQLite)
            ├─ state: mood, timeline, stems, mixVersion…
            ├─ SQL: full prompt history + latest mix (base64)
            ├─ MusicDirector → Workers AI → ElevenLabs Music.stream
            ├─ broadcast(JSON) progress chunks (optional client hook)
            └─ scheduleEvery → idleEvolveJam
```

## Project layout

```text
src/
├── index.tsx              # React app (mic, player, share links, demos)
├── server.ts              # Worker entry + asset fallback
├── agents/
│   ├── JamRoom.ts         # Durable Object (schedules, RPC, persistence)
│   ├── BandMemberAgent.ts # Sub-agent / voice map helpers
│   └── MusicDirector.ts   # Workers AI → DirectorPlan JSON
├── lib/
│   ├── elevenlabs.ts      # SDK wrappers + stream helpers
│   ├── audioUtils.ts      # Client Web Audio helpers
│   └── prompts.ts         # Director system prompt + examples
├── routes/
│   └── jam.ts             # REST helpers (rooms, audio, STT)
├── components/            # Waveform, band avatars, history, timeline
└── types.ts               # Shared contracts
```

## Success criteria (hackathon checklist)

- [x] Realtime voice direction (batch STT → RPC `voiceCommand`)
- [x] Persistent evolution (DO storage + scheduled `idleEvolveJam`)
- [x] Multi-user sync (shared DO name + state broadcast)
- [x] High-quality section rendering (Music **stream** + MP3)
- [x] Stems + SFX hooks (director flags + separation attempt + SFX generation)
- [x] One-command deploy (`npm run deploy`)

## Optional next steps

- **Vectorize** embeddings of `jam_hist` for long-horizon semantic memory.
- **Realtime STT WebSocket** proxy (server-attached) for sub-second dictation.
- **R2** always-on full stems + multipart downloads.
- **Client-side** true stem crossfade using returned separation assets (today: single stereo bed + animated stem levels).

## License

MIT (hackathon / demo use—verify ElevenLabs + Cloudflare terms for production).
