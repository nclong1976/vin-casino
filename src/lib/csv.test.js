import { describe, it, expect } from "vitest";
import { csvCell, parseCsv, parseIdentifierCsv, toCsv } from "./csv";

describe("csv", () => {
  it("parses quoted cells and detects the delimiter", () => {
    expect(parseCsv('email,amount\n"a@x.vn","1,000"\n')).toEqual([["email", "amount"], ["a@x.vn", "1,000"]]);
    expect(parseCsv("a;b\nc;d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("reads identifiers from the first column, skipping header and duplicates", () => {
    expect(parseIdentifierCsv("﻿Email,Tên\na@x.vn,A\nVC002,B\na@x.vn,A\n\n")).toEqual(["a@x.vn", "VC002"]);
    expect(parseIdentifierCsv("0911111111\n0922222222")).toEqual(["0911111111", "0922222222"]);
  });

  it("escapes cells and neutralises spreadsheet formulas", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(toCsv([["x", 1]])).toBe("﻿x,1");
  });
});
