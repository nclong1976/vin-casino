import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

/**
 * Số tin nhắn CSKH admin đã gửi mà khách CHƯA xem (read_at rỗng) - dùng cho
 * badge trên nút CSKH ở BottomNav.jsx, cùng mẫu tính "unread" đã có ở
 * NotificationBell.jsx. RLS (messages_select_own_or_admin) đã tự giới hạn
 * khách chỉ thấy đúng tin nhắn của mình.
 */
export function useCskhUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setCount(0);
      return;
    }

    const recompute = (list) => {
      const items = Array.isArray(list) ? list : [];
      setCount(items.filter((m) => m.sender !== "user" && !m.read_at).length);
    };

    base44.entities.Message.filter({ conversation_id: user.id }).then(recompute).catch(() => {});
    const unsub = base44.entities.Message.subscribe((freshItems) => {
      if (!Array.isArray(freshItems)) return;
      recompute(freshItems.filter((m) => m.conversation_id === user.id));
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [user?.id]);

  return count;
}
