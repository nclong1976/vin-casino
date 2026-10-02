import { describe, it, expect } from "vitest";
import { computeWalletNet } from "@/lib/transactionHistory.js";

describe("computeWalletNet — tính số dư ground truth từ lịch sử WalletTransaction", () => {
  it("tính cả type='bonus' vào tiền VÀO (lãi hàng ngày theo cấp VIP, credit_daily_interest_batch() ghi thẳng type='bonus', không phải 'deposit')", () => {
    const raw = [
      { type: "deposit", amount: 1_000_000, status: "completed" },
      { type: "bonus", amount: 50_000, status: "approved" },
      { type: "withdraw", amount: 200_000, status: "completed" },
    ];

    const { depSum, outSum, netCalculated } = computeWalletNet(raw);

    expect(depSum).toBe(1_050_000); // 1.000.000 (deposit) + 50.000 (bonus) - trước đây bỏ sót bonus
    expect(outSum).toBe(200_000);
    expect(netCalculated).toBe(850_000);
  });

  it("bỏ qua giao dịch chưa chốt tiền (pending/rejected/failed)", () => {
    const raw = [
      { type: "deposit", amount: 1_000_000, status: "completed" },
      { type: "deposit", amount: 500_000, status: "pending" },
      { type: "deposit", amount: 300_000, status: "rejected" },
      { type: "withdraw", amount: 100_000, status: "failed" },
    ];

    const { netCalculated } = computeWalletNet(raw);

    expect(netCalculated).toBe(1_000_000);
  });

  it("gộp cả 'investment' và 'withdrawal' (đặt cược) vào tiền RA cùng với 'withdraw'", () => {
    const raw = [
      { type: "deposit", amount: 1_000_000, status: "completed" },
      { type: "investment", amount: 100_000, status: "completed" },
      { type: "withdrawal", amount: 100_000, status: "approved" },
    ];

    const { outSum, netCalculated } = computeWalletNet(raw);

    expect(outSum).toBe(200_000);
    expect(netCalculated).toBe(800_000);
  });

  it("không trả về số âm (khớp GREATEST(0, ...) ở phía server)", () => {
    const raw = [{ type: "withdraw", amount: 100_000, status: "completed" }];

    expect(computeWalletNet(raw).netCalculated).toBe(0);
  });
});

describe("tiền bán cổ phiếu (type='stock_sale')", () => {
  it("là tiền VÀO, hiển thị 'Bán cổ phiếu' với dấu +", async () => {
    const { normalizeWalletTransaction, TRANSACTION_KINDS } = await import("@/lib/transactionHistory.js");
    const { depSum } = computeWalletNet([{ type: "stock_sale", amount: 1_830_412, status: "completed" }]);
    expect(depSum).toBe(1_830_412);
    const n = normalizeWalletTransaction({ type: "stock_sale", amount: 1_830_412, status: "completed" });
    expect(n.kind).toBe(TRANSACTION_KINDS.STOCK_SALE);
    expect(n.kindLabel).toBe("Bán cổ phiếu");
    expect(n.signedAmount).toBe(1_830_412);
  });
});

describe("cổ tức tiền mặt (type='dividend')", () => {
  it("là tiền VÀO, hiển thị 'Cổ tức'", async () => {
    const { normalizeWalletTransaction, TRANSACTION_KINDS } = await import("@/lib/transactionHistory.js");
    expect(computeWalletNet([{ type: "dividend", amount: 1_425_000, status: "completed" }]).depSum).toBe(1_425_000);
    const n = normalizeWalletTransaction({ type: "dividend", amount: 1_425_000, status: "completed" });
    expect(n.kind).toBe(TRANSACTION_KINDS.DIVIDEND);
    expect(n.kindLabel).toBe("Cổ tức");
    expect(n.signedAmount).toBe(1_425_000);
  });
});
