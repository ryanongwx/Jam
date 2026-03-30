import type { JamRoomStateShape } from "../types";

type Props = {
  timeline: JamRoomStateShape["timeline"];
};

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
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
