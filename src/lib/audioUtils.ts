/**
 * Browser-side helpers: decode, layer, and crossfade short MP3 sections for the jam UI.
 */

export async function decodeMp3(
  ctx: AudioContext,
  data: ArrayBuffer,
): Promise<AudioBuffer> {
  const copy = data.slice(0);
  return ctx.decodeAudioData(copy);
}

export function crossfadeAt(
  ctx: AudioContext,
  from: AudioBufferSourceNode | null,
  to: AudioBuffer,
  when: number,
  overlapSec = 0.08,
): AudioBufferSourceNode {
  const next = ctx.createBufferSource();
  next.buffer = to;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, when);
  gain.gain.exponentialRampToValueAtTime(1, when + overlapSec);
  next.connect(gain);
  gain.connect(ctx.destination);
  if (from) {
    const fg = ctx.createGain();
    from.disconnect();
    from.connect(fg);
    fg.connect(ctx.destination);
    fg.gain.setValueAtTime(1, when);
    fg.gain.exponentialRampToValueAtTime(0.001, when + overlapSec);
    from.stop(when + overlapSec + 0.02);
  }
  next.start(when);
  return next;
}

/** RMS level for simple waveform / meter animation */
export function meterFromTimeDomain(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}
