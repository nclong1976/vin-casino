import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Danh sách mã theo dõi của người dùng (stock_watchlist, RLS chỉ của mình). */
export function useWatchlist(userId) {
  const [symbols, setSymbols] = useState(() => new Set());

  useEffect(() => {
    if (!userId) {
      setSymbols(new Set());
      return undefined;
    }
    let alive = true;
    supabase
      .from("stock_watchlist")
      .select("symbol")
      .eq("user_id", userId)
      .then(({ data }) => alive && setSymbols(new Set((data || []).map((r) => r.symbol))));
    return () => {
      alive = false;
    };
  }, [userId]);

  const toggle = useCallback(
    async (symbol) => {
      if (!userId || !symbol) return false;
      const watched = symbols.has(symbol);
      // Cập nhật lạc quan, lỗi thì hoàn tác.
      setSymbols((prev) => {
        const next = new Set(prev);
        if (watched) next.delete(symbol);
        else next.add(symbol);
        return next;
      });
      const { error } = watched
        ? await supabase.from("stock_watchlist").delete().eq("user_id", userId).eq("symbol", symbol)
        : await supabase.from("stock_watchlist").insert({ user_id: userId, symbol });
      if (error) {
        setSymbols((prev) => {
          const next = new Set(prev);
          if (watched) next.add(symbol);
          else next.delete(symbol);
          return next;
        });
        return null;
      }
      return !watched;
    },
    [userId, symbols]
  );

  return { watched: symbols, toggle };
}
