import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const PEER_EXPIRE_MS = 3000;
const BROADCAST_THROTTLE_MS = 1500;

/**
 * Typing indicator theo từng hội thoại CSKH - dùng kênh Supabase Realtime
 * BROADCAST riêng (KHÁC `postgres_changes` và KHÁC `presence.js` hiện có -
 * presence.js là danh sách online TOÀN SITE, không theo hội thoại). Thuần
 * ephemeral, không cần cột DB nào. Dùng chung cho cả Support.jsx (selfRole
 * "user") và MessagesTab.jsx (selfRole "admin").
 *
 * Tự hết "đang nhập" sau PEER_EXPIRE_MS không có broadcast mới - an toàn nếu
 * tín hiệu "ngừng gõ" của đối phương bị rớt mạng.
 */
export function useTypingIndicator(conversationId, selfRole) {
  const [peerTyping, setPeerTyping] = useState(false);
  const channelRef = useRef(null);
  const lastBroadcastRef = useRef(0);
  const peerExpireTimerRef = useRef(null);

  useEffect(() => {
    setPeerTyping(false);
    if (!conversationId) return;

    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (!payload || payload.role === selfRole) return;
      setPeerTyping(true);
      clearTimeout(peerExpireTimerRef.current);
      peerExpireTimerRef.current = setTimeout(() => setPeerTyping(false), PEER_EXPIRE_MS);
    });
    channel.subscribe();
    channelRef.current = channel;

    return () => {
      clearTimeout(peerExpireTimerRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
      setPeerTyping(false);
    };
  }, [conversationId, selfRole]);

  const notifyTyping = () => {
    const now = Date.now();
    if (now - lastBroadcastRef.current < BROADCAST_THROTTLE_MS) return;
    lastBroadcastRef.current = now;
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { role: selfRole } });
  };

  return { peerTyping, notifyTyping };
}
