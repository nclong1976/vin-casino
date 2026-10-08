import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const { tierKey, tierProgress, offerState, claimStatus } = await import("./welfare");

describe("tierKey", () => {
  it("khớp tên hạng tiếng Anh / tiếng Việt", () => {
    expect(tierKey("Gold")).toBe("GOLD");
    expect(tierKey("VIP Bạch Kim")).toBe("PLATINUM");
    expect(tierKey("diamond")).toBe("DIAMOND");
    expect(tierKey("Member")).toBe("MEMBER");
    expect(tierKey(null)).toBe("MEMBER");
  });
});

describe("tierProgress", () => {
  it("tính phần trăm và số còn thiếu tới hạng kế", () => {
    expect(tierProgress("Gold", 2e9)).toEqual({ next: "PLATINUM", need: 1e9, pct: 50 });
    expect(tierProgress("Member", 0)).toEqual({ next: "GOLD", need: 1e9, pct: 0 });
  });

  it("nạp vượt mốc nhưng chưa được Admin lên hạng: 100%, còn thiếu 0", () => {
    expect(tierProgress("Gold", 5e9)).toEqual({ next: "PLATINUM", need: 0, pct: 100 });
  });

  it("hạng cao nhất không có hạng kế", () => {
    expect(tierProgress("Diamond", 1)).toEqual({ next: null, need: 0, pct: 100 });
  });
});

describe("offerState", () => {
  const base = { eligible: true, remaining: null, monthly_limit: 2, my_month_count: 0 };
  it("theo thứ tự: khoá hạng → hết suất → hết lượt → nhận được", () => {
    expect(offerState({ ...base, eligible: false, remaining: 0 })).toBe("locked");
    expect(offerState({ ...base, remaining: 0 })).toBe("soldout");
    expect(offerState({ ...base, my_month_count: 2 })).toBe("limit");
    expect(offerState(base)).toBe("available");
    expect(offerState({ ...base, monthly_limit: null, my_month_count: 99 })).toBe("available");
  });
});

describe("claimStatus", () => {
  const now = new Date("2026-10-08T00:00:00Z");
  it("đã dùng / hết hạn / còn hạn", () => {
    expect(claimStatus({ used_at: "2026-10-01", expires_at: "2026-12-01" }, now)).toBe("used");
    expect(claimStatus({ expires_at: "2026-10-07T00:00:00Z" }, now)).toBe("expired");
    expect(claimStatus({ expires_at: "2026-10-09T00:00:00Z" }, now)).toBe("active");
  });
});
