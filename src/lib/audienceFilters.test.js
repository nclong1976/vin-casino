import { describe, expect, it } from "vitest";
import { cleanFilters, describeFilters } from "./audienceFilters";

describe("audienceFilters", () => {
  it("cleanFilters bỏ khoá rỗng, giữ exclude_locked", () => {
    expect(cleanFilters({ membership_tier: [], min_total_deposited: "", project_ids: ["p1"], exclude_locked: false })).toEqual({
      project_ids: ["p1"],
      active_investment: false,
      exclude_locked: false,
    });
    expect(cleanFilters({}).exclude_locked).toBe(true);
  });

  it("describeFilters mô tả ngắn gọn", () => {
    expect(describeFilters({ membership_tier: ["Gold"], min_total_deposited: 100000000, project_ids: ["p1"], active_investment: true }, { p1: { title: "Vinhomes" } })).toBe(
      "hạng Gold · đã nạp ≥ 100.000.000 đ · đầu tư Vinhomes · khoản đầu tư chưa tất toán · bỏ tài khoản khoá",
    );
    expect(describeFilters({ exclude_locked: false })).toBe("Tất cả hội viên");
  });
});
