import React, { useEffect, useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { summarizePositions } from "@/lib/stockOrders";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const pct = (n) => `${n >= 0 ? "+" : ""}${(Number(n) || 0).toFixed(2)}%`;
const tone = (n) => (n > 0 ? "#10b981" : n < 0 ? "#ef4444" : "#d4af37");

/**
 * Danh mục nắm giữ: stock_positions (RLS chỉ trả dòng của người dùng), định
 * giá theo bảng giá realtime. CP mua chưa tới T+2 hiện "chờ về".
 * compact = thẻ tóm tắt trên tab Thị trường (ẩn khi chưa có cổ phần).
 */
export default function MyHoldings({ quotes, compact = false, onBuy }) {
  const { user } = useAuth();
  const [positions, setPositions] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setPositions([]);
      return undefined;
    }
    let alive = true;
    const load = () =>
      supabase
        .from("stock_positions")
        .select("symbol, project_id, qty, qty_pending, total_cost")
        .eq("user_id", uid)
        .then(({ data }) => {
          if (!alive) return;
          setPositions(data || []);
          setLoaded(true);
        });
    load();
    const channel = supabase
      .channel(`stock_positions_${uid}${compact ? "_c" : ""}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_positions", filter: `user_id=eq.${uid}` }, () => load())
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id, compact]);

  const summary = useMemo(() => {
    const prices = {};
    Object.values(quotes || {}).forEach((q) => {
      if (Number(q.last_price) > 0) prices[q.symbol] = Number(q.last_price);
    });
    return summarizePositions(positions, prices);
  }, [positions, quotes]);

  if (summary.rows.length === 0) {
    if (compact || !loaded) return null;
    return (
      <p className="text-center text-[12px] text-gray-500 py-10 rounded-2xl bg-[#151b24]">
        Bạn chưa nắm giữ cổ phiếu nào. Chọn một mã ở tab Thị trường để đặt lệnh mua.
      </p>
    );
  }

  return (
    <section className="rounded-2xl p-3.5 bg-[#151b24] border border-[#d4af37]/30">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-white flex items-center gap-1.5">
          <Briefcase className="w-4 h-4 text-[#d4af37]" /> {compact ? "Cổ phiếu của tôi" : "Danh mục nắm giữ"}
        </h2>
        <span className="text-[10px] text-gray-500">{summary.rows.length} mã</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-xl bg-[#0d1117] p-2.5">
          <p className="text-[10px] text-gray-400">Giá trị thị trường</p>
          <p className="text-[15px] font-bold text-white font-mono">{fmt(summary.marketValue)} đ</p>
          <p className="text-[10px] text-gray-500 font-mono">Vốn {fmt(summary.totalCost)} đ</p>
        </div>
        <div className="rounded-xl bg-[#0d1117] p-2.5">
          <p className="text-[10px] text-gray-400">Lãi/Lỗ tạm tính</p>
          <p className="text-[15px] font-bold font-mono" style={{ color: tone(summary.pnl) }}>
            {summary.pnl >= 0 ? "+" : ""}
            {fmt(summary.pnl)} đ
          </p>
          <p className="text-[10px] font-mono" style={{ color: tone(summary.pnl) }}>{pct(summary.pnlPct)}</p>
        </div>
      </div>

      <div className="divide-y divide-[#222c38]">
        {summary.rows.map((r) => (
          <div key={r.symbol} className="flex items-center gap-3 py-2">
            <div className="w-10 h-10 rounded-xl bg-[#1f2937] flex items-center justify-center shrink-0">
              <span className="text-[12px] font-bold text-white">{r.symbol}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-white font-semibold">{r.qty.toLocaleString("vi-VN")} CP</p>
              <p className="text-[10px] text-gray-400">
                Giá vốn {fmt(r.avgCost)} đ
                {r.qtyPending > 0 && <span className="text-amber-300"> · {r.qtyPending.toLocaleString("vi-VN")} chờ về T+2</span>}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[12px] font-bold text-white font-mono">{fmt(r.value)} đ</p>
              <p className="text-[10px] font-mono" style={{ color: tone(r.pnl) }}>
                {r.price != null ? pct(r.pnlPct) : "Chưa có giá"}
              </p>
            </div>
            {!compact && onBuy && (
              <button
                onClick={() => onBuy(r.symbol)}
                className="ml-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[10.5px] font-bold cursor-pointer"
              >
                Mua thêm
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
