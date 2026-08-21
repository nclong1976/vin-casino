import { describe, it, expect, vi, beforeEach } from "vitest";

const walletFilter = vi.fn();
const walletCreate = vi.fn();
const txFilter = vi.fn();
const txUpdate = vi.fn();
const messageCreate = vi.fn();
const adjustUserBalance = vi.fn();

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      WalletTransaction: { filter: (...a) => walletFilter(...a), create: (...a) => walletCreate(...a) },
      Transaction: { filter: (...a) => txFilter(...a), update: (...a) => txUpdate(...a) },
      Message: { create: (...a) => messageCreate(...a) },
    },
  },
}));
vi.mock("@/lib/balanceSync", () => ({
  adjustUserBalance: (...a) => adjustUserBalance(...a),
}));

const { runDailyYieldAndMaturityCheck } = await import("@/lib/dailyYieldEngine.js");

const USER = { id: "user-1", is_locked: false };

beforeEach(() => {
  vi.clearAllMocks();
  walletCreate.mockResolvedValue({ id: "wtx-new" });
  txUpdate.mockResolvedValue({});
  messageCreate.mockResolvedValue({});
  adjustUserBalance.mockResolvedValue({ balance: 0, total_deposited: 0, balance_version: 1 });
});

function maturedTx(overrides = {}) {
  return {
    id: "tx-1",
    project_title: "Quỹ test",
    amount: 1_000_000,
    profit: 50_000,
    total: 1_050_000,
    duration_days: 1,
    // Tạo cách đây 2 ngày -> chắc chắn đã đáo hạn (duration 1 ngày)
    created_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    payout_status: null,
    status: "completed",
    ...overrides,
  };
}

describe("runDailyYieldAndMaturityCheck — tài khoản bị khóa", () => {
  it("không gọi bất kỳ API nào nếu is_locked = true", async () => {
    await runDailyYieldAndMaturityCheck({ ...USER, is_locked: true });
    expect(walletFilter).not.toHaveBeenCalled();
    expect(txFilter).not.toHaveBeenCalled();
    expect(adjustUserBalance).not.toHaveBeenCalled();
  });
});

describe("runDailyYieldAndMaturityCheck — trả đáo hạn dự án", () => {
  it("trả đúng 1 lần cho khoản đầu tư đã đủ kỳ hạn, chưa từng trả", async () => {
    walletFilter.mockResolvedValue([]);
    txFilter.mockResolvedValue([maturedTx()]);

    await runDailyYieldAndMaturityCheck(USER);

    expect(txUpdate).toHaveBeenCalledWith("tx-1", { status: "completed_payout", payout_status: "paid" });
    expect(walletCreate).toHaveBeenCalledTimes(1);
    expect(adjustUserBalance).toHaveBeenCalledWith(USER.id, 1_050_000, 0);
  });

  it("KHÔNG trả nếu chưa đủ thời gian đáo hạn", async () => {
    walletFilter.mockResolvedValue([]);
    txFilter.mockResolvedValue([
      maturedTx({ created_date: new Date().toISOString(), duration_days: 30 }),
    ]);

    await runDailyYieldAndMaturityCheck(USER);

    expect(adjustUserBalance).not.toHaveBeenCalled();
  });

  it("KHÔNG trả lại nếu payout_status đã là 'paid' (lớp bảo vệ 1)", async () => {
    walletFilter.mockResolvedValue([]);
    txFilter.mockResolvedValue([maturedTx({ payout_status: "paid" })]);

    await runDailyYieldAndMaturityCheck(USER);

    expect(adjustUserBalance).not.toHaveBeenCalled();
  });

  it("KHÔNG trả lại nếu đã có WalletTransaction tham chiếu [ref:tx.id], dù payout_status ghi thất bại (lớp bảo vệ 2 — chính kịch bản đã gây sự cố thật)", async () => {
    // Mô phỏng: lần chạy trước đã tạo WalletTransaction thành công (đã có
    // dấu vết [ref:tx-1]) nhưng Transaction.update() đánh dấu "paid" bị lỗi
    // (payout_status vẫn null) - nếu chỉ dựa vào lớp bảo vệ 1, hệ thống sẽ
    // trả lại khoản này mỗi 30 giây.
    walletFilter.mockResolvedValue([
      {
        category: "Đáo Hạn Dự Án",
        note: 'Đáo hạn dự án "Quỹ test" - Hoàn vốn & trả lãi [ref:tx-1]',
      },
    ]);
    txFilter.mockResolvedValue([maturedTx({ payout_status: null, status: "completed" })]);

    await runDailyYieldAndMaturityCheck(USER);

    expect(walletCreate).not.toHaveBeenCalled();
    expect(adjustUserBalance).not.toHaveBeenCalled();
  });
});
