import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const { fmtMoney, clampArea, buildValuationInput, vhErrorMessage } = await import("./vinhomesValuation");

describe("fmtMoney", () => {
  it("tỷ / triệu / đồng", () => {
    expect(fmtMoney(5953900000)).toBe("5,95 tỷ");
    expect(fmtMoney(595390000)).toBe("595,4 triệu");
    expect(fmtMoney(12500)).toBe("12.500 đ");
  });
});

describe("clampArea", () => {
  it("kẹp trong khoảng, giá trị lỗi lấy giữa khoảng", () => {
    expect(clampArea(500, [45, 120])).toBe(120);
    expect(clampArea(10, [45, 120])).toBe(45);
    expect(clampArea("abc", [40, 120])).toBe(80);
  });
});

describe("buildValuationInput", () => {
  it("tầng chỉ cho căn hộ, căn góc chỉ cho thấp tầng, mã căn viết hoa", () => {
    expect(
      buildValuationInput({ type: "apartment", area: "90", direction: "DN", floor: "12", isCorner: true, unitCode: " a1 " })
    ).toMatchObject({ type: "apartment", area: 90, floor: 12, is_corner: false, unit_code: "A1", view: "none", years: 5 });
    expect(buildValuationInput({ type: "villa", area: 200, direction: "N", floor: 3, isCorner: true })).toMatchObject({
      floor: null,
      is_corner: true,
      unit_code: null,
      zone_id: null,
    });
  });
});

describe("vhErrorMessage", () => {
  it("dịch mã lỗi từ máy chủ", () => {
    expect(vhErrorMessage({ message: "VH_BAD_AREA" })).toMatch(/Diện tích/);
    expect(vhErrorMessage(new Error("boom"), "x")).toBe("x");
  });
});
