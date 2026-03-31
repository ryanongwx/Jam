import { useEffect, useRef } from "react";

type Props = {
  analyser: AnalyserNode | null;
  color?: string;
};

export function Waveform({ analyser, color = "#c4a7ff" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;

    const data = new Uint8Array(analyser ? analyser.frequencyBinCount : 128);

    const draw = () => {
      raf.current = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      ctx2.fillStyle = "#0c0a12";
      ctx2.fillRect(0, 0, w, h);
      if (analyser) {
        analyser.getByteFrequencyData(data);
      } else {
        for (let i = 0; i < data.length; i++) {
          data[i] = 8 + Math.random() * 24;
        }
      }
      const bars = 64;
      const step = Math.floor(data.length / bars);
      for (let i = 0; i < bars; i++) {
        let v = 0;
        for (let j = 0; j < step; j++) v += data[i * step + j] ?? 0;
        v /= step * 255;
        const bh = Math.max(4, v * h * 0.95);
        ctx2.fillStyle = color;
        const x = (i / bars) * w;
        const bw = w / bars - 2;
        ctx2.fillRect(x, h - bh, Math.max(1, bw), bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf.current);
  }, [analyser, color]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={92}
      className="waveform-canvas"
      aria-hidden
    />
  );
}
