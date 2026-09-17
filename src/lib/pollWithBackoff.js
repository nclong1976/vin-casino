/**
 * pollWithBackoff — lưới an toàn dạng poll (chạy song song Realtime, phòng
 * khi kênh Realtime rớt) nhưng KHÔNG dùng setInterval cố định như trước.
 *
 * Vấn đề với setInterval cố định (mẫu cũ dùng ở UsersTab.jsx/MessagesTab.jsx):
 * nếu backend đang gặp sự cố thật (vd. lỗi 522 - gateway timeout) khiến 1
 * lượt gọi thất bại, setInterval vẫn cứ đều đặn gọi lại đúng câu truy vấn
 * TỐN KÉM đó mỗi 20-30 giây bất kể đã thất bại bao nhiêu lần liên tiếp -
 * hàng chục phiên admin/người dùng đang mở app cùng lúc đều làm y hệt vậy,
 * cộng dồn thành một đợt dội lại liên tục vào đúng lúc backend đang yếu
 * nhất (thundering herd), có thể khiến sự cố kéo dài thêm thay vì tự phục
 * hồi. Hàm dưới đây thay bằng chuỗi setTimeout tự lên lịch lại: thất bại
 * liên tiếp càng nhiều, khoảng chờ trước lần thử kế tiếp càng giãn ra theo
 * cấp số nhân (2s → 4s → 8s... tới trần maxMs) - hỏng dài thì tự giãn ra
 * nhường thời gian cho backend hồi phục, còn khi thành công thì trở lại
 * nhịp bình thường (baseMs) ngay lập tức.
 *
 * `fn` PHẢI throw/reject khi thất bại thật (không được tự nuốt lỗi rồi trả
 * về mảng rỗng) - nếu không, hàm này không có cách nào phân biệt "thất bại"
 * với "thành công nhưng dữ liệu rỗng", backoff sẽ không bao giờ kích hoạt.
 *
 * @param {() => Promise<any>} fn - hàm tải dữ liệu, throw khi thất bại.
 * @param {{
 *   baseMs?: number,      // nhịp poll bình thường khi không có lỗi
 *   maxMs?: number,       // trần giãn cách tối đa
 *   onResult?: (data: any) => void,  // gọi khi fn() thành công
 *   onError?: (err: any, consecutiveFailures: number) => void, // gọi khi fn() thất bại
 * }} [options]
 * @returns {() => void} hàm dừng - gọi trong cleanup của useEffect.
 */
export function pollWithBackoff(fn, { baseMs = 20000, maxMs = 300000, onResult, onError } = {}) {
  let stopped = false;
  let timer = null;
  let consecutiveFailures = 0;

  const scheduleNext = (delayMs) => {
    if (stopped) return;
    timer = setTimeout(tick, delayMs);
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const data = await fn();
      if (stopped) return;
      consecutiveFailures = 0;
      if (typeof onResult === "function") onResult(data);
      scheduleNext(baseMs);
    } catch (err) {
      if (stopped) return;
      consecutiveFailures += 1;
      if (typeof onError === "function") onError(err, consecutiveFailures);
      const delay = Math.min(maxMs, baseMs * Math.pow(2, consecutiveFailures));
      scheduleNext(delay);
    }
  };

  // Lượt đầu tiên chạy ngay (giống setInterval(fn, ms) gọi lần đầu sau ms
  // - nhưng nơi gọi ở đây thường đã tự gọi fn() 1 lần lúc mount rồi nên
  // scheduleNext(baseMs) là đủ, không gọi tick() ngay để tránh tải trùng
  // lượt mount ban đầu).
  scheduleNext(baseMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
