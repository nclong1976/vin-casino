import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { sessionAt } from "@/lib/stockMarket";

const DEFAULT_CONFIG = { fee_rate: 0.0015, sell_tax_rate: 0.001, price_band_pct: 7, lot_size: 100 };

/**
 * Bảng giá (stock_quotes, realtime), cấu hình phí/biên độ và phiên giao dịch
 * hiện tại (tính lại mỗi 15 giây theo giờ VN + lịch nghỉ).
 * Trả { quotes: { [symbol]: quote }, config, session, calendar, ready }.
 */
export function useStockMarket() {
  const [quotes, setQuotes] = useState({});
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [calendar, setCalendar] = useState({});
  const [session, setSession] = useState(() => sessionAt());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadQuotes = () =>
      supabase
        .from("stock_quotes")
        .select("*")
        .then(({ data }) => {
          if (!alive || !data) return;
          setQuotes(Object.fromEntries(data.map((q) => [q.symbol, q])));
          setReady(true);
        });

    loadQuotes();
    supabase
      .from("stock_config")
      .select("fee_rate, sell_tax_rate, price_band_pct, lot_size")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => alive && data && setConfig({ ...DEFAULT_CONFIG, ...data }));
    supabase
      .from("stock_market_calendar")
      .select("date, is_trading_day")
      .then(({ data }) => alive && data && setCalendar(Object.fromEntries(data.map((d) => [d.date, d.is_trading_day]))));

    const channel = supabase
      .channel("stock_quotes_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_quotes" }, (payload) => {
        const row = payload.new;
        if (row?.symbol) setQuotes((prev) => ({ ...prev, [row.symbol]: row }));
        else loadQuotes();
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const tick = () => setSession(sessionAt(new Date(), calendar));
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [calendar]);

  return { quotes, config, session, calendar, ready };
}
