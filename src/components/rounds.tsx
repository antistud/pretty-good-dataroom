import { LevelSelect, Field } from "@/components/ui";
import { money } from "@/lib/format";
import type { RoundRow } from "@/lib/rounds";

/** Raise progress: wired money in green, committed and signed in blue, against the target. */
export function RaiseProgress({ totals, target }: { totals: { committed: number; signed: number; wired: number; total: number }; target: number }) {
  const base = Math.max(target, totals.total, 1);
  return (
    <>
      <div className="progress" style={{ display: "flex" }}>
        <div className="second" style={{ width: `${(totals.wired / base) * 100}%` }} />
        <div style={{ width: `${((totals.total - totals.wired) / base) * 100}%` }} />
      </div>
      <div className="muted small" style={{ marginTop: 4 }}>
        {money(totals.total)} of {target ? money(target) : "no target set"} · {money(totals.wired)} received
      </div>
    </>
  );
}

export function RoundFields({ r }: { r?: RoundRow }) {
  return (
    <>
      <div className="grid3">
        <Field label="Name" hint="For example: Pre-seed, or Seed."><input name="name" required maxLength={120} defaultValue={r?.name} /></Field>
        <Field label="How you are raising" hint="Pre-seed rounds are almost always SAFEs.">
          <select name="instrument" defaultValue={r?.instrument ?? "safe"}>
            <option value="safe">SAFEs</option>
            <option value="priced">Priced round (selling shares)</option>
          </select>
        </Field>
        <Field label="Target amount ($)"><input name="target_amount" inputMode="decimal" defaultValue={r?.target_amount || ""} /></Field>
      </div>
      <div className="grid3">
        <Field label="Valuation cap ($)" hint="SAFE rounds. Blank for none."><input name="valuation_cap" inputMode="decimal" defaultValue={r?.valuation_cap ?? ""} /></Field>
        <Field label="Discount (%)" hint="SAFE rounds. Blank for none."><input name="discount" inputMode="decimal" defaultValue={r?.discount ? r.discount * 100 : ""} /></Field>
        <Field label="Minimum cheque ($)"><input name="min_check" inputMode="decimal" defaultValue={r?.min_check ?? ""} /></Field>
      </div>
      <div className="grid3">
        <Field label="Pre-money valuation ($)" hint="Priced rounds only."><input name="pre_money" inputMode="decimal" defaultValue={r?.pre_money ?? ""} /></Field>
        <Field label="Option pool after round (%)" hint="Priced rounds only."><input name="new_pool_pct" inputMode="decimal" defaultValue={r?.new_pool_pct ? r.new_pool_pct * 100 : ""} /></Field>
        <LevelSelect value={r?.min_level ?? 1} label="Who can see the terms once open" />
      </div>
      <Field label="Terms summary for investors" hint="Shown on The round page. Markdown works: **bold**, lists, links.">
        <textarea name="terms_md" defaultValue={r?.terms_md ?? ""} placeholder={"We are raising $750k on post-money SAFEs.\n\n- Minimum cheque: $10k\n- Target close: end of next month"} />
      </Field>
    </>
  );
}
