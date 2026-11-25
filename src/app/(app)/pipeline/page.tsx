import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { q } from "@/lib/db";
import { money, tierName } from "@/lib/format";
import { currentRound } from "@/lib/rounds";
import { STAGES, humanDay, today, type Lead } from "@/lib/pipeline";
import { Field, Flash, Hint, PageHead } from "@/components/ui";
import { Board } from "@/components/Board";
import { addLeadAction } from "./actions";

type Round = { id: number; name: string; status: string };
type Row = Lead & { org_kind: string | null; org_tier: number | null };

export default async function Pipeline({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireStaff();
  const sp = await searchParams;
  const rounds = q<Round>("SELECT id, name, status FROM rounds ORDER BY created_at DESC, id DESC");
  const fallback = (currentRound() as { id: number } | null | undefined)?.id ?? null;
  const selected: number | "all" = sp.round === "all" ? "all" : rounds.find((r) => String(r.id) === sp.round)?.id ?? fallback ?? "all";

  // Leads not yet assigned to a round show up on every board.
  const leads = q<Row>(
    `SELECT l.*, o.kind AS org_kind, o.tier AS org_tier FROM leads l LEFT JOIN orgs o ON o.id = l.org_id
      ${selected === "all" ? "" : "WHERE l.round_id = ? OR l.round_id IS NULL"}
      ORDER BY CASE WHEN l.next_action_due IS NULL THEN 1 ELSE 0 END, l.next_action_due, l.updated_at DESC`,
    ...(selected === "all" ? [] : [selected]),
  );
  const t = today();
  const sum = (stages: string[]) => leads.filter((l) => stages.includes(l.stage)).reduce((n, l) => n + (l.check_size ?? 0), 0);
  const open = sum(["lead", "contacted", "interested", "meeting", "diligence"]);
  const committed = sum(["committed", "signed", "wired"]);
  const wired = sum(["wired"]);
  const passed = leads.filter((l) => l.stage === "passed");
  const columns = STAGES.filter((s) => s.key !== "passed");

  return (
    <>
      <PageHead title="Pipeline" sub="Every investor you are talking to, and the one thing to do next for each.">
        {rounds.length > 0 && (
          <form className="row" method="get">
            <select name="round" defaultValue={String(selected)} style={{ width: "auto" }}>
              {rounds.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.status})</option>)}
              <option value="all">All rounds</option>
            </select>
            <button className="btn small">Show</button>
          </form>
        )}
      </PageHead>
      <Flash sp={sp} />
      <Hint title="How this works">
        Add anyone you might raise from as a lead. Open their card and it tells you exactly what to do next, with one button for each step:
        reach out, invite them to the room, meet, open diligence, record the commitment, get the SAFE signed, confirm the wire.
        Moving a card forward raises that firm&apos;s data room access automatically, so you never have to manage permissions by hand.
        {rounds.length === 0 && <> You have no round yet: <Link href="/rounds">create one</Link> so commitments have terms to attach to.</>}
      </Hint>

      {leads.length > 0 && (
        <p className="letter" style={{ marginBottom: 22 }}>
          <strong>{money(open, true)}</strong> is in conversation, <strong>{money(committed, true)}</strong> is committed{wired > 0 ? <>, and {money(wired, true)} of that is in the bank</> : null}.
        </p>
      )}

      <Board
        columns={columns.map((c) => ({ key: c.key, label: c.label }))}
        leads={leads.filter((l) => l.stage !== "passed").map((l) => ({
          id: l.id,
          stage: l.stage,
          name: l.org_name,
          contact: l.contact_name,
          cheque: l.check_size != null ? money(l.check_size, true) : null,
          badge: l.org_id != null ? (l.org_kind === "supporter" ? "Supporter" : tierName(l.org_tier ?? 1)) : null,
          badgeGrey: l.org_kind === "supporter",
          due: l.next_action_due ? { label: l.next_action_due < t ? "overdue" : humanDay(l.next_action_due).replace(/^on /, ""), warn: l.next_action_due <= t } : null,
          action: l.next_action,
        }))}
      />
      <p className="muted small" style={{ marginTop: -4 }}>Drag a card to move it, or open it for the guided next step.</p>

      {passed.length > 0 && (
        <details className="card">
          <summary>Passed ({passed.length})</summary>
          <div className="table-wrap"><table className="table"><tbody>
            {passed.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/pipeline/${l.id}`}>{l.org_name}</Link></td>
                <td className="small muted">{l.passed_reason || "No reason recorded"}</td>
                <td className="small">{l.org_id ? (l.org_kind === "supporter" ? "Now a supporter" : "Still has investor access") : "No access"}</td>
              </tr>
            ))}
          </tbody></table></div>
        </details>
      )}

      <div className="card">
        <h2>Add a lead</h2>
        <p className="muted small">Leads are private to you. They get no login until you invite them from their card.</p>
        <form action={addLeadAction}>
          <div className="grid3">
            <Field label="Firm or investor name"><input name="org_name" required maxLength={120} /></Field>
            <Field label="Contact name"><input name="contact_name" maxLength={120} /></Field>
            <Field label="Contact email" hint="Needed later to invite them."><input name="contact_email" type="email" /></Field>
          </div>
          <div className="grid3">
            <Field label="Likely cheque size ($)"><input name="check_size" inputMode="numeric" placeholder="50,000" /></Field>
            <Field label="How you know them" hint="Warm intro from, event, cold email…"><input name="source" maxLength={200} /></Field>
            <Field label="Round">
              <select name="round_id" defaultValue={selected === "all" ? "" : String(selected)}>
                <option value="">Not decided</option>
                {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          </div>
          <button className="btn primary">Add lead</button>
        </form>
      </div>
    </>
  );
}
