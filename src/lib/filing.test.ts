import { describe, expect, it } from "vitest";
import { cleanHints, fileKey, guessFolder, hintFor, matchFolder, planFiling, type FilingHint } from "./filing";

const FOLDERS = [
  { id: 1, name: "Pitch" }, { id: 2, name: "Company & org docs" }, { id: 3, name: "Cap table & SAFEs" }, { id: 4, name: "Financials" },
  { id: 5, name: "Product & traction" }, { id: 6, name: "Team" }, { id: 7, name: "IP & legal" }, { id: 8, name: "Closing" },
];
const hint = (h: Partial<FilingHint>): FilingHint => ({ id: 1, filename: "x.pdf", title: null, folder: null, description: null, safe_investor: null, ...h });

describe("filing", () => {
  it("reduces file names to what identifies them", () => {
    expect(fileKey("SAFE - Oak_Ventures (signed).PDF")).toBe("safe oak ventures signed");
    expect(fileKey("deck.v2.pptx")).toBe("deck v2");
  });

  it("guesses the folder from a file name", () => {
    const where = (n: string) => FOLDERS.find((f) => f.id === matchFolder(guessFolder(n), FOLDERS))?.name;
    expect(where("Acme pitch deck Nov.pdf")).toBe("Pitch");
    expect(where("Certificate of Incorporation.pdf")).toBe("Company & org docs");
    expect(where("SAFE - Oak Ventures.pdf")).toBe("Cap table & SAFEs");
    expect(where("83(b) election - Fiona.pdf")).toBe("Cap table & SAFEs");
    expect(where("PIIA Greg.pdf")).toBe("IP & legal");
    expect(where("Advisor agreement - Ada.pdf")).toBe("Team");
    expect(where("Financial model v3.xlsx")).toBe("Financials");
    expect(where("scan0042.pdf")).toBeUndefined();
  });

  it("matches the assistant's note to a file despite small naming differences", () => {
    const hints = [hint({ id: 7, filename: "Oak Ventures SAFE.pdf" }), hint({ id: 8, filename: "bylaws.docx" })];
    expect(hintFor("oak_ventures_safe.PDF", hints)?.id).toBe(7);
    expect(hintFor("Oak Ventures SAFE (1).pdf", hints)?.id).toBe(7);
    expect(hintFor("something else.pdf", hints)).toBeNull();
  });

  it("files by the assistant's note first, then by name, then into the fallback", () => {
    const hints = [hint({ id: 7, filename: "scan0042.pdf", title: "Signed SAFE - Oak Ventures", folder: "cap table & safes", safe_investor: "Oak Ventures", description: "Countersigned 1 March." })];
    expect(planFiling("scan0042.pdf", hints, FOLDERS, 1)).toEqual({ folderId: 3, title: "Signed SAFE - Oak Ventures", description: "Countersigned 1 March.", hintId: 7, safeInvestor: "Oak Ventures", how: "assistant" });
    expect(planFiling("Bylaws.pdf", hints, FOLDERS, 1)).toMatchObject({ folderId: 2, title: "Bylaws", how: "name", hintId: null });
    expect(planFiling("misc.pdf", hints, FOLDERS, 5)).toMatchObject({ folderId: 5, how: "default" });
  });

  it("falls back to the name when the assistant names a folder that does not exist", () => {
    const hints = [hint({ filename: "a.pdf", title: "Certificate of incorporation", folder: "Legal stuff" })];
    expect(planFiling("a.pdf", hints, FOLDERS, 1).folderId).toBe(2);
  });

  it("cleans what an assistant sends", () => {
    const out = cleanHints({ documents: [{ filename: "../../etc/Deck.pdf", title: "  Pitch deck ", folder: "Pitch", extra: 1 }, { filename: "deck.pdf" }, { title: "no file" }, "junk", { filename: "x".repeat(400) + ".pdf", description: "a\u0000b" }] });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ filename: "Deck.pdf", title: "Pitch deck", folder: "Pitch", description: null, safe_investor: null });
    expect(out[1].filename.length).toBeLessThanOrEqual(200);
    expect(out[1].description).toBe("a b");
    expect(cleanHints(null)).toEqual([]);
    expect(cleanHints({ documents: "nope" })).toEqual([]);
  });
});
