import { describe, expect, it } from "vitest";
import { resolveMfn, safeOwnershipToday, simulate, type HolderInput, type SafeInput } from "./captable";

const holders: HolderInput[] = [
  { name: "Founder A", kind: "founder", shares: 5_000_000 },
  { name: "Founder B", kind: "founder", shares: 4_000_000 },
  { name: "", kind: "pool", shares: 1_000_000 },
];
const round = { preMoney: 20_000_000, newMoney: 5_000_000 };
const must = (c: ReturnType<typeof simulate>) => {
  if (!c.ok) throw new Error(c.error);
  return c;
};

describe("post-money SAFE", () => {
  it("$500k on a $5M post-money cap owns 10% after SAFE conversion", () => {
    const c = must(simulate(holders, [{ name: "Angel", amount: 500_000, kind: "post", cap: 5_000_000 }], round));
    expect(c.safes[0].method).toBe("cap");
    expect(c.safes[0].shares / c.totals.afterSafes).toBeCloseTo(0.1, 8);
    expect(c.safes[0].shares).toBeCloseTo(10_000_000 / 9, 2);
  });

  it("five $100k SAFEs on a $5M cap own 10% together, not 2%", () => {
    const safes: SafeInput[] = Array.from({ length: 5 }, (_, i) => ({ name: `Angel ${i}`, amount: 100_000, kind: "post", cap: 5_000_000 }));
    const c = must(simulate(holders, safes, round));
    const total = c.safes.reduce((s, x) => s + x.shares, 0);
    expect(total / c.totals.afterSafes).toBeCloseTo(0.1, 8);
    expect(safeOwnershipToday(safes)).toBeCloseTo(0.1, 10);
  });

  it("mixed caps each get amount / cap", () => {
    const c = must(simulate(holders, [
      { name: "A", amount: 500_000, kind: "post", cap: 5_000_000 },
      { name: "B", amount: 800_000, kind: "post", cap: 8_000_000 },
    ], round));
    expect(c.rows.find((r) => r.label.startsWith("A "))!.afterSafes.pct).toBeCloseTo(0.1, 8);
    expect(c.rows.find((r) => r.label.startsWith("B "))!.afterSafes.pct).toBeCloseTo(0.1, 8);
  });
});

describe("discount, uncapped and MFN", () => {
  it("discount beats the cap when the round price is low", () => {
    const c = must(simulate(holders, [{ name: "A", amount: 500_000, kind: "post", cap: 10_000_000, discount: 0.2 }], { preMoney: 4_000_000, newMoney: 1_000_000 }));
    expect(c.safes[0].method).toBe("discount");
    expect(c.safes[0].price).toBeCloseTo(c.roundPrice * 0.8, 10);
  });

  it("cap beats the discount when the round price is high", () => {
    const c = must(simulate(holders, [{ name: "A", amount: 500_000, kind: "post", cap: 5_000_000, discount: 0.2 }], round));
    expect(c.safes[0].method).toBe("cap");
  });

  it("uncapped, no-discount SAFE converts at the round price", () => {
    const c = must(simulate(holders, [{ name: "A", amount: 500_000, kind: "post" }], round));
    expect(c.safes[0].method).toBe("round");
    expect(c.safes[0].price).toBeCloseTo(c.roundPrice, 10);
    // Round price is consistent: pre-money / everything before the new money.
    expect(c.roundPrice * c.totals.afterSafes).toBeCloseTo(round.preMoney, 4);
  });

  it("uncapped MFN SAFE inherits the best cap and discount", () => {
    const safes: SafeInput[] = [
      { name: "MFN", amount: 250_000, kind: "post", mfn: true },
      { name: "Later", amount: 500_000, kind: "post", cap: 5_000_000, discount: 0.15 },
      { name: "Later 2", amount: 500_000, kind: "post", cap: 8_000_000 },
    ];
    const r = resolveMfn(safes)[0];
    expect(r.effCap).toBe(5_000_000);
    expect(r.effDiscount).toBe(0.15);
    const c = must(simulate(holders, safes, round));
    expect(c.safes[0].inherited).toBe(true);
    expect(c.safes[0].shares / c.totals.afterSafes).toBeCloseTo(0.05, 8);
  });

  it("pre-money SAFE uses the capitalization before SAFEs", () => {
    const c = must(simulate(holders, [{ name: "A", amount: 500_000, kind: "pre", cap: 5_000_000 }], round));
    expect(c.safes[0].price).toBeCloseTo(0.5, 10);
    expect(c.safes[0].shares).toBeCloseTo(1_000_000, 4);
  });
});

describe("priced round", () => {
  const safes: SafeInput[] = [
    { name: "A", amount: 500_000, kind: "post", cap: 5_000_000 },
    { name: "B", amount: 300_000, kind: "post", discount: 0.2 },
    { name: "C", amount: 200_000, kind: "pre", cap: 6_000_000, mfn: true },
  ];

  it("percentages sum to 100% at every stage", () => {
    const c = must(simulate(holders, safes, { ...round, poolPct: 0.12 }));
    for (const key of ["before", "afterSafes", "afterRound"] as const) {
      expect(c.rows.reduce((s, r) => s + r[key].pct, 0)).toBeCloseTo(1, 9);
    }
  });

  it("new investors own new money / post-money", () => {
    const c = must(simulate(holders, safes, { ...round, poolPct: 0.12 }));
    expect(c.newShares / c.totals.afterRound).toBeCloseTo(5 / 25, 9);
  });

  it("pool top-up hits the target after the round", () => {
    const c = must(simulate(holders, safes, { ...round, poolPct: 0.12 }));
    const pool = c.rows.filter((r) => r.kind === "pool" || r.kind === "new_pool").reduce((s, r) => s + r.afterRound.pct, 0);
    expect(pool).toBeCloseTo(0.12, 9);
    expect(c.poolIncrease).toBeGreaterThan(0);
  });

  it("no top-up when the pool is already big enough", () => {
    const c = must(simulate(holders, [], { ...round, poolPct: 0.05 }));
    expect(c.poolIncrease).toBe(0);
  });

  it("post-money SAFE keeps its 10% through a pool top-up, before new money", () => {
    const c = must(simulate(holders, [safes[0]], { ...round, poolPct: 0.15 }));
    expect(c.safes[0].shares / c.totals.afterSafes).toBeCloseTo(0.1, 8);
  });

  it("rejects bad input", () => {
    expect(simulate([], [], round).ok).toBe(false);
    expect(simulate(holders, [], { preMoney: 0, newMoney: 1 }).ok).toBe(false);
    expect(simulate(holders, [{ name: "A", amount: 6_000_000, kind: "post", cap: 5_000_000 }], round).ok).toBe(false);
  });
});

import { monthsBetween, standing, vestedShares } from "./captable";

describe("vesting and dates", () => {
  const grant = { shares: 4_800_000, start: "2024-01-15", vestMonths: 48, cliffMonths: 12 };

  it("counts whole months, completing on the same day of the month", () => {
    expect(monthsBetween("2024-01-15", "2024-02-14")).toBe(0);
    expect(monthsBetween("2024-01-15", "2024-02-15")).toBe(1);
    expect(monthsBetween("2024-01-31", "2025-01-30")).toBe(11);
    expect(monthsBetween("2025-01-01", "2024-01-01")).toBe(0);
  });

  it("vests nothing before the cliff, then monthly, then everything", () => {
    expect(vestedShares(grant, "2025-01-14")).toBe(0);
    expect(vestedShares(grant, "2025-01-15")).toBe(1_200_000);
    expect(vestedShares(grant, "2025-07-15")).toBe(1_800_000);
    expect(vestedShares(grant, "2028-01-15")).toBe(4_800_000);
    expect(vestedShares(grant, "2030-01-01")).toBe(4_800_000);
  });

  it("treats shares with no schedule as fully vested", () => {
    expect(vestedShares({ shares: 1000 }, "2020-01-01")).toBe(1000);
    expect(standing({ shares: 1000, end: "2025-01-01" }, "2026-01-01")).toMatchObject({ held: 1000, forfeited: 0, left: true, vests: false });
  });

  it("someone still here holds everything granted, with vesting shown", () => {
    expect(standing(grant, "2025-07-15")).toMatchObject({ held: 4_800_000, vested: 1_800_000, forfeited: 0, left: false, fullyVestedOn: "2028-01-15" });
  });

  it("someone who left before fully vesting keeps only what had vested", () => {
    const s = standing({ ...grant, end: "2025-10-20" }, "2026-11-25");
    expect(s).toMatchObject({ held: 2_100_000, vested: 2_100_000, forfeited: 2_700_000, left: true });
    expect(standing({ ...grant, end: "2024-09-01" }, "2026-11-25")).toMatchObject({ held: 0, forfeited: 4_800_000 });
  });

  it("a leaving date in the future changes nothing yet", () => {
    expect(standing({ ...grant, end: "2027-01-15" }, "2026-01-15")).toMatchObject({ held: 4_800_000, left: false });
  });

  it("rounds down to whole shares", () => {
    expect(vestedShares({ shares: 1000, start: "2024-01-01", vestMonths: 48 }, "2024-02-01")).toBe(20);
  });
});
