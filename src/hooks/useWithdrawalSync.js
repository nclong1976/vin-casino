import { useEffect, useRef } from "react";
import { subscribeSupabaseWalletTransactionsForUser } from "@/lib/supabaseDb";

/**
 * Lắng nghe realtime thay đổi trạng thái các giao dịch RÚT TIỀN (type =
 * "withdraw") của đúng 1 user qua Supabase Realtime (channel lọc theo
 * user_id - tương đương "room theo User ID" của Socket.io/SSE, do RLS +
 * filter Postgres đảm bảo).
 *
 * Không tự giữ state danh sách riêng - patch trực tiếp (in-place) vào state
 * đã có sẵn của trang gọi qua setTxs, để không tạo ra 2 nguồn sự thật cùng
 * đại diện cho lịch sử ví (trang vốn đã có fetchData() + subscribe riêng
 * cho nạp/đầu tư/giao dịch khác). onStatusChange(updatedRow) do nơi gọi tự
 * quyết định hiển thị Toast gì.
 */
export function useWithdrawalSync(userId, setTxs, onStatusChange) {
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    if (!userId || typeof setTxs !== "function") return;

    const unsubscribe = subscribeSupabaseWalletTransactionsForUser(userId, (payload) => {
      if (payload.eventType !== "UPDATE") return;
      const updated = payload.new;
      if (!updated || updated.type !== "withdraw") return;

      // In-place update đúng 1 record - KHÔNG fetch lại toàn bộ lịch sử
      setTxs((prev) => {
        const idx = prev.findIndex((t) => t.id === updated.id);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return next;
      });

      onStatusChangeRef.current?.(updated);
    });

    return unsubscribe;
  }, [userId, setTxs]);
}
