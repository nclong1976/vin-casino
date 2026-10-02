import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const { summarizePositions, stockErrorCode, stockErrorMessage } = await import("./stockOrders");

describe("summarizePositions", () => {
  it("tính giá trị thị trường và lãi/lỗ theo giá hiện tại", () => {
    const s = summarizePositions(
      [
        { symbol: "VRE", project_id: "p_stock_vre", qty: 1000, total_cost: 18350000 },
        { symbol: "VFS", project_id: "p_stock_vfs", qty: 1000, total_cost: 88500000 },
      ],
      { VRE: 20000, VFS: 88500 }
    );
    expect(s.rows[0].symbol).toBe("VFS");
    expect(s.totalCost).toBe(106850000);
    expect(s.marketValue).toBe(108500000);
    expect(s.pnl).toBe(1650000);
    const vre = s.rows.find((r) => r.symbol === "VRE");
    expect(vre.avgCost).toBe(18350);
    expect(vre.pnlPct).toBeCloseTo(8.99, 2);
  });

  it("thiếu giá thì lấy giá vốn, bỏ dòng SL 0", () => {
    const s = summarizePositions(
      [
        { symbol: "VIC", qty: 1000, total_cost: 45200000 },
        { symbol: "VHM", qty: 0, total_cost: 0 },
      ],
      {}
    );
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].price).toBeNull();
    expect(s.pnl).toBe(0);
  });
});

describe("stockErrorMessage", () => {
  it("nhận mã lỗi từ thông báo Postgres", () => {
    expect(stockErrorCode({ message: "INSUFFICIENT_BUYING_POWER" })).toBe("INSUFFICIENT_BUYING_POWER");
    expect(stockErrorMessage({ message: "SYMBOL_HALTED" })).toBe("Mã cổ phiếu đang tạm khoá giao dịch.");
    expect(stockErrorMessage({ message: "boom" }, "x")).toBe("x");
  });
});
