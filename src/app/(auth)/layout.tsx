import { getSetting } from "@/lib/db";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const logoKey = getSetting("logo_key");
  return (
    <div className="center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logoKey && <p style={{ textAlign: "center", margin: "0 0 10px" }}><img className="auth-logo" src={`/api/logo?v=${logoKey.slice(0, 8)}`} alt={getSetting("company_name")} /></p>}
      <p className="muted small" style={{ textAlign: "center" }}>{logoKey && getSetting("logo_has_name") === "1" ? "Data room" : `${getSetting("company_name")} · data room`}</p>
      {children}
    </div>
  );
}
