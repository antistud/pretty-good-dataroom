import Link from "next/link";

export default function NotFound() {
  return (
    <div className="center">
      <div className="card">
        <h1>That page is not here</h1>
        <p className="muted" style={{ marginTop: 8 }}>It may have been moved or removed, or the link may be mistyped. Nothing is wrong with your account.</p>
        <p><Link className="btn primary" href="/home">Back to the start</Link></p>
      </div>
    </div>
  );
}
