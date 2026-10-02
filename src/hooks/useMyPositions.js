import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Nắm giữ của người dùng hiện tại theo mã (realtime): { [symbol]: position }. */
export function useMyPositions(userId) {
  const [positions, setPositions] = useState({});

  useEffect(() => {
    if (!userId) {
      setPositions({});
      return undefined;
    }
    let alive = true;
    const load = () =>
      supabase
        .from("stock_positions")
        .select("symbol, qty, qty_pending, qty_hold, total_cost")
        .eq("user_id", userId)
        .then(({ data }) => alive && setPositions(Object.fromEntries((data || []).map((p) => [p.symbol, p]))));
    load();
    const channel = supabase
      .channel(`stock_positions_page_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_positions", filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return positions;
}

/** Số CP bán được = tổng - chờ về T+2 - đang giữ cho lệnh bán. */
export function sellableOf(position) {
  if (!position) return 0;
  return Math.max(0, (Number(position.qty) || 0) - (Number(position.qty_pending) || 0) - (Number(position.qty_hold) || 0));
}
