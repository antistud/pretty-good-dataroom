import { getSetting } from "@/lib/db";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="center">
      <p className="muted small" style={{ textAlign: "center" }}>{getSetting("company_name")} · data room</p>
      {children}
    </div>
  );
}
