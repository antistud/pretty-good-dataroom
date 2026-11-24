/**
 * Small visual motifs for the guided parts of the app: a sprout that grows as
 * someone makes progress, and a path that shows where they are on the journey.
 */

/** stage 0..4: seed, sprout, two leaves, four leaves, in bloom. */
export function Sprout({ stage, size = 72 }: { stage: number; size?: number }) {
  const s = Math.max(0, Math.min(4, Math.round(stage)));
  const stem = [5, 10, 18, 26, 32][s];
  const top = 50 - stem;
  return (
    <svg className="sprout" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="54" rx="20" ry="5" fill="var(--line)" />
      <path d="M16 54a16 6 0 0 1 32 0z" fill="var(--accent)" opacity="0.55" />
      {s === 0 && <path className="leaf" d={`M32 ${top + 1} c1 -5 5 -7 8 -6 c0 4 -3 7 -8 6z`} fill="var(--brand)" />}
      {<path d={`M32 52 V${top}`} stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" fill="none" />}
      {s >= 1 && <path className="leaf" d={`M32 ${top + 2} c1 -8 8 -11 13 -10 c0 7 -5 11 -13 10z`} fill="var(--brand)" />}
      {s >= 2 && <path className="leaf" d={`M32 ${top + 5} c-1 -7 -7 -10 -12 -9 c0 6 5 10 12 9z`} fill="var(--brand)" opacity="0.8" />}
      {s >= 3 && <path className="leaf" d={`M32 ${top + 14} c1 -6 7 -8 11 -7 c0 5 -4 8 -11 7z`} fill="var(--brand)" opacity="0.9" />}
      {s >= 3 && <path className="leaf" d={`M32 ${top + 17} c-1 -6 -6 -8 -10 -7 c0 5 4 8 10 7z`} fill="var(--brand)" opacity="0.7" />}
      {s >= 4 && (
        <g className="leaf">
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx="32" cy={top - 5} r="3.6" fill="var(--accent)" transform={`rotate(${a} 32 ${top})`} />
          ))}
          <circle cx="32" cy={top} r="2.8" fill="var(--warn-bg)" stroke="var(--accent)" strokeWidth="1" />
        </g>
      )}
    </svg>
  );
}

export type JourneyStop = { label: string; hint?: string };

/** A horizontal path. `current` is the index of the stop the person is on; earlier stops are done. */
export function Journey({ stops, current }: { stops: JourneyStop[]; current: number }) {
  return (
    <ol className="journey" style={{ listStyle: "none", paddingLeft: 2 }}>
      {stops.map((stop, i) => (
        <li key={stop.label} className={`stop ${i < current ? "done" : i === current ? "here" : ""}`} title={stop.hint}>
          <div className="dot">{i < current ? "✓" : ""}</div>
          {stop.label}
        </li>
      ))}
    </ol>
  );
}

/** A warm page opener: greeting, one sentence, and the sprout. */
export function Welcome({ title, children, stage }: { title: string; children?: React.ReactNode; stage: number }) {
  return (
    <div className="welcome" style={{ marginBottom: 22 }}>
      <Sprout stage={stage} />
      <div>
        <h1>{title}</h1>
        {children && <div className="muted" style={{ marginTop: 6, fontSize: 16.5, maxWidth: "62ch" }}>{children}</div>}
      </div>
    </div>
  );
}
