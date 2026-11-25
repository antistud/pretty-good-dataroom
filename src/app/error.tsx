"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="center">
      <div className="card">
        <h1>Something went wrong</h1>
        <p className="muted" style={{ marginTop: 8 }}>That is on us, not you. Nothing you entered elsewhere has been lost. Try again, and if it keeps happening, tell the person who runs this room.</p>
        <div className="row">
          <button className="btn primary" onClick={() => reset()}>Try again</button>
          <a className="btn" href="/home">Back to the start</a>
        </div>
      </div>
    </div>
  );
}
