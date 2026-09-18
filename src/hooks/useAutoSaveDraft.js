import { useEffect, useRef, useCallback } from "react";

const DEBOUNCE_MS = 500;

// Lưu nháp (draft) văn bản đang soạn dở vào localStorage, khôi phục lại khi
// quay về đúng "storageKey" đó (vd admin mở lại đúng hội thoại đang gõ dở) -
// tránh mất nội dung khi lỡ đổi tab/hội thoại hoặc đóng nhầm trình duyệt.
// Đổi sang storageKey KHÁC luôn nạp lại đúng nháp của storageKey đó (rỗng
// nếu chưa từng lưu) để nháp không bị "dính" chéo giữa các hội thoại.
export function useAutoSaveDraft(storageKey, value, onRestore) {
  const timerRef = useRef(null);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    if (!storageKey) return;
    let saved = "";
    try {
      saved = localStorage.getItem(storageKey) || "";
    } catch {}
    onRestoreRef.current(saved);
    // Chỉ nạp lại khi ĐỔI storageKey, không phải mỗi khi value đổi.
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        if (value && value.trim()) {
          localStorage.setItem(storageKey, value);
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {}
    }, DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [storageKey, value]);

  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!storageKey) return;
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);

  return { clearDraft };
}
