import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subscribeWithAutoReconnect } from "@/lib/subscribeWithAutoReconnect.js";

function createFakeChannel() {
  let cb = null;
  return {
    subscribe(callback) {
      cb = callback;
    },
    // Helper chỉ dùng trong test - mô phỏng thư viện Realtime tự bắn trạng thái.
    _emit(status, err) {
      cb?.(status, err);
    },
  };
}

function setupChannels() {
  const channels = [];
  const removeChannel = vi.fn().mockResolvedValue(undefined);
  const createChannel = vi.fn(() => {
    const ch = createFakeChannel();
    channels.push(ch);
    return ch;
  });
  return { channels, createChannel, removeChannel };
}

describe("subscribeWithAutoReconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tạo đúng 1 kênh lúc khởi động, chưa mất kết nối thì không tạo thêm", () => {
    const { channels, createChannel, removeChannel } = setupChannels();
    subscribeWithAutoReconnect(createChannel, removeChannel, "Test");
    expect(createChannel).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(1);
  });

  it("kết nối lại đúng theo backoff (2s * lần thử) khi kênh mất kết nối", () => {
    const { channels, createChannel, removeChannel } = setupChannels();
    subscribeWithAutoReconnect(createChannel, removeChannel, "Test");

    channels[0]._emit("CLOSED");
    expect(removeChannel).toHaveBeenCalledWith(channels[0]);
    // Chưa đủ 2000ms (delay của lần thử đầu) - chưa được tạo kênh mới.
    vi.advanceTimersByTime(1999);
    expect(createChannel).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(createChannel).toHaveBeenCalledTimes(2);
  });

  it("reset về lần thử 0 khi kết nối lại thành công (SUBSCRIBED)", () => {
    const { channels, createChannel, removeChannel } = setupChannels();
    subscribeWithAutoReconnect(createChannel, removeChannel, "Test");

    channels[0]._emit("CLOSED"); // attempt=1
    vi.advanceTimersByTime(2000); // -> tạo kênh 2
    channels[1]._emit("SUBSCRIBED"); // reset attempt về 0

    channels[1]._emit("CLOSED"); // lại là "lần thử 1" mới, không phải lần thử 2
    vi.advanceTimersByTime(1999);
    expect(createChannel).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1); // đúng 2000ms (delay của lần thử 1, không phải 4000ms của lần thử 2)
    expect(createChannel).toHaveBeenCalledTimes(3);
  });

  it("KHÔNG sinh thêm kênh mới hay tăng vô hạn khi 1 kênh CŨ tự bắn lại sự kiện hàng nghìn lần (đúng lỗi RangeError đã xảy ra thật trên production)", () => {
    const { channels, createChannel, removeChannel } = setupChannels();
    subscribeWithAutoReconnect(createChannel, removeChannel, "Test");

    channels[0]._emit("CLOSED"); // attempt=1, hẹn giờ kênh mới sau 2000ms
    vi.advanceTimersByTime(2000);
    expect(createChannel).toHaveBeenCalledTimes(2); // kênh mới (channels[1]) đã thay thế channels[0]

    // Mô phỏng ĐÚNG lỗi thật: kênh CŨ (channels[0], đã bị thay) tiếp tục tự
    // bắn CLOSED rất nhiều lần (client Realtime tự retry ở tầng socket, độc
    // lập và nhanh hơn nhiều so với backoff/removeChannel() ở đây).
    for (let i = 0; i < 5000; i++) {
      channels[0]._emit("CLOSED");
    }

    // Generation guard phải chặn TOÀN BỘ - không kênh mới nào được tạo thêm,
    // không có timer nào khác được hẹn từ những sự kiện muộn này.
    expect(createChannel).toHaveBeenCalledTimes(2);

    // Kênh mới nhất (channels[1]) mất kết nối tiếp thì vẫn phải hoạt động
    // bình thường - đây là lần thử thứ 2 thật sự (delay 4000ms).
    channels[1]._emit("CLOSED");
    vi.advanceTimersByTime(3999);
    expect(createChannel).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(createChannel).toHaveBeenCalledTimes(3);
  });

  it("trần backoff 30 phút/lần sau 20 lần thử liên tiếp", () => {
    const { channels, createChannel, removeChannel } = setupChannels();
    subscribeWithAutoReconnect(createChannel, removeChannel, "Test");

    // Đẩy tới lần thử thứ 21 (attempt > 20) bằng cách luôn để kênh mới nhất
    // mất kết nối ngay khi vừa tạo.
    for (let i = 0; i < 20; i++) {
      const idx = channels.length - 1;
      channels[idx]._emit("CLOSED");
      vi.runOnlyPendingTimers();
    }
    expect(createChannel).toHaveBeenCalledTimes(21);

    const before = createChannel.mock.calls.length;
    channels[channels.length - 1]._emit("CLOSED"); // attempt=21 -> delay=1800000ms
    vi.advanceTimersByTime(1799999);
    expect(createChannel).toHaveBeenCalledTimes(before);
    vi.advanceTimersByTime(1);
    expect(createChannel).toHaveBeenCalledTimes(before + 1);
  });
});
