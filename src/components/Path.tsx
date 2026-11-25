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

/** A page opener: a greeting and, optionally, one sentence under it. */
export function Welcome({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="welcome" style={{ marginBottom: 22 }}>
      <div>
        <h1>{title}</h1>
        {children && <div className="sub" style={{ marginTop: 6, maxWidth: "60ch" }}>{children}</div>}
      </div>
    </div>
  );
}
