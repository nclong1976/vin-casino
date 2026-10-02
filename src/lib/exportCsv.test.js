import { describe, it, expect } from "vitest";
import { toCsv } from "./exportCsv";

describe("toCsv", () => {
  it("BOM, tiêu đề, bọc ngoặc kép khi cần", () => {
    const csv = toCsv(
      [
        { a: "VRE", b: 18350, c: 'Ghi chú, có "ngoặc"' },
        { a: null, b: -4588, c: "dòng\nmới" },
      ],
      [
        { key: "a", label: "Mã" },
        { key: "b", label: "Giá" },
        { key: "c", label: "Ghi chú" },
      ]
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Mã,Giá,Ghi chú",
      'VRE,18350,"Ghi chú, có ""ngoặc"""',
      ',-4588,"dòng\nmới"',
    ]);
  });

  it("chặn công thức Excel nhưng giữ số âm", () => {
    const csv = toCsv([{ x: "=HYPERLINK(1)" }, { x: "-12.5" }, { x: "@cmd" }], [{ key: "x", label: "x", get: (r) => r.x }]);
    expect(csv.slice(1).split("\r\n").slice(1)).toEqual(["'=HYPERLINK(1)", "-12.5", "'@cmd"]);
  });
});
