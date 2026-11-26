/**
 * Cap table and SAFE conversion maths. Pure functions, no database.
 *
 * Conventions (stated here because they change the numbers):
 * - "Capitalization" for a post-money SAFE's cap price is every existing share,
 *   option and unissued pool share PLUS every share issued to converting SAFEs.
 *   It excludes the option pool increase made for the priced round and the new
 *   money shares, as in the standard YC post-money SAFE.
 * - A pre-money SAFE's cap price uses the capitalization BEFORE any SAFE converts
 *   (a common simplification of the older pre-money SAFE).
 * - The priced round's share price is pre-money valuation divided by everything
 *   outstanding before the new money: existing shares, SAFE shares and the pool
 *   increase. The pool top-up therefore dilutes existing holders, not new investors.
 * - A SAFE converts at the lowest of: its cap price, its discounted round price,
 *   and the round price itself.
 * - MFN: an MFN SAFE takes the lowest cap and the highest discount found on any
 *   SAFE signed AFTER it, which is how the clause normally reads. When either
 *   signing date is unknown, the other SAFE is treated as later. A real clause
 *   is elected by the investor and may be worded differently, so this is an
 *   assumption to confirm with counsel. An inherited cap keeps the
 *   pre/post-money type of the SAFE it came from.
 *
 * This is a planning model. Closing numbers come from your lawyer.
 */

export type HolderKind = "founder" | "employee" | "advisor" | "investor" | "pool";
export type HolderInput = { name: string; kind: HolderKind; shareClass?: string; shares: number };
export type SafeInput = {
  name: string;
  amount: number;
  kind: "post" | "pre";
  cap?: number | null;
  /** Fraction, e.g. 0.2 for a 20% discount. */
  discount?: number | null;
  mfn?: boolean;
  /** ISO date the SAFE was signed. Used to decide which SAFEs an MFN clause can reach. */
  signedOn?: string | null;
};
export type RoundInput = {
  preMoney: number;
  newMoney: number;
  /** Target unissued pool as a fraction of the post-round total, e.g. 0.1. Omit for no top-up. */
  poolPct?: number | null;
};

export type ResolvedSafe = SafeInput & { effCap: number | null; effKind: "post" | "pre"; effDiscount: number };

export function resolveMfn(safes: SafeInput[]): ResolvedSafe[] {
  return safes.map((s, i) => {
    let effCap = s.cap && s.cap > 0 ? s.cap : null;
    let effKind = s.kind;
    let effDiscount = s.discount && s.discount > 0 ? Math.min(s.discount, 0.99) : 0;
    if (s.mfn) {
      safes.forEach((o, j) => {
        if (i === j) return;
        // An MFN clause only reaches SAFEs issued later.
        if (s.signedOn && o.signedOn && o.signedOn <= s.signedOn) return;
        if (o.cap && o.cap > 0 && (effCap === null || o.cap < effCap)) {
          effCap = o.cap;
          effKind = o.kind;
        }
        if (o.discount && o.discount > effDiscount) effDiscount = Math.min(o.discount, 0.99);
      });
    }
    return { ...s, effCap, effKind, effDiscount };
  });
}

/** Ownership already sold on post-money capped SAFEs: sum of amount / cap. */
export function safeOwnershipToday(safes: SafeInput[]): number {
  return resolveMfn(safes).reduce((sum, s) => (s.effCap && s.effKind === "post" ? sum + s.amount / s.effCap : sum), 0);
}

export type Stage = { shares: number; pct: number };
export type Row = {
  label: string;
  kind: HolderKind | "safe" | "new_pool" | "new_money";
  shareClass: string;
  before: Stage;
  afterSafes: Stage;
  afterRound: Stage;
};
export type SafeResult = {
  name: string;
  amount: number;
  price: number;
  shares: number;
  method: "cap" | "discount" | "round";
  effCap: number | null;
  effDiscount: number;
  inherited: boolean;
};
export type Conversion =
  | { ok: false; error: string }
  | {
      ok: true;
      rows: Row[];
      roundPrice: number;
      safes: SafeResult[];
      totals: { before: number; afterSafes: number; afterRound: number };
      poolIncrease: number;
      newShares: number;
      postMoney: number;
      /** Founders' combined ownership before and after, and the relative drop. */
      founders: { before: number; afterSafes: number; afterRound: number; dilution: number };
    };

export function simulate(holders: HolderInput[], safesIn: SafeInput[], round: RoundInput): Conversion {
  const S0 = holders.reduce((s, h) => s + Math.max(0, h.shares), 0);
  if (S0 <= 0) return { ok: false, error: "Add at least one shareholder first." };
  if (!(round.preMoney > 0)) return { ok: false, error: "Enter a pre-money valuation above zero." };
  const newMoney = Math.max(0, round.newMoney || 0);
  const poolPct = Math.max(0, round.poolPct || 0);
  const k = 1 + newMoney / round.preMoney; // post-round total / pre-money total
  if (poolPct * k >= 1) return { ok: false, error: "That option pool target is too large for this round." };
  const safes = resolveMfn(safesIn.filter((s) => s.amount > 0));
  if (safeOwnershipToday(safes) >= 1) return { ok: false, error: "The post-money SAFEs add up to 100% or more of the company." };
  const pool0 = holders.filter((h) => h.kind === "pool").reduce((s, h) => s + h.shares, 0);

  // The SAFE share count depends on the round price and on itself (post-money caps),
  // so iterate to a fixed point. It converges quickly because SAFEs own less than 100%.
  let safeShares = safes.map(() => 0);
  let poolIncrease = 0;
  let price = 0;
  for (let iter = 0; iter < 2000; iter++) {
    const X = S0 + safeShares.reduce((a, b) => a + b, 0);
    poolIncrease = poolPct > 0 ? Math.max(0, (poolPct * k * X - pool0) / (1 - poolPct * k)) : 0;
    price = round.preMoney / (X + poolIncrease);
    const next = safes.map((s) => s.amount / safePrice(s, price, X, S0).price);
    const delta = next.reduce((d, v, i) => d + Math.abs(v - safeShares[i]), 0);
    safeShares = next;
    if (delta < 1e-13 * S0) break;
  }
  const X = S0 + safeShares.reduce((a, b) => a + b, 0);
  poolIncrease = poolPct > 0 ? Math.max(0, (poolPct * k * X - pool0) / (1 - poolPct * k)) : 0;
  price = round.preMoney / (X + poolIncrease);
  const newShares = newMoney / price;
  const T = X + poolIncrease + newShares;

  const stage = (shares: number, total: number): Stage => ({ shares, pct: shares / total });
  const zero: Stage = { shares: 0, pct: 0 };
  const rows: Row[] = holders.map((h) => ({
    label: h.kind === "pool" && !h.name ? "Unissued option pool" : h.name,
    kind: h.kind,
    shareClass: h.shareClass || "Common",
    before: stage(h.shares, S0),
    afterSafes: stage(h.shares, X),
    afterRound: stage(h.shares, T),
  }));
  const safeResults: SafeResult[] = safes.map((s, i) => {
    const p = safePrice(s, price, X, S0);
    rows.push({ label: `${s.name} (SAFE)`, kind: "safe", shareClass: "Preferred", before: zero, afterSafes: stage(safeShares[i], X), afterRound: stage(safeShares[i], T) });
    return {
      name: s.name, amount: s.amount, price: p.price, shares: safeShares[i], method: p.method,
      effCap: s.effCap, effDiscount: s.effDiscount,
      inherited: !!s.mfn && (s.effCap !== (s.cap || null) || s.effDiscount !== (s.discount || 0)),
    };
  });
  if (poolIncrease > 0) rows.push({ label: "Option pool increase", kind: "new_pool", shareClass: "Common", before: zero, afterSafes: zero, afterRound: stage(poolIncrease, T) });
  if (newShares > 0) rows.push({ label: "New round investors", kind: "new_money", shareClass: "Preferred", before: zero, afterSafes: zero, afterRound: stage(newShares, T) });

  const f = holders.filter((h) => h.kind === "founder").reduce((s, h) => s + h.shares, 0);
  return {
    ok: true,
    rows,
    roundPrice: price,
    safes: safeResults,
    totals: { before: S0, afterSafes: X, afterRound: T },
    poolIncrease,
    newShares,
    postMoney: round.preMoney + newMoney,
    founders: { before: f / S0, afterSafes: f / X, afterRound: f / T, dilution: f > 0 ? 1 - S0 / T : 0 },
  };
}

function safePrice(s: ResolvedSafe, roundPrice: number, postSafeCap: number, preSafeCap: number): { price: number; method: SafeResult["method"] } {
  let price = roundPrice;
  let method: SafeResult["method"] = "round";
  if (s.effDiscount > 0) {
    price = roundPrice * (1 - s.effDiscount);
    method = "discount";
  }
  if (s.effCap) {
    const capPrice = s.effCap / (s.effKind === "post" ? postSafeCap : preSafeCap);
    if (capPrice < price) {
      price = capPrice;
      method = "cap";
    }
  }
  return { price, method };
}

// ---------- Dates and vesting ----------

export type VestingInput = {
  /** Shares granted or bought at the start. */
  shares: number;
  /** When they started (vesting begins). ISO date. */
  start?: string | null;
  /** When they left, if they have. ISO date. */
  end?: string | null;
  /** Length of the vesting schedule in months. Empty or 0 means the shares were never subject to vesting. */
  vestMonths?: number | null;
  /** Months before anything vests. */
  cliffMonths?: number | null;
  /**
   * What the person actually kept on leaving, when the separation paperwork gives a number. It overrides the
   * schedule, because the signed number is the true one (acceleration, a negotiated exit, a different rounding rule).
   */
  keptShares?: number | null;
};
export type Standing = {
  /** What counts on the cap table: everything granted while the person is here, only what had vested once they have left. */
  held: number;
  granted: number;
  /** Vested as of today, or as of the day they left. */
  vested: number;
  /** Unvested shares given up on leaving. Zero for anyone still here. */
  forfeited: number;
  left: boolean;
  /** True when a vesting schedule applies. */
  vests: boolean;
  /** ISO date the schedule completes, when one applies. */
  fullyVestedOn: string | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Whole months from one ISO date to another; a month completes on the same day of the month. */
export function monthsBetween(from: string, to: string): number {
  if (!ISO.test(from) || !ISO.test(to)) return 0;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, months);
}
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * Shares vested on a given day. Nothing before the cliff; at the cliff, the
 * cliff's share of the grant; then one equal release each month. Every release
 * is rounded down to a whole share, as stock agreements usually say, and the
 * last release makes up the difference.
 */
export function vestedShares(v: VestingInput, asOf: string): number {
  const months = Math.max(0, Math.floor(v.vestMonths || 0));
  if (!months || !v.start || !ISO.test(v.start)) return v.shares;
  const cliff = Math.min(months, Math.max(0, Math.floor(v.cliffMonths || 0)));
  const elapsed = monthsBetween(v.start, asOf);
  if (asOf < v.start || elapsed < cliff) return 0;
  if (elapsed >= months) return v.shares;
  return Math.floor((v.shares * cliff) / months) + (elapsed - cliff) * Math.floor(v.shares / months);
}

/** Where a holder stands today. Someone who left keeps what had vested on their last day; the rest goes back to the company. */
export function standing(v: VestingInput, today: string): Standing {
  const vests = !!(v.vestMonths && v.vestMonths > 0 && v.start && ISO.test(v.start));
  const left = !!(v.end && ISO.test(v.end) && v.end <= today);
  const kept = left && v.keptShares != null && v.keptShares >= 0 ? Math.min(v.keptShares, v.shares) : null;
  const vested = kept ?? vestedShares(v, left ? v.end! : today);
  const held = kept ?? (left && vests ? vested : v.shares);
  return { held, granted: v.shares, vested: vests || kept != null ? vested : v.shares, forfeited: v.shares - held, left, vests, fullyVestedOn: vests ? addMonths(v.start!, Math.floor(v.vestMonths!)) : null };
}
