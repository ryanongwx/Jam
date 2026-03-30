import type { JamRoomStateShape } from "../types";

type Props = {
  timeline: JamRoomStateShape["timeline"];
};

export function MemoryTimeline({ timeline }: Props) {
  return (
    <div className="memory-timeline">
      <h3>Jam memory</h3>
      <div className="timeline-track">
        {timeline.length === 0 ? (
          <p className="muted">The room remembers every direction you give.</p>
        ) : (
          timeline.map((e, i) => (
            <div key={e.id} className="timeline-node" style={{ left: `${(i / Math.max(1, timeline.length - 1)) * 100}%` }}>
              <div className="timeline-dot" title={e.text} />
            </div>
          ))
        )}
      </div>
      <p className="timeline-caption">
        {timeline.length} moments · persisted in Durable Objects + SQLite
      </p>
    </div>
  );
}
