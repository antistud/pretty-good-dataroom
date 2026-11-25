import { describe, expect, it } from "vitest";
import { contactKeys, guessMapping, looksLikeHeader, parseAmount, parseCsv, toContacts } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, embedded commas, line breaks and a byte-order mark", () => {
    const rows = parseCsv('﻿Firm,Name,Notes\r\n"Birch, Capital","Bob ""B"" Birch","line one\nline two"\r\n\r\nOak,,\r\n');
    expect(rows).toEqual([["Firm", "Name", "Notes"], ["Birch, Capital", 'Bob "B" Birch', "line one\nline two"], ["Oak", "", ""]]);
  });
  it("detects semicolon and tab separators", () => {
    expect(parseCsv("Firm;Email\nOak;a@b.co")[1]).toEqual(["Oak", "a@b.co"]);
    expect(parseCsv("Firm\tEmail\nOak\ta@b.co")[1]).toEqual(["Oak", "a@b.co"]);
  });
});

describe("guessMapping", () => {
  it("maps common export headings", () => {
    expect(guessMapping(["Company", "First Name", "Last Name", "Email Address", "Check Size", "Introduced By", "Notes"])).toEqual({ firm: 0, first: 1, last: 2, email: 3, cheque: 4, source: 5, notes: 6 });
  });
  it("prefers an exact Name column and does not confuse it with first/last", () => {
    expect(guessMapping(["Name", "Fund", "E-mail"])).toEqual({ name: 0, firm: 1, email: 2 });
  });
  it("recognises a header row, and a row of data", () => {
    expect(looksLikeHeader(["Firm", "Email"])).toBe(true);
    expect(looksLikeHeader(["Oak Ventures", "amy@oak.vc"])).toBe(false);
  });
});

describe("parseAmount", () => {
  it("reads the ways people write money", () => {
    expect(parseAmount("$50k")).toBe(50_000);
    expect(parseAmount("50,000")).toBe(50_000);
    expect(parseAmount("1.5m")).toBe(1_500_000);
    expect(parseAmount("USD 25000")).toBe(25_000);
    expect(parseAmount("tbd")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("toContacts", () => {
  const mapping = { firm: 0, first: 1, last: 2, email: 3, cheque: 4 };
  it("builds contacts, joins names, and lists an angel under their own name", () => {
    const { contacts } = toContacts([["Oak", "Amy", "Ng", "Amy@Oak.vc", "$25k"], ["", "Sam", "Ortiz", "", ""]], mapping);
    expect(contacts[0]).toMatchObject({ firm: "Oak", name: "Amy Ng", email: "amy@oak.vc", cheque: 25_000 });
    expect(contacts[1]).toMatchObject({ firm: "Sam Ortiz", name: "Sam Ortiz", email: "" });
  });
  it("skips empty and repeated rows and drops bad emails without losing the person", () => {
    const out = toContacts([["Oak", "Amy", "Ng", "amy@oak.vc", ""], ["Oak", "Amy", "Ng", "amy@oak.vc", ""], ["", "", "", "x@y.zz", ""], ["Elm", "Jo", "Fox", "not-an-email", ""]], mapping, 2);
    expect(out.contacts.map((c) => c.firm)).toEqual(["Oak", "Elm"]);
    expect(out.contacts[1].email).toBe("");
    expect(out.badEmails).toBe(1);
    expect(out.skipped).toEqual([{ line: 3, reason: "repeated in this file" }, { line: 4, reason: "no firm or name" }]);
  });
  it("gives the same key for the same person regardless of letter case", () => {
    expect(contactKeys({ firm: "Oak", name: "Amy Ng", email: "AMY@oak.vc" })).toEqual(contactKeys({ firm: "oak", name: "amy ng", email: "amy@oak.vc" }));
  });
});
