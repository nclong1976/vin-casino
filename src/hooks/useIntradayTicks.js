import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { vnClock } from "@/lib/stockMarket";
import { vnTime } from "@/lib/stockChart";

/**
 * Các lần đổi giá trong ngày (giờ VN) của mọi mã, cho biểu đồ nhỏ trên thẻ
 * cổ phiếu. Tải lại mỗi phút; giá hiện tại lấy từ bảng giá realtime.
 * Trả { [symbol]: [{ price, ts }] } và dateStr của ngày đang xem.
 */
export function useIntradayTicks() {
  const [dateStr, setDateStr] = useState(() => vnClock().date);
  const [ticks, setTicks] = useState({});

  useEffect(() => {
    let alive = true;
    const load = () => {
      const day = vnClock().date;
      supabase
        .from("stock_price_ticks")
        .select("symbol, price, ts")
        .gte("ts", new Date(vnTime(day, 0)).toISOString())
        .order("ts", { ascending: true })
        .limit(5000)
        .then(({ data }) => {
          if (!alive || !data) return;
          const by = {};
          data.forEach((t) => (by[t.symbol] ||= []).push(t));
          setTicks(by);
          setDateStr(day);
        });
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return { ticks, dateStr };
}
