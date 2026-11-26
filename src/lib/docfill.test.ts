import { describe, expect, it } from "vitest";
import { amount, extractJson, months, parseAnswer, parseDate, parseMonth } from "./docfill";

const GOOD = {
  company: { one_liner: "Scheduling for small clinics", overview_markdown: "## The problem\nClinics lose hours.", stage: "Pre-seed", founded: "2025", location: "Austin, TX", website: "https://acme.example" },
  team: [{ name: "Fiona Founder", title: "CEO", bio: "Ten years in clinics.", link: "https://linkedin.com/in/fiona" }],
  holders: [{ name: "Fiona Founder", kind: "founder", share_class: "Common", shares: 4000000 }, { name: "Option pool", kind: "pool", share_class: "Common", shares: "1,000,000" }],
  round: { name: "Pre-seed", instrument: "safe", target_amount: 750000, valuation_cap: "$6M", discount_percent: 0.2, pre_money: null, min_check: 10000, use_of_funds: "Reach 20 clinics." },
  safes: [{ investor: "Oak Ventures", amount: 100000, valuation_cap: 6000000, discount_percent: null, type: "post", mfn: false, signed_on: "2026-03-01", status: "signed" }],
  unsure: ["Bylaws are unsigned."],
};

describe("extractJson", () => {
  it("finds JSON inside a code block with chatter around it", () => {
    expect(extractJson("Here you go!\n```json\n{\"a\": 1}\n```\nLet me know.")).toEqual({ a: 1 });
  });
  it("finds bare JSON and repairs curly quotes", () => {
    expect(extractJson("Sure. {“a”: “b”}")).toEqual({ a: "b" });
  });
  it("returns null for text with no object", () => {
    expect(extractJson("I could not read the attachment.")).toBeNull();
  });
});

describe("parseAnswer", () => {
  it("accepts a good answer and normalises amounts, percentages and share counts", () => {
    const a = parseAnswer("```json\n" + JSON.stringify(GOOD) + "\n```")!;
    expect(a.company!.one_liner).toBe("Scheduling for small clinics");
    expect(a.holders[1]).toMatchObject({ name: "Option pool", kind: "pool", share_class: "Common", shares: 1000000, start_date: null, end_date: null });
    expect(a.round).toMatchObject({ target_amount: 750000, valuation_cap: 6000000, discount_percent: 20 });
    expect(a.safes[0]).toMatchObject({ investor: "Oak Ventures", amount: 100000, type: "post", signed_on: "2026-03-01" });
    expect(a.unsure).toEqual(["Bylaws are unsigned."]);
  });
  it("drops entries that say nothing, keeps partial ones as updates, and reports what it could not read", () => {
    const a = parseAnswer(JSON.stringify({ team: [{ title: "No name" }, { name: "Greg" }], holders: [{ name: "Says nothing" }, { name: "Greg", shares: -5 }, { name: "Ann", shares: 10, kind: "wizard" }, { name: "Jeff Stafford", end_date: "October 20, 2025" }], safes: [{ investor: "X" }, { investor: "Y", amount: "50k", type: "PRE", signed_on: "Q1 2026" }] }))!;
    expect(a.team.map((m) => m.name)).toEqual(["Greg"]);
    expect(a.holders.map((h) => h.name)).toEqual(["Ann", "Jeff Stafford"]);
    expect(a.holders[0]).toMatchObject({ kind: null, shares: 10 });
    expect(a.holders[1]).toMatchObject({ shares: null, end_date: "2025-10-20" });
    expect(a.safes).toEqual([{ investor: "Y", amount: 50000, valuation_cap: null, discount_percent: null, type: "pre", mfn: null, signed_on: null, status: null, clear: [] }]);
    expect(a.ignored).toEqual(['Greg, shares: could not read "-5". Use a whole number.', 'SAFE with Y, date signed: could not read "Q1 2026". Use YYYY-MM-DD.']);
  });
  it("reads vesting, leaving dates and monthly financials", () => {
    const a = parseAnswer(JSON.stringify({
      holders: [{ name: "Jeff Stafford", kind: "founder", shares: "4,800,000", start_date: "1/15/2024", vest_months: "4 years", cliff_months: 12, end_date: "2025-10-20T00:00:00Z" }],
      financials: [{ month: "Oct 2026", revenue: 0, expenses: "41,500", cash: 122500 }, { month: "2026-10", cash: 1 }, { month: "nonsense", cash: 5 }],
    }))!;
    expect(a.holders[0]).toMatchObject({ shares: 4800000, start_date: "2024-01-15", vest_months: 48, cliff_months: 12, end_date: "2025-10-20" });
    expect(a.financials).toEqual([{ month: "2026-10", revenue: 0, expenses: 41500, cash: 122500, notes: "" }]);
    expect(a.ignored.some((x) => x.includes("nonsense"))).toBe(true);
  });
  it("only keeps http(s) links and clamps over-long text", () => {
    const a = parseAnswer(JSON.stringify({ company: { one_liner: "x".repeat(500), website: "javascript:alert(1)" }, team: [{ name: "Greg", link: "data:text/html,hi" }] }))!;
    expect(a.company!.one_liner.length).toBe(200);
    expect(a.company!.website).toBe("");
    expect(a.team[0].link).toBe("");
  });
  it("ignores a round with no amount, wrong types and unexpected keys", () => {
    const a = parseAnswer(JSON.stringify({ round: { name: "Seed" }, team: "not a list", holders: { name: "x" }, extra: { admin: true }, safes: [{ investor: "Z", amount: 1 }] }))!;
    expect(a.round).toBeNull();
    expect(a.team).toEqual([]);
    expect(a.holders).toEqual([]);
    expect(Object.keys(a).sort()).toEqual(["company", "financials", "holders", "ignored", "round", "safes", "team", "unsure"]);
  });
  it("returns null when there is nothing usable", () => {
    expect(parseAnswer("Sorry, no documents were attached.")).toBeNull();
    expect(parseAnswer("{}")).toBeNull();
    expect(parseAnswer(JSON.stringify({ team: [], holders: [], safes: [] }))).toBeNull();
  });
  it("caps list sizes", () => {
    const a = parseAnswer(JSON.stringify({ team: Array.from({ length: 100 }, (_, i) => ({ name: `P${i}` })) }))!;
    expect(a.team.length).toBe(30);
  });
});

describe("amount", () => {
  it("reads numbers however they are written and rejects nonsense", () => {
    expect(amount(1200000)).toBe(1200000);
    expect(amount("1,200,000")).toBe(1200000);
    expect(amount("$1.2M")).toBe(1200000);
    expect(amount("lots")).toBeNull();
    expect(amount(-1)).toBeNull();
    expect(amount(Infinity)).toBeNull();
  });
});

describe("dates", () => {
  it("reads the ways an assistant writes a date", () => {
    for (const v of ["2026-03-01", "2026/3/1", "March 1, 2026", "Mar 1st 2026", "1 March 2026", "3/1/2026", "2026-03-01T12:00:00Z"]) expect(parseDate(v), v).toBe("2026-03-01");
    expect(parseDate("25/12/2025")).toBe("2025-12-25");
    for (const v of ["", null, "Q1 2026", "2026-02-30", "soon", "13/13/2025", 20260301]) expect(parseDate(v), String(v)).toBeNull();
  });
  it("reads months and durations", () => {
    for (const v of ["2026-10", "Oct 2026", "October 2026", "10/2026", "2026-10-31"]) expect(parseMonth(v), v).toBe("2026-10");
    expect(parseMonth("2026-13")).toBeNull();
    expect([months(48), months("48"), months("48 months"), months("4 years"), months("1 yr"), months("a while"), months(1.5), months(999)]).toEqual([48, 48, 48, 48, 12, null, null, null]);
  });
});
