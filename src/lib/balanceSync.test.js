import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock mọi phụ thuộc bên ngoài (RTDB/Supabase thật, two-way sync) để test
// chỉ kiểm tra đúng LOGIC của balanceSync.js, không gọi mạng thật.
vi.mock("@/lib/rtdbSync", () => ({
  pushUserToRTDB: vi.fn(),
}));
vi.mock("@/lib/twoWaySync", () => ({
  syncUserToSupabase: vi.fn(),
}));

const incrementUserBalance = vi.fn();
const setUserBalanceAbsolute = vi.fn();
const getSupabaseUser = vi.fn();
vi.mock("@/lib/supabaseDb", () => ({
  incrementUserBalance: (...args) => incrementUserBalance(...args),
  setUserBalanceAbsolute: (...args) => setUserBalanceAbsolute(...args),
  getSupabaseUser: (...args) => getSupabaseUser(...args),
}));

// Import SAU khi mock đã khai báo (Vitest hoist vi.mock lên đầu file tự động).
const { adjustUserBalance, setAbsoluteUserBalanceAndDeposit, getFreshUserBalance } =
  await import("@/lib/balanceSync.js");

const USER_ID = "user-abc";

beforeEach(() => {
  localStorage.clear();
  incrementUserBalance.mockReset();
  setUserBalanceAbsolute.mockReset();
  getSupabaseUser.mockReset();
});

describe("adjustUserBalance — đường an toàn (RPC increment_user_balance)", () => {
  it("dùng đúng giá trị RPC trả về, ghi vào cache cục bộ kèm balance_version mới", async () => {
    incrementUserBalance.mockResolvedValue({ balance: 1_500_000, total_deposited: 1_000_000, balance_version: 7 });

    const result = await adjustUserBalance(USER_ID, 500_000, 0);

    expect(incrementUserBalance).toHaveBeenCalledWith(USER_ID, 500_000, 0);
    expect(result.balance).toBe(1_500_000);
    expect(result.balance_version).toBe(7);
    expect(getFreshUserBalance(USER_ID)).toBe(0); // getFreshUserBalance chỉ đọc base44_registered_users/base44_local_user, không phải nguồn RPC vừa ghi
  });
});

describe("adjustUserBalance — nhánh dự phòng khi RPC lỗi (đây là nơi đã xảy ra sự cố thật)", () => {
  it("KHÔNG được lấy 'số dư hiện tại' từ cache cục bộ đã hỏng - phải đọc từ Supabase trước", async () => {
    // Mô phỏng đúng kịch bản gây sự cố: cache cục bộ của thiết bị này đang
    // giữ 1 số khổng lồ từ sự cố cũ (localStorage base44_local_user), trong
    // khi Supabase (nguồn sự thật) đã được sửa đúng còn 100.000.000.
    localStorage.setItem(
      "base44_local_user",
      JSON.stringify({ id: USER_ID, balance: 999_999_999_999_999, total_deposited: 100_000_000 })
    );

    incrementUserBalance.mockResolvedValue(null); // RPC lỗi -> rơi vào nhánh dự phòng
    getSupabaseUser.mockResolvedValue({ balance: 100_000_000, total_deposited: 100_000_000 });

    const result = await adjustUserBalance(USER_ID, 50_000, 0);

    // Phải cộng 50.000 lên GỐC THẬT (100.000.000) từ Supabase, không phải lên
    // con số khổng lồ đang kẹt trong cache cục bộ.
    expect(result.balance).toBe(100_050_000);
    expect(result.balance).not.toBe(999_999_999_999_999 + 50_000);
  });

  it("chỉ lùi về cache cục bộ khi Supabase CŨNG không đọc được (bất đắc dĩ)", async () => {
    localStorage.setItem(
      "base44_local_user",
      JSON.stringify({ id: USER_ID, balance: 200_000, total_deposited: 200_000 })
    );

    incrementUserBalance.mockResolvedValue(null);
    getSupabaseUser.mockResolvedValue(null); // Supabase cũng lỗi

    const result = await adjustUserBalance(USER_ID, 10_000, 0);

    expect(result.balance).toBe(210_000); // 200.000 (cache) + 10.000
  });
});

describe("setAbsoluteUserBalanceAndDeposit", () => {
  it("đặt đúng số tuyệt đối admin nhập, không cộng dồn lên số cũ", async () => {
    localStorage.setItem(
      "base44_local_user",
      JSON.stringify({ id: USER_ID, balance: 5_000_000_000, total_deposited: 5_000_000_000 })
    );
    setUserBalanceAbsolute.mockResolvedValue({ balance: 0, total_deposited: 0, balance_version: 12 });

    const result = await setAbsoluteUserBalanceAndDeposit(USER_ID, 0, 0);

    expect(setUserBalanceAbsolute).toHaveBeenCalledWith(USER_ID, 0, 0);
    expect(result.balance).toBe(0);
    expect(result.total_deposited).toBe(0);
  });
});
