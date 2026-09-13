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
