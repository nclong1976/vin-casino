import { describe, it, expect, vi, beforeEach } from "vitest";

const txFilter = vi.fn();
const messageCreate = vi.fn();
const resolveProjectMaturityPayout = vi.fn();

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      Transaction: { filter: (...a) => txFilter(...a) },
      Message: { create: (...a) => messageCreate(...a) },
    },
  },
}));
vi.mock("@/lib/supabaseDb", () => ({
  resolveProjectMaturityPayout: (...a) => resolveProjectMaturityPayout(...a),
}));

const { runDailyYieldAndMaturityCheck } = await import("@/lib/dailyYieldEngine.js");

const USER = { id: "user-1", is_locked: false };

beforeEach(() => {
  vi.clearAllMocks();
  messageCreate.mockResolvedValue({});
  resolveProjectMaturityPayout.mockResolvedValue({
    paid: true,
    payout_amount: 1_050_000,
    project_title: "Quỹ test",
    balance: 1_050_000,
    balance_version: 2,
  });
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
    expect(txFilter).not.toHaveBeenCalled();
    expect(resolveProjectMaturityPayout).not.toHaveBeenCalled();
  });
});

describe("runDailyYieldAndMaturityCheck — trả đáo hạn dự án", () => {
  // Việc XÁC THỰC đáo hạn + TÍNH tiền + CỘNG tiền giờ chạy hoàn toàn trên
  // server (RPC resolve_project_maturity_payout, đã tự kiểm tra lại bằng
  // đồng hồ/dữ liệu server, đã test trực tiếp trên Postgres) - các test ở
  // đây chỉ xác nhận đúng tầng JS: gọi RPC đúng lúc (đã lọc cục bộ đủ hạn
  // chưa) và xử lý đúng kết quả RPC trả về, KHÔNG còn test lại logic chống
  // trả trùng (đã chuyển hẳn vào RPC, khoá dòng FOR UPDATE).

  it("gọi RPC cho khoản đã đủ kỳ hạn, chưa từng trả, và báo tin nhắn khi RPC xác nhận đã trả", async () => {
    txFilter.mockResolvedValue([maturedTx()]);

    await runDailyYieldAndMaturityCheck(USER);

    expect(resolveProjectMaturityPayout).toHaveBeenCalledWith("tx-1");
    expect(messageCreate).toHaveBeenCalledTimes(1);
  });

  it("KHÔNG gọi RPC nếu chưa đủ thời gian đáo hạn (lọc cục bộ)", async () => {
    txFilter.mockResolvedValue([
      maturedTx({ created_date: new Date().toISOString(), duration_days: 30 }),
    ]);

    await runDailyYieldAndMaturityCheck(USER);

    expect(resolveProjectMaturityPayout).not.toHaveBeenCalled();
  });

  it("KHÔNG gọi RPC nếu payout_status đã là 'paid' (lọc cục bộ)", async () => {
    txFilter.mockResolvedValue([maturedTx({ payout_status: "paid" })]);

    await runDailyYieldAndMaturityCheck(USER);

    expect(resolveProjectMaturityPayout).not.toHaveBeenCalled();
  });

  it("không báo tin nhắn nếu RPC xác nhận đã trả trước đó rồi (race condition - server là nguồn sự thật cuối cùng)", async () => {
    txFilter.mockResolvedValue([maturedTx()]);
    resolveProjectMaturityPayout.mockResolvedValue({ paid: false, reason: "already_paid" });

    await runDailyYieldAndMaturityCheck(USER);

    expect(resolveProjectMaturityPayout).toHaveBeenCalledWith("tx-1");
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it("không báo tin nhắn nếu RPC lỗi (mất mạng...)", async () => {
    txFilter.mockResolvedValue([maturedTx()]);
    resolveProjectMaturityPayout.mockResolvedValue(null);

    await runDailyYieldAndMaturityCheck(USER);

    expect(messageCreate).not.toHaveBeenCalled();
  });
});
