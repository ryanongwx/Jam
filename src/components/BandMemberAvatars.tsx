import type { StemLayer } from "../types";

type Props = {
  stems: StemLayer[];
  phase: string;
};

export function BandMemberAvatars({ stems, phase }: Props) {
  return (
    <div className="band-row">
      {stems.map((s) => {
        const pulse = s.level * (phase === "generating" ? 1.25 : 1);
        return (
          <div key={s.role} className="band-member" title={s.label}>
            <div
              className="band-orb"
              style={{
                transform: `scale(${0.85 + pulse * 0.35})`,
                boxShadow: `0 0 ${12 + pulse * 28}px rgba(196, 167, 255, ${0.35 + pulse * 0.4})`,
              }}
            />
            <span className="band-label">{s.label}</span>
            <span className="band-role">{s.role}</span>
          </div>
        );
      })}
    </div>
  );
}
