import { describe, it, expect } from "vitest";
import { actionLabel, estimateEntitlement, avgCostAfterStockDividend, groupByMonth, fmtDate } from "./dividends";

describe("cổ tức", () => {
  it("tiền mặt 1.500 đ/CP, 2.000 CP, thuế 5% => 2.850.000 đ (tiêu chí nghiệm thu spec)", () => {
    expect(estimateEntitlement({ action_type: "CASH", cash_per_share: 1500, tax_rate: 0.05 }, 2000)).toEqual({
      qty: 2000,
      gross: 3000000,
      tax: 150000,
      net: 2850000,
      shares: 0,
    });
  });

  it("CP thưởng 10:1 với 1.000 CP giá vốn 18.350 => 1.100 CP, giá vốn 16.682", () => {
    const e = estimateEntitlement({ action_type: "STOCK", ratio_from: 10, ratio_to: 1 }, 1000);
    expect(e.shares).toBe(100);
    expect(Math.round(avgCostAfterStockDividend(1000, 18350000, e.shares))).toBe(16682);
  });

  it("làm tròn xuống phần lẻ cổ phiếu", () => {
    expect(estimateEntitlement({ action_type: "STOCK", ratio_from: 10, ratio_to: 1 }, 1055).shares).toBe(105);
    expect(estimateEntitlement({ action_type: "CASH", cash_per_share: 1500, tax_rate: 0.05 }, 0).net).toBe(0);
  });

  it("nhãn, nhóm tháng, định dạng ngày", () => {
    expect(actionLabel({ action_type: "CASH", cash_per_share: 1500 })).toBe("Tiền mặt 1.500 đ/CP");
    expect(actionLabel({ action_type: "STOCK", ratio_from: 10, ratio_to: 1 })).toBe("Cổ phiếu tỉ lệ 10:1");
    const g = groupByMonth([{ payment_date: "2026-10-12" }, { payment_date: "2026-11-02" }, { payment_date: "2026-10-30" }]);
    expect(g.map((x) => [x.key, x.items.length])).toEqual([["10/2026", 2], ["11/2026", 1]]);
    expect(fmtDate("2026-10-07")).toBe("07/10/2026");
  });
});
