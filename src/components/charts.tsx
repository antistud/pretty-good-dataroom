/**
 * Small charts drawn on the server as plain HTML and SVG: no chart library,
 * no client script. Each takes ready numbers and shows them one way.
 *
 * Colour: a series keeps its colour wherever it appears (founders are always
 * the same blue), values and labels stay in text colours, and every chart
 * sits next to a table or labels that carry the same numbers.
 */
import { money, num, pct } from "@/lib/format";

/** Who owns shares, grouped the way an investor thinks about it. The order fixes each group's colour. */
export const OWNER_GROUPS = [
  { key: "founders", label: "Founders" },
  { key: "team", label: "Team and advisors" },
  { key: "pool", label: "Option pool" },
  { key: "investors", label: "Investors" },
  { key: "safes", label: "SAFE investors" },
  { key: "new", label: "New investors" },
] as const;
export type OwnerGroup = (typeof OWNER_GROUPS)[number]["key"];
export const groupOf = (kind: string): OwnerGroup =>
  kind === "founder" ? "founders" : kind === "employee" || kind === "advisor" ? "team" : kind === "pool" || kind === "new_pool" ? "pool" : kind === "safe" ? "safes" : kind === "new_money" ? "new" : "investors";
const slot = (g: OwnerGroup) => OWNER_GROUPS.findIndex((x) => x.key === g) + 1;

export type Share = { group: OwnerGroup; value: number };
/** Adds up parts by group, in the fixed group order, dropping empty ones. */
export function byGroup(parts: { kind: string; value: number }[]): Share[] {
  return OWNER_GROUPS.map((g) => ({ group: g.key, value: parts.filter((p) => groupOf(p.kind) === g.key).reduce((s, p) => s + p.value, 0) })).filter((s) => s.value > 0);
}

/** One bar split into parts of a whole. Parts wider than about 9% carry their percentage inside. */
export function SplitBar({ shares, label }: { shares: Share[]; label?: string }) {
  const total = shares.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  return (
    <div className="splitbar" role="img" aria-label={`${label ? `${label}: ` : ""}${shares.map((s) => `${OWNER_GROUPS[slot(s.group) - 1].label} ${pct(s.value / total, 1)}`).join(", ")}`}>
      {shares.map((s) => {
        const share = s.value / total;
        return (
          <div key={s.group} className={`seg s${slot(s.group)}`} style={{ flexGrow: s.value }} title={`${OWNER_GROUPS[slot(s.group) - 1].label}: ${pct(share, 1)}`}>
            {share >= 0.09 && <span>{pct(share, share >= 0.995 ? 0 : 1)}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function OwnerLegend({ groups }: { groups: OwnerGroup[] }) {
  return (
    <ul className="legend">
      {OWNER_GROUPS.filter((g) => groups.includes(g.key)).map((g) => (
        <li key={g.key}><i className={`s${slot(g.key)}`} />{g.label}</li>
      ))}
    </ul>
  );
}

/** The same whole at several moments, one bar per moment, sharing a legend. */
export function StageBars({ stages }: { stages: { label: string; shares: Share[] }[] }) {
  const groups = [...new Set(stages.flatMap((s) => s.shares.map((x) => x.group)))];
  return (
    <div className="stagebars">
      {stages.map((s) => (
        <div key={s.label} className="stage">
          <div className="stage-label">{s.label}</div>
          <SplitBar shares={s.shares} label={s.label} />
        </div>
      ))}
      <OwnerLegend groups={groups} />
    </div>
  );
}

/** Progress towards a target in up to three nested amounts (for example wired, signed, committed). */
export function Meter({ parts, target, label }: { parts: { label: string; value: number }[]; target: number; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const scale = Math.max(target, total, 1);
  return (
    <div className="meter-wrap">
      <div className="meter" role="img" aria-label={`${label}: ${parts.map((p) => `${money(p.value, true)} ${p.label}`).join(", ")} of ${money(target, true)}`}>
        {parts.filter((p) => p.value > 0).map((p, i) => <div key={p.label} className={`m${i + 1}`} style={{ width: `${(p.value / scale) * 100}%` }} title={`${p.label}: ${money(p.value)}`} />)}
      </div>
      <ul className="legend">
        {parts.map((p, i) => <li key={p.label}><i className={`m${i + 1}`} />{p.label} <strong>{money(p.value, true)}</strong></li>)}
        <li className="muted">of {money(target, true)}</li>
      </ul>
    </div>
  );
}

/** How many are at each step of an ordered process. One hue; the bar length carries the number. */
export function Funnel({ rows, unit }: { rows: { label: string; count: number; note?: string; href?: string }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ol className="funnel" aria-label={`${unit} at each stage`}>
      {rows.map((r) => (
        <li key={r.label}>
          <span className="funnel-label">{r.label}</span>
          <span className="funnel-track"><span className="funnel-bar" style={{ width: `${(r.count / max) * 100}%` }} /></span>
          <span className="funnel-n">{r.count}{r.note ? <span className="muted small"> · {r.note}</span> : null}</span>
        </li>
      ))}
    </ol>
  );
}

/** A ring for a single percentage, with the number in the middle. */
export function Ring({ value, label, size = 76 }: { value: number; label: string; size?: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 72 72" role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle className="ring-arc" cx="36" cy="36" r={r} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 36 36)" />
      <text x="36" y="41" textAnchor="middle" fontSize="17" fontWeight="600" fill="var(--ink)">{Math.round(v * 100)}%</text>
    </svg>
  );
}

/** Thin vertical bars for a count per day or month. Values are in the tooltip and the nearby table. */
export function Columns({ rows, label, height = 64 }: { rows: { label: string; value: number }[]; label: string; height?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="columns" role="img" aria-label={`${label}: ${rows.map((r) => `${r.label} ${num(r.value)}`).join(", ")}`} style={{ height }}>
      {rows.map((r, i) => (
        <div key={i} className="col" title={`${r.label}: ${num(r.value)}`}>
          <div style={{ height: `${(r.value / max) * 100}%` }} className={r.value === 0 ? "zero" : undefined} />
        </div>
      ))}
    </div>
  );
}

/** Two lines over the same months on one scale (money in, money out), with the last values labelled. */
export function TwoLines({ rows, a, b }: { rows: { label: string; a: number; b: number }[]; a: string; b: string }) {
  if (rows.length < 2) return null;
  const W = 640, H = 200, L = 8, R = 8, T = 14, B = 26;
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  const x = (i: number) => L + (i / (rows.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (key: "a" | "b") => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r[key]).toFixed(1)}`).join(" ");
  const every = Math.ceil(rows.length / 8);
  return (
    <div className="twolines">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${a} and ${b} by month`} style={{ width: "100%", height: "auto" }}>
        {[0, 0.5, 1].map((f) => <line key={f} x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth="1" />)}
        <text x={L} y={y(max) - 4} fontSize="11" fill="var(--muted)">{money(max, true)}</text>
        <path className="draw" d={path("b")} fill="none" stroke="var(--series-2)" strokeWidth="2" strokeLinejoin="round" pathLength={1} />
        <path className="draw" d={path("a")} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" pathLength={1} />
        {rows.map((r, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(r.b)} r="4" fill="var(--series-2)" stroke="var(--bg)" strokeWidth="2"><title>{`${r.label}: ${b} ${money(r.b)}`}</title></circle>
            <circle cx={x(i)} cy={y(r.a)} r="4" fill="var(--series-1)" stroke="var(--bg)" strokeWidth="2"><title>{`${r.label}: ${a} ${money(r.a)}`}</title></circle>
            {(i % every === 0 || i === rows.length - 1) && <text x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted)">{r.label}</text>}
          </g>
        ))}
      </svg>
      <ul className="legend">
        <li><i className="s1" />{a} <strong>{money(rows[rows.length - 1].a, true)}</strong></li>
        <li><i className="s2" />{b} <strong>{money(rows[rows.length - 1].b, true)}</strong></li>
        <li className="muted">latest month</li>
      </ul>
    </div>
  );
}

/** How far through a vesting schedule someone is. */
export function VestBar({ vested, granted, left }: { vested: number; granted: number; left: boolean }) {
  if (granted <= 0) return null;
  const share = Math.max(0, Math.min(1, vested / granted));
  return (
    <div className={`vestbar${left ? " left" : ""}`} role="img" aria-label={`${pct(share, 0)} vested`} title={`${num(vested)} of ${num(granted)} vested`}>
      <div style={{ width: `${share * 100}%` }} />
    </div>
  );
}
