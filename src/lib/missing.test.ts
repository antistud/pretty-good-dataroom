import { describe, expect, it } from "vitest";
import { findMissing, type MissingInput } from "./missing";

const base: MissingInput = { docs: [], filledFolders: [], holders: [], team: [], safes: [], rounds: [], dismissed: [] };
const keys = (i: Partial<MissingInput>) => findMissing({ ...base, ...i }).map((m) => m.key);

describe("findMissing", () => {
  it("asks for nothing when the room is empty", () => {
    expect(keys({})).toEqual([]);
  });

  it("asks for the company and founder paperwork once founders are on the cap table", () => {
    const k = keys({ holders: [{ name: "Fiona Founder", kind: "founder", shares: 4_500_000 }, { name: "Greg Cofounder", kind: "founder", shares: 4_500_000 }] });
    expect(k).toEqual(["certificate", "bylaws", "consent", "stock:fiona founder", "stock:greg cofounder", "83b", "ip:fiona founder", "ip:greg cofounder"]);
  });

  it("recognises documents by name, per person", () => {
    const k = keys({
      holders: [{ name: "Fiona Founder", kind: "founder", shares: 1 }, { name: "Greg Cofounder", kind: "founder", shares: 1 }],
      docs: ["Certificate of Incorporation.pdf", "Bylaws", "Board consent - initial issuance", "Founder Stock Purchase Agreement (Fiona)", "PIIA - Greg Cofounder.pdf", "83(b) election Fiona"],
    });
    expect(k).toEqual(["stock:greg cofounder", "ip:fiona founder"]);
  });

  it("trusts the count when names are not in the file names", () => {
    const k = keys({ holders: [{ name: "Fiona Founder", kind: "founder", shares: 1 }, { name: "Greg Cofounder", kind: "founder", shares: 1 }], docs: ["RSPA 1", "RSPA 2", "Invention assignment A", "Invention assignment B"] });
    expect(k.filter((x) => x.startsWith("stock") || x.startsWith("ip"))).toEqual([]);
  });

  it("asks for each signed SAFE that has no copy, and not for committed ones", () => {
    const safes = [
      { id: 1, investor: "Oak Ventures", amount: 100_000, status: "signed", signed_on: "2026-03-01", hasDocument: false },
      { id: 2, investor: "Birch Capital", amount: 50_000, status: "wired", signed_on: null, hasDocument: true },
      { id: 3, investor: "Elm Angels", amount: 25_000, status: "committed", signed_on: null, hasDocument: false },
      { id: 4, investor: "Harbor Angels LLC", amount: 25_000, status: "signed", signed_on: null, hasDocument: false },
    ];
    const found = findMissing({ ...base, safes, docs: ["cert of inc - certificate of incorporation", "bylaws", "SAFE - Harbor (signed).pdf"] });
    expect(found.map((m) => m.key)).toEqual(["safe:1"]);
    expect(found[0].title).toBe("Signed SAFE with Oak Ventures");
    expect(found[0].why).toContain("$100K");
  });

  it("asks for the plan behind an option pool and agreements for advisors", () => {
    const k = keys({ holders: [{ name: "Option pool", kind: "pool", shares: 1_000_000 }, { name: "Ada Advisor", kind: "advisor", shares: 20_000 }], docs: ["certificate of incorporation", "bylaws", "board consent"] });
    expect(k).toEqual(["advisor:ada advisor", "plan"]);
  });

  it("asks for a deck and the SAFE form when a SAFE round is open", () => {
    expect(keys({ rounds: [{ name: "Pre-seed", status: "open", instrument: "safe" }] })).toEqual(["deck", "safe-form"]);
    expect(keys({ rounds: [{ name: "Pre-seed", status: "planning", instrument: "safe" }] })).toEqual([]);
    expect(keys({ rounds: [{ name: "Pre-seed", status: "open", instrument: "safe" }], filledFolders: ["Pitch"], docs: ["Post-money SAFE (form)"] })).toEqual([]);
  });

  it("groups long lists and respects 'not needed'", () => {
    const team = ["Ann One", "Bob Two", "Cy Three", "Di Four", "Ed Five"].map((name) => ({ name }));
    const found = findMissing({ ...base, team });
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe("IP assignment agreements for 5 people");
    expect(findMissing({ ...base, team, dismissed: ["ip"] })).toEqual([]);
  });

  it("asks for the paperwork when someone left before fully vesting", () => {
    const holders = [{ name: "Jeff Stafford", kind: "founder", shares: 1_000_000, left: true, forfeited: 3_000_000 }];
    const docs = ["certificate of incorporation", "bylaws", "board consent", "stock purchase agreement jeff", "83(b)", "piia jeff stafford"];
    expect(keys({ holders, docs })).toEqual(["leaving:jeff stafford"]);
    expect(keys({ holders, docs: [...docs, "Stafford - share repurchase notice.pdf"] })).toEqual([]);
  });
});
