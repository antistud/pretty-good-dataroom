import { describe, expect, it } from "vitest";
import { amount, extractJson, parseAnswer } from "./docfill";

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
    expect(a.holders[1]).toEqual({ name: "Option pool", kind: "pool", share_class: "Common", shares: 1000000 });
    expect(a.round).toMatchObject({ target_amount: 750000, valuation_cap: 6000000, discount_percent: 20 });
    expect(a.safes[0]).toMatchObject({ investor: "Oak Ventures", amount: 100000, type: "post", signed_on: "2026-03-01" });
    expect(a.unsure).toEqual(["Bylaws are unsigned."]);
  });
  it("drops entries that are unusable instead of failing the whole answer", () => {
    const a = parseAnswer(JSON.stringify({ team: [{ title: "No name" }, { name: "Greg" }], holders: [{ name: "No shares" }, { name: "Greg", shares: -5 }, { name: "Ann", shares: 10, kind: "wizard" }], safes: [{ investor: "X" }, { investor: "Y", amount: "50k", type: "PRE", signed_on: "March 2026" }] }))!;
    expect(a.team.map((m) => m.name)).toEqual(["Greg"]);
    expect(a.holders).toEqual([{ name: "Ann", kind: "investor", share_class: "Common", shares: 10 }]);
    expect(a.safes).toEqual([{ investor: "Y", amount: 50000, valuation_cap: null, discount_percent: null, type: "pre", mfn: false, signed_on: null, status: "signed" }]);
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
    expect(Object.keys(a).sort()).toEqual(["company", "holders", "round", "safes", "team", "unsure"]);
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
