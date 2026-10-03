import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const { DEFAULT_CONFIG, validateConfig, validateSchedule, normalizeConfig, parseUnitsText, validateLoan } = await import(
  "./vinhomesValuationAdmin"
);

describe("validateConfig", () => {
  it("cấu hình mặc định hợp lệ", () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
  });

  it("báo lỗi hệ số, khoảng diện tích, biên độ", () => {
    const errs = validateConfig({
      ...DEFAULT_CONFIG,
      k_type: { ...DEFAULT_CONFIG.k_type, villa: 0 },
      area_ranges: { ...DEFAULT_CONFIG.area_ranges, apartment: [120, 45] },
      band_pct: 40,
    });
    expect(errs.join(" ")).toMatch(/loại hình villa/);
    expect(errs.join(" ")).toMatch(/Khoảng diện tích apartment/);
    expect(errs.join(" ")).toMatch(/Biên độ/);
  });

  it("chuỗi rỗng không được coi là 0", () => {
    expect(validateConfig({ ...DEFAULT_CONFIG, corner_factor: "" }).join(" ")).toMatch(/căn góc/);
  });
});

describe("validateSchedule", () => {
  it("tổng phải 100%, tháng không giảm", () => {
    expect(validateSchedule([{ label: "A", pct: 50, month: 0 }, { label: "B", pct: 40, month: 3 }])).toEqual([
      "Tổng các đợt phải bằng 100% (hiện 90%).",
    ]);
    expect(validateSchedule([{ label: "A", pct: 50, month: 6 }, { label: "B", pct: 50, month: 3 }]).join(" ")).toMatch(/không nhỏ hơn/);
    expect(validateSchedule([])).toHaveLength(1);
  });
});

describe("normalizeConfig", () => {
  it("ép chuỗi sang số, chỉ giữ khoảng diện tích / tỉ suất của loại hình đang bán", () => {
    const n = normalizeConfig({
      ...DEFAULT_CONFIG,
      k_type: { apartment: "1.1" },
      band_pct: "7",
      payment_schedule: [{ label: " Đợt 1 ", pct: "100", month: "0" }],
    });
    expect(n.k_type).toEqual({ apartment: 1.1 });
    expect(n.band_pct).toBe(7);
    expect(Object.keys(n.area_ranges)).toEqual(["apartment"]);
    expect(Object.keys(n.rent_yield)).toEqual(["apartment"]);
    expect(n.payment_schedule).toEqual([{ label: "Đợt 1", pct: 100, month: 0 }]);
  });
});

describe("parseUnitsText", () => {
  it("đọc nhiều dòng, nhận tên tiếng Việt, báo lỗi theo dòng", () => {
    const { units, errors } = parseUnitsText(
      "a1-1203, căn hộ, 76, dn, 12, không, park\nSH-01; Shophouse; 100; N; ; có\nX, lâu đài, 50, N\nY, villa, 200, ZZ"
    );
    expect(units).toEqual([
      { code: "A1-1203", type: "apartment", area: 76, direction: "DN", floor: 12, is_corner: false, view: "park" },
      { code: "SH-01", type: "shophouse", area: 100, direction: "N", floor: null, is_corner: true, view: "none" },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/Dòng 3/);
    expect(errors[1]).toMatch(/Dòng 4/);
  });
});

describe("validateLoan", () => {
  it("kiểm tra tỉ lệ vay, thời hạn, lãi", () => {
    expect(validateLoan({ name: "A", max_ltv: 0.7, years: 20, promo_rate: 7.5, promo_months: 12, float_rate: 10.5 })).toEqual([]);
    expect(validateLoan({ name: "", max_ltv: 0.95, years: 40, promo_rate: 31, promo_months: -1, float_rate: "" })).toHaveLength(6);
  });
});
