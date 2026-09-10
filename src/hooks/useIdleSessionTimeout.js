import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "touchstart", "scroll"];

/**
 * Phát cảnh báo rồi "hết hạn" khi không có tương tác trong timeoutMs (tính
 * từ lần hoạt động gần nhất) - CHỈ đếm giờ khi tab đang visible, tab ẩn thì
 * tạm dừng đồng hồ, quay lại reset (không tính thời gian rời tab là "không
 * hoạt động"). Thuần UI cục bộ - không gọi API/đổi dữ liệu gì (xem lý do
 * trong plan: rảnh tay không đồng nghĩa vấn đề đã giải quyết, không nên tự
 * đổi trạng thái vé CSKH).
 *
 * Sau khi onTimeout() đã gọi, mọi hoạt động tiếp theo KHÔNG tự reset ngầm -
 * nơi gọi phải chủ động gọi resume() (vd. người dùng bấm "Tiếp tục trò
 * chuyện" trên overlay) mới tính lại giờ, để tránh 1 lần vuốt màn hình vô ý
 * lặng lẽ xoá mất trạng thái "đã hết hạn" đang hiển thị.
 */
export function useIdleSessionTimeout({ timeoutMs, warningMs, onWarning, onTimeout, enabled = true }) {
  const firedTimeoutRef = useRef(false);
  const resetRef = useRef(() => {});

  useEffect(() => {
    if (!enabled || !timeoutMs) return;

    let warnTimer = null;
    let timeoutTimer = null;

    const clearTimers = () => {
      clearTimeout(warnTimer);
      clearTimeout(timeoutTimer);
    };

    const reset = () => {
      if (document.visibilityState !== "visible") return;
      clearTimers();
      firedTimeoutRef.current = false;
      if (warningMs && warningMs < timeoutMs) {
        warnTimer = setTimeout(() => {
          if (typeof onWarning === "function") onWarning();
        }, timeoutMs - warningMs);
      }
      timeoutTimer = setTimeout(() => {
        firedTimeoutRef.current = true;
        if (typeof onTimeout === "function") onTimeout();
      }, timeoutMs);
    };
    resetRef.current = reset;

    const handleActivity = () => {
      if (firedTimeoutRef.current) return;
      reset();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") reset();
      else clearTimers();
    };

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibility);
    reset();

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, timeoutMs, warningMs, onWarning, onTimeout]);

  const resume = () => {
    firedTimeoutRef.current = false;
    resetRef.current();
  };

  return { resume };
}
