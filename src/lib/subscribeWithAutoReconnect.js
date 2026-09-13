/**
 * Lắng nghe 1 kênh Realtime và tự kết nối lại khi mất kết nối
 * (CLOSED/CHANNEL_ERROR/TIMED_OUT), backoff tăng dần (2s * lần thử, trần 5
 * phút trong ~1 giờ đầu, sau đó giãn hẳn ra 30 phút/lần nếu attempt > 20).
 *
 * Tách riêng khỏi server.ts (thay vì để inline) để unit test được trực tiếp
 * bất biến quan trọng nhất: 1 kênh CŨ (đã bị thay bằng kênh mới) tự bắn lại
 * sự kiện bao nhiêu lần cũng KHÔNG được phép sinh thêm kênh mới hay tăng số
 * lần thử. Đây chính là lỗi đã xảy ra thật trên production - removeChannel()
 * chạy bất đồng bộ, không đảm bảo gỡ kênh cũ khỏi socket kịp thời; client
 * Realtime tự retry ở tầng SOCKET (không phải từng kênh) độc lập với backoff
 * ở đây và nhanh hơn nhiều, nên 1 kênh cũ "tưởng đã bỏ" vẫn tiếp tục tự bắn
 * CLOSED/CHANNEL_ERROR mỗi lần socket retry nội bộ. Mỗi lần đó code cũ (không
 * có generation guard) lại tạo thêm 1 kênh mới - số kênh cũ chưa kịp gỡ dồn
 * lại theo thời gian, mỗi vòng socket retry bắn callback của TẤT CẢ kênh cũ
 * cùng lúc, khiến số "lần thử" tăng phi tuyến tính (hàng nghìn lần chỉ trong
 * vài chục giây), cuối cùng vỡ ngăn xếp: "RangeError: Maximum call stack
 * size exceeded".
 *
 * @param {() => { subscribe: (cb: (status: string, err?: any) => void) => void }} createChannel
 * @param {(channel: any) => unknown} removeChannel
 * @param {string} label
 */
export function subscribeWithAutoReconnect(createChannel, removeChannel, label) {
  let attempt = 0;
  // "generation" chặn hiệu ứng dây chuyền: mỗi vòng connect() có 1 số thế hệ
  // riêng - MỌI sự kiện đến từ 1 kênh không phải thế hệ mới nhất đều bị bỏ
  // qua ngay, nên dù kênh cũ có tự bắn lại bao nhiêu lần cũng không sinh
  // thêm kênh mới hay tăng "attempt". Chỉ đúng 1 chuỗi kết nối lại được phép
  // hoạt động tại một thời điểm.
  let generation = 0;
  const connect = () => {
    const myGeneration = ++generation;
    const channel = createChannel();
    // Supabase Realtime truyền THÊM tham số thứ 2 (err) cho callback này khi
    // status là CHANNEL_ERROR/TIMED_OUT - chứa lý do THẬT của việc mất kết
    // nối (lỗi WebSocket, xác thực, rate limit...).
    channel.subscribe((status, err) => {
      if (myGeneration !== generation) return; // Kênh cũ đã bị thay - bỏ qua mọi sự kiện muộn của nó.
      if (status === "SUBSCRIBED") {
        if (attempt > 0) console.log(`[Telegram] ${label}: đã kết nối lại thành công.`);
        attempt = 0;
        return;
      }
      if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        attempt += 1;
        // Trần backoff 5 phút trong ~1 giờ đầu, sau đó giãn hẳn ra 30 phút/lần
        // nếu vẫn chưa kết nối lại được (attempt > 20) - nếu Realtime mất kết
        // nối THẬT SỰ kéo dài (sự cố hạ tầng/mạng, không phải chập chờn tạm
        // thời), tạo kênh mới liên tục dù đã giãn cách vẫn khiến số kênh cũ
        // tích tụ không giới hạn theo thời gian. CHỈ log 1 trong số các lần
        // thử (vài lần đầu + rải rác về sau), không log mọi lần.
        const delayMs = attempt > 20 ? 1800000 : Math.min(300000, 2000 * attempt);
        if (attempt <= 3 || attempt % 20 === 0) {
          const reason = err?.message || err?.toString?.() || (err ? JSON.stringify(err) : null);
          console.warn(
            `[Telegram] ${label} mất kết nối (${status}, lần thử ${attempt}${reason ? `, lý do: ${reason}` : ""}) - thử kết nối lại sau ${delayMs}ms`
          );
        }
        // removeChannel() trả về 1 Promise (không phải chạy đồng bộ) - CHỈ bọc
        // try/catch (như trước đây) không bắt được rejection của chính Promise
        // đó, dẫn tới "unhandledRejection" nếu nó reject. Bọc thêm .catch() để
        // không bao giờ có promise nào bị bỏ rơi ở đây.
        try {
          Promise.resolve(removeChannel(channel)).catch(() => {});
        } catch (e) {}
        setTimeout(() => {
          if (myGeneration === generation) connect();
        }, delayMs);
      }
    });
  };
  connect();
}
