import { describe, expect, it } from "vitest";
import { fold, highlightRuns, matchFields, rank, tokenize } from "../search";

const title = (text: string, q: string) => matchFields([{ text, primary: true }], tokenize(q));
const marked = (text: string, q: string) => {
  const m = title(text, q);
  return m && highlightRuns(text, m.fields[0].ranges).map((r) => (r.hit ? `[${r.text}]` : r.text)).join("");
};

describe("search matching", () => {
  it("ignores case and accents, keeping indices", () => {
    expect(fold("Café Ü").length).toBe("Café Ü".length);
    expect(marked("Café loyalty programme", "cafe")).toBe("[Café] loyalty programme");
    expect(marked("Chase overdue invoices", "INVOICE")).toBe("Chase overdue [invoice]s");
  });

  it("needs every word, in any order", () => {
    expect(marked("Chase overdue invoices", "inv over")).toBe("Chase [over]due [inv]oices");
    expect(title("Chase overdue invoices", "invoice payroll")).toBeNull();
  });

  it("ranks whole words over word starts over the middle of a word", () => {
    const whole = title("Send the invoice", "invoice")!.score;
    const start = title("Invoices to one sheet", "invoice")!.score;
    const inside = title("Reinvoiced costs", "invoice")!.score;
    expect(whole).toBeGreaterThan(inside);
    expect(start).toBeGreaterThan(inside);
  });

  it("treats camelCase and separators as word starts", () => {
    expect(title("VendorInvoices.xlsx", "invoices")!.score).toBeGreaterThan(title("Reinvoices.xlsx", "invoices")!.score);
    expect(marked("contract-renewal-dates.csv", "renewal")).toBe("contract-[renewal]-dates.csv");
  });

  it("weighs the primary field over a secondary one", () => {
    const tokens = tokenize("march");
    const inName = matchFields([{ text: "March summary.xlsx", primary: true }, { text: "Other task" }], tokens)!;
    const inTask = matchFields([{ text: "summary.xlsx", primary: true }, { text: "March expense summary" }], tokens)!;
    expect(inName.score).toBeGreaterThan(inTask.score);
    expect(inTask.fields[1].ranges).toEqual([[0, 5]]);
  });

  it("breaks ties by recency", () => {
    const m = title("Invoice", "invoice")!;
    const ranked = rank([
      { item: "old", match: m, at: 1 },
      { item: "new", match: m, at: 2 },
    ]);
    expect(ranked.map((r) => r.item)).toEqual(["new", "old"]);
  });
});
