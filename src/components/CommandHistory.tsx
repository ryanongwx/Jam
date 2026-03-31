import type { JamRoomStateShape } from "../types";

type Props = {
  timeline: JamRoomStateShape["timeline"];
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function CommandHistory({ timeline }: Props) {
  const items = [...timeline].reverse().slice(0, 12);
  return (
    <div className="command-history">
      <h3>Recent commands</h3>
      <ul>
        {items.length === 0 ? (
          <li className="muted">Say something poetic to the band…</li>
        ) : (
          items.map((e) => (
            <li key={e.id}>
              <span className={`src src-${e.source}`}>{e.source}</span>
              <span className="cmd-text">{e.text}</span>
              <span className="cmd-time">{relativeTime(e.at)}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
