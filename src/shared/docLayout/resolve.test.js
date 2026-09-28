import { describe, it, expect } from "vitest";
import {
  buildSystemVariables,
  collectVariableKeys,
  filterAllowedAttributes,
  findMissingRequired,
  formatMoney,
  formatVnDate,
  formatVnDateLong,
  formatVnDateTime,
  legacyBodyToDelta,
  maskIdCard,
  normalizeDelta,
  normalizeVariableKey,
  plainTextToDelta,
  resolveDelta,
  resolveTemplateString,
} from "./resolve";
import { canonicalJson, computeContentHash, sha256Hex } from "./canonical";

const v = (key, attributes) => (attributes ? { insert: { variable: key }, attributes } : { insert: { variable: key } });

describe("normalizeVariableKey", () => {
  it("lowercases and snake_cases so legacy UPPERCASE keys still match", () => {
    expect(normalizeVariableKey("HO_TEN")).toBe("ho_ten");
    expect(normalizeVariableKey(" User Name ")).toBe("user_name");
    expect(normalizeVariableKey("so-tien!")).toBe("sotien");
  });
});

describe("filterAllowedAttributes", () => {
  it("keeps only supported inline formats and palette colors", () => {
    expect(filterAllowedAttributes({ bold: true, font: "Comic", link: "javascript:x", color: "#B91C1C" }, false)).toEqual({
      bold: true,
      color: "#b91c1c",
    });
    expect(filterAllowedAttributes({ color: "#ff00ff" }, false)).toBeUndefined();
  });

  it("keeps only supported block formats and caps indent", () => {
    expect(filterAllowedAttributes({ header: 2, align: "justify", list: "bullet", indent: 5, bold: true }, true)).toEqual({
      header: 2,
      align: "justify",
      list: "bullet",
      indent: 1,
    });
    expect(filterAllowedAttributes({ header: 4, align: "left", list: "check" }, true)).toBeUndefined();
  });
});

describe("normalizeDelta", () => {
  it("splits multi-line inserts, merges same-format runs and ends with a newline", () => {
    const out = normalizeDelta({ ops: [{ insert: "a" }, { insert: "b\nc" }, { insert: "d", attributes: { bold: true } }] });
    expect(out.ops).toEqual([{ insert: "ab" }, { insert: "\n" }, { insert: "c" }, { insert: "d", attributes: { bold: true } }, { insert: "\n" }]);
  });

  it("keeps block attributes only on a standalone newline op", () => {
    const out = normalizeDelta([{ insert: "Tiêu đề" }, { insert: "\n", attributes: { header: 1, bold: true } }]);
    expect(out.ops).toEqual([{ insert: "Tiêu đề" }, { insert: "\n", attributes: { header: 1 } }]);
  });

  it("normalizes Vietnamese text to NFC", () => {
    const decomposed = "Việt";
    const out = normalizeDelta([{ insert: decomposed }]);
    expect(out.ops[0].insert).toBe("Việt");
  });

  it("turns empty input into a single empty paragraph", () => {
    expect(normalizeDelta(null).ops).toEqual([{ insert: "\n" }]);
  });
});

describe("legacy conversion", () => {
  it("converts phase-1 {{VAR}} bodies into variable embeds", () => {
    const out = legacyBodyToDelta("Kính gửi {{HO_TEN}},\nSố tiền: {{ SO_TIEN }}");
    expect(out.ops).toEqual([
      { insert: "Kính gửi " },
      v("ho_ten"),
      { insert: "," },
      { insert: "\n" },
      { insert: "Số tiền: " },
      v("so_tien"),
      { insert: "\n" },
    ]);
  });

  it("converts plain text into one paragraph per line", () => {
    expect(plainTextToDelta("a\nb\n\n").ops).toEqual([{ insert: "a" }, { insert: "\n" }, { insert: "b" }, { insert: "\n" }]);
  });
});

describe("formatters", () => {
  const issued = new Date("2026-09-28T17:30:05Z"); // 00:30:05 ngày 29/09 giờ VN

  it("formats dates in Vietnam time", () => {
    expect(formatVnDate(issued)).toBe("29/09/2026");
    expect(formatVnDateLong(issued)).toBe("ngày 29 tháng 09 năm 2026");
    expect(formatVnDateTime(issued)).toBe("00:30:05 29/09/2026 (GMT+7)");
    expect(formatVnDate("not a date")).toBe("");
  });

  it("formats money with dot grouping", () => {
    expect(formatMoney(5000000)).toBe("5.000.000");
    expect(formatMoney("1,234,567")).toBe("1.234.567");
    expect(formatMoney("-001000")).toBe("-1.000");
    expect(formatMoney("khoảng 5 triệu")).toBe("khoảng 5 triệu");
  });

  it("masks id card numbers", () => {
    expect(maskIdCard("001203004789")).toBe("0012*****789");
    expect(maskIdCard("12345")).toBe("*****");
    expect(maskIdCard(null)).toBe("");
  });
});

describe("resolveDelta", () => {
  const system = buildSystemVariables(
    { full_name: "Nguyễn Văn A", email: "a@example.com", id_card_number: "001203004789" },
    { issuedAt: new Date("2026-09-28T03:00:00Z"), docNo: "VC/2026/000123", issuerName: "Đại diện VinClub" },
  );

  const body = {
    ops: [
      { insert: "Kính gửi: " },
      v("user_name", { bold: true }),
      { insert: "\n" },
      v("notice_content"),
      { insert: " (hạn " },
      v("deadline"),
      { insert: ")\n" },
      { insert: "Số tiền: " },
      v("AMOUNT"),
      { insert: "\n" },
    ],
  };

  const definitions = [
    { key: "notice_content", type: "richtext", scope: "campaign", required: true },
    { key: "deadline", type: "date", scope: "campaign" },
    { key: "amount", type: "money", scope: "recipient" },
  ];

  it("substitutes system, campaign and recipient values with the right precedence", () => {
    const { delta, missingRequired, unknown } = resolveDelta(body, {
      definitions,
      system,
      campaignValues: {
        notice_content: { ops: [{ insert: "Nội dung " }, { insert: "quan trọng", attributes: { bold: true, link: "x" } }, { insert: "\n" }] },
        deadline: "2026-10-05",
        amount: "1",
      },
      recipientValues: { AMOUNT: 5000000 },
    });
    expect(missingRequired).toEqual([]);
    expect(unknown).toEqual([]);
    expect(delta.ops).toEqual([
      { insert: "Kính gửi: " },
      { insert: "Nguyễn Văn A", attributes: { bold: true } },
      { insert: "\n" },
      { insert: "Nội dung " },
      { insert: "quan trọng", attributes: { bold: true } },
      { insert: " (hạn 05/10/2026)" },
      { insert: "\n" },
      { insert: "Số tiền: 5.000.000" },
      { insert: "\n" },
    ]);
  });

  it("reports missing required values and leaves no raw placeholder behind", () => {
    const { delta, missingRequired } = resolveDelta(body, { definitions, system });
    expect(missingRequired).toEqual(["notice_content"]);
    const text = delta.ops.map((op) => op.insert).join("");
    expect(text).not.toContain("{{");
    expect(text).toContain("(hạn )");
  });

  it("flags variables that are neither declared nor system variables", () => {
    const { unknown } = resolveDelta({ ops: [v("ma_la"), { insert: "\n" }] }, { system });
    expect(unknown).toEqual(["ma_la"]);
  });

  it("inserts non-richtext values as single-line plain text", () => {
    const { delta } = resolveDelta({ ops: [v("ghi_chu"), { insert: "\n" }] }, {
      definitions: [{ key: "ghi_chu", type: "text" }],
      campaignValues: { ghi_chu: "dòng 1\ndòng 2<script>" },
    });
    expect(delta.ops).toEqual([{ insert: "dòng 1 dòng 2<script>" }, { insert: "\n" }]);
  });

  it("findMissingRequired also checks required variables absent from the body", () => {
    expect(findMissingRequired({ definitions: [{ key: "x", required: true }], campaignValues: { x: "  " } })).toEqual(["x"]);
  });
});

describe("resolveTemplateString / collectVariableKeys", () => {
  it("fills one-line templates case-insensitively", () => {
    expect(
      resolveTemplateString("THÔNG BÁO V/v {{ Notice_Subject }} - {{missing}}", { campaignValues: { notice_subject: "Phí dịch vụ" } }),
    ).toBe("THÔNG BÁO V/v Phí dịch vụ - ");
  });

  it("collects variable keys in order without duplicates", () => {
    expect(collectVariableKeys({ ops: [v("b"), { insert: "x" }, v("A"), v("b")] })).toEqual(["b", "a"]);
  });
});

describe("canonical hashing", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })).toBe('{"a":{"d":[1,{"x":1,"y":2}]},"b":1}');
  });

  it("computes a stable sha256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const a = await computeContentHash({ title: "T", rendered_model: { ops: [] }, layout_snapshot: { x: 1, y: 2 }, letterhead_snapshot: null });
    const b = await computeContentHash({ letterhead_snapshot: null, layout_snapshot: { y: 2, x: 1 }, rendered_model: { ops: [] }, title: "T" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
