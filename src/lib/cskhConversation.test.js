import { describe, it, expect, beforeEach, vi } from "vitest";
import { getActiveConversationId, recordLeftSupport, CSKH_AWAY_THRESHOLD_MS } from "@/lib/cskhConversation.js";

const USER_ID = "user-abc";

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("getActiveConversationId — lần đầu tiên (chưa từng lưu gì)", () => {
  it("trả về đúng userId, tương thích dữ liệu cũ (conversation_id = user.id)", () => {
    expect(getActiveConversationId(USER_ID)).toBe(USER_ID);
  });

  it("trả về null nếu chưa có userId (chưa đăng nhập xong)", () => {
    expect(getActiveConversationId(null)).toBeNull();
    expect(getActiveConversationId(undefined)).toBeNull();
  });
});

describe("getActiveConversationId — chưa từng rời trang", () => {
  it("giữ nguyên conversation_id đang có, không sinh mới", () => {
    const first = getActiveConversationId(USER_ID);
    const second = getActiveConversationId(USER_ID);
    expect(second).toBe(first);
  });
});

describe("getActiveConversationId — quay lại TRƯỚC 10 phút", () => {
  it("vẫn giữ nguyên conversation_id cũ", () => {
    const original = getActiveConversationId(USER_ID);
    recordLeftSupport(USER_ID);

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + CSKH_AWAY_THRESHOLD_MS - 1000);
    expect(getActiveConversationId(USER_ID)).toBe(original);
  });
});

describe("getActiveConversationId — quay lại SAU >= 10 phút", () => {
  it("sinh conversation_id MỚI, khác hẳn id cũ", () => {
    const original = getActiveConversationId(USER_ID);
    recordLeftSupport(USER_ID);

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + CSKH_AWAY_THRESHOLD_MS + 1000);
    const fresh = getActiveConversationId(USER_ID);

    expect(fresh).not.toBe(original);
    expect(fresh).toBeTruthy();
  });

  it("sau khi đã chuyển sang hội thoại mới, gọi lại ngay không sinh thêm cái mới nữa", () => {
    getActiveConversationId(USER_ID);
    recordLeftSupport(USER_ID);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + CSKH_AWAY_THRESHOLD_MS + 1000);

    const fresh = getActiveConversationId(USER_ID);
    const again = getActiveConversationId(USER_ID);
    expect(again).toBe(fresh);
  });
});

describe("getActiveConversationId — cách ly theo từng userId", () => {
  it("2 user khác nhau không ảnh hưởng lẫn nhau", () => {
    const idA = getActiveConversationId("user-a");
    const idB = getActiveConversationId("user-b");
    expect(idA).toBe("user-a");
    expect(idB).toBe("user-b");
  });
});
