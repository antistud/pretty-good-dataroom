import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { q } from "@/lib/db";
import { ago, fmtDateTime, tierName } from "@/lib/format";
import { Hint, PageHead } from "@/components/ui";

type Row = {
  id: number; user_id: number | null; org_id: number | null; action: string; target_type: string | null; target_id: number | null;
  detail: string | null; created_at: string; user_name: string | null; user_email: string | null; org_name: string | null;
};
type Summary = { id: number; name: string; kind: string; tier: number; members: number; last_seen: string | null; docs: number; sections: number; downloads: number };

const TYPES: Record<string, { label: string; where: string }> = {
  all: { label: "Everything", where: "1=1" },
  views: { label: "Views", where: "a.action LIKE '%.view'" },
  downloads: { label: "Downloads", where: "a.action = 'doc.download'" },
  signins: { label: "Sign-ins", where: "a.action IN ('login','invite.accept','nda.accept')" },
  admin: { label: "Admin changes", where: "a.action NOT LIKE '%.view' AND a.action NOT IN ('doc.download','login','invite.accept','nda.accept')" },
};

const SECTIONS: Record<string, string> = {
  overview: "the Overview", team: "the Team page", round: "the round terms", captable: "the cap table and SAFEs",
  financials: "the financials", documents: "the document list", intros: "Set Me Up", updates: "the updates list", requests: "requests",
};

export default async function Activity({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireStaff();
  const sp = await searchParams;
  const orgId = Number(sp.org) || 0;
  const type = Object.hasOwn(TYPES, sp.type ?? "") ? sp.type : "all";

  const summary = q<Summary>(
    `SELECT o.id, o.name, o.kind, o.tier,
            (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.disabled = 0) AS members,
            (SELECT MAX(u.last_seen_at) FROM users u WHERE u.org_id = o.id) AS last_seen,
            (SELECT COUNT(DISTINCT a.target_id) FROM activity a WHERE a.org_id = o.id AND a.action = 'doc.view') AS docs,
            (SELECT COUNT(DISTINCT a.detail) FROM activity a WHERE a.org_id = o.id AND a.action = 'section.view') AS sections,
            (SELECT COUNT(*) FROM activity a WHERE a.org_id = o.id AND a.action = 'doc.download') AS downloads
       FROM orgs o ORDER BY last_seen IS NULL, last_seen DESC, o.name`,
  );
  const rows = q<Row>(
    `SELECT a.*, u.name AS user_name, u.email AS user_email, o.name AS org_name
       FROM activity a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN orgs o ON o.id = a.org_id
      WHERE ${TYPES[type].where} ${orgId ? "AND a.org_id = ?" : ""}
      ORDER BY a.id DESC LIMIT 200`,
    ...(orgId ? [orgId] : []),
  );

  const names = (table: string, col: string) => new Map(q<{ id: number; n: string }>(`SELECT id, ${col} AS n FROM ${table}`).map((r) => [r.id, r.n]));
  const docs = names("documents", "name");
  const updates = names("updates", "title");
  const pages = names("pages", "title");
  const orgs = names("orgs", "name");
  const users = names("users", "name");
  const folders = names("folders", "name");

  const describe = (r: Row): React.ReactNode => {
    const id = r.target_id ?? 0;
    const doc = () => (docs.has(id) ? <Link href={`/documents/${id}`}>{docs.get(id)}</Link> : <em>{r.detail || "a deleted document"}</em>);
    switch (r.action) {
      case "login": return "signed in";
      case "invite.accept": return "accepted their invitation and created an account";
      case "nda.accept": return "accepted the confidentiality terms";
      case "section.view": return `looked at ${SECTIONS[r.detail ?? ""] ?? r.detail ?? "a section"}`;
      case "doc.view": return <>viewed {doc()}</>;
      case "doc.download": return <>downloaded {doc()}</>;
      case "update.view": return <>read the update {updates.has(id) ? <Link href={`/updates/${id}`}>{updates.get(id)}</Link> : ""}</>;
      case "page.view": return `read the page ${pages.get(id) ?? r.detail ?? ""}`;
      case "invite.create": return `invited ${r.detail ?? "someone"}`;
      case "invite.revoke": return "cancelled an invitation";
      case "org.create": return `added ${r.detail ?? orgs.get(id) ?? "an organisation"}`;
      case "org.tier": return `changed access for ${orgs.get(id) ?? "an organisation"}${r.detail ? ` (${r.detail})` : ""}`;
      case "user.disable": return `removed access for ${r.detail ?? users.get(id) ?? "a user"}`;
      case "user.enable": return `restored access for ${r.detail ?? users.get(id) ?? "a user"}`;
      case "user.reset_link": return `created a password reset link for ${r.detail ?? "a user"}`;
      case "account.password": return "changed their password";
      case "account.2fa_on": return "turned on two-step sign-in";
      case "account.2fa_off": return "turned off two-step sign-in";
      case "folder.create": return `created the folder ${r.detail ?? folders.get(id) ?? ""}`;
      case "folder.update": return `edited the folder ${r.detail ?? folders.get(id) ?? ""}`;
      case "folder.delete": return `deleted the folder ${r.detail ?? ""}`;
      case "doc.upload": return <>uploaded {doc()}</>;
      case "doc.version": return <>uploaded a new version of {doc()}</>;
      case "doc.update": return <>edited {doc()}</>;
      case "doc.delete": return `deleted the document ${r.detail ?? ""}`;
      default: return `${r.action.replace(/[._]/g, " ")}${r.detail ? `: ${r.detail}` : ""}`;
    }
  };

  const link = (o: number, t: string) => `/activity?${new URLSearchParams({ ...(o ? { org: String(o) } : {}), ...(t !== "all" ? { type: t } : {}) })}`;
  const filteredOrg = summary.find((s) => s.id === orgId);

  return (
    <>
      <PageHead title="Activity" sub="Who has looked at what, and every change made on the company side." />
      <Hint title="How to read this">
        The table shows how engaged each firm is. A firm that has opened many documents and keeps coming back is worth a follow-up; one that has not signed in may need a nudge. Click a firm to see only its activity. Your own team&rsquo;s page views are not recorded, only its changes.
      </Hint>

      <div className="card">
        <h2>By firm</h2>
        {summary.length === 0 ? <div className="empty">No investors or supporters yet.</div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Firm</th><th>Access</th><th className="num">Members</th><th>Last seen</th><th className="num">Documents viewed</th><th className="num">Sections viewed</th><th className="num">Downloads</th></tr></thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.id}>
                  <td><Link href={link(s.id, type)}><strong>{s.name}</strong></Link></td>
                  <td><span className={`badge ${s.kind === "supporter" ? "grey" : ""}`}>{s.kind === "supporter" ? "Supporter" : tierName(s.tier)}</span></td>
                  <td className="num">{s.members}</td>
                  <td className="small">{s.members === 0 ? <span className="muted">not joined</span> : ago(s.last_seen)}</td>
                  <td className="num">{s.docs}</td>
                  <td className="num">{s.sections}</td>
                  <td className="num">{s.downloads}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <div className="spread" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>{filteredOrg ? `Activity for ${filteredOrg.name}` : "Latest activity"}</h2>
          <div className="row small">
            {filteredOrg && <Link className="btn small" href={link(0, type)}>Show all firms</Link>}
            {Object.entries(TYPES).map(([k, t]) => (
              <Link key={k} href={link(orgId, k)} className={`badge ${k === type ? "" : "grey"}`}>{t.label}</Link>
            ))}
          </div>
        </div>
        {rows.length === 0 ? <div className="empty">Nothing here yet.</div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small muted nowrap">{fmtDateTime(r.created_at)}</td>
                  <td>
                    {r.user_name ?? <span className="muted">Someone (account deleted)</span>}
                    <div className="muted small">{r.org_name ?? (r.user_id ? "Company side" : "")}</div>
                  </td>
                  <td>{describe(r)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <p className="muted small" style={{ marginTop: 8 }}>Showing the latest 200 entries. Repeat views within 30 minutes are counted once.</p>
      </div>
    </>
  );
}
