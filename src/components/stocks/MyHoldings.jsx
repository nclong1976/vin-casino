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
export default function MyHoldings({ quotes, compact = false, onBuy, onSell }) {
  const { user } = useAuth();
  const [positions, setPositions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [sales, setSales] = useState({ pending: 0, realized: 0 });

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
        .select("symbol, project_id, qty, qty_pending, qty_hold, total_cost")
        .eq("user_id", uid)
        .then(({ data }) => {
          if (!alive) return;
          setPositions(data || []);
          setLoaded(true);
        });
    // Tiền bán chờ về (T+2) và lãi/lỗ đã chốt từ các lệnh bán đã khớp.
    const loadSales = () =>
      supabase
        .from("stock_trades")
        .select("net_amount, realized_pnl, settled_at")
        .eq("user_id", uid)
        .eq("side", "SELL")
        .then(({ data }) => {
          if (!alive || !data) return;
          setSales({
            pending: data.filter((t) => !t.settled_at).reduce((s, t) => s + (Number(t.net_amount) || 0), 0),
            realized: data.reduce((s, t) => s + (Number(t.realized_pnl) || 0), 0),
          });
        });
    load();
    loadSales();
    const channel = supabase
      .channel(`stock_positions_${uid}${compact ? "_c" : ""}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_positions", filter: `user_id=eq.${uid}` }, () => {
        load();
        loadSales();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_trades", filter: `user_id=eq.${uid}` }, () => loadSales())
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

  if (summary.rows.length === 0 && !(sales.pending > 0)) {
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

      {(sales.pending > 0 || (!compact && sales.realized !== 0)) && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-xl bg-[#0d1117] p-2.5">
            <p className="text-[10px] text-gray-400">Tiền bán chờ về (T+2)</p>
            <p className="text-[13px] font-bold text-amber-300 font-mono">{fmt(sales.pending)} đ</p>
          </div>
          <div className="rounded-xl bg-[#0d1117] p-2.5">
            <p className="text-[10px] text-gray-400">Lãi/Lỗ đã chốt</p>
            <p className="text-[13px] font-bold font-mono" style={{ color: tone(sales.realized) }}>
              {sales.realized >= 0 ? "+" : ""}
              {fmt(sales.realized)} đ
            </p>
          </div>
        </div>
      )}

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
                {r.qtyHold > 0 && <span className="text-red-300"> · {r.qtyHold.toLocaleString("vi-VN")} đang chờ bán</span>}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[12px] font-bold text-white font-mono">{fmt(r.value)} đ</p>
              <p className="text-[10px] font-mono" style={{ color: tone(r.pnl) }}>
                {r.price != null ? pct(r.pnlPct) : "Chưa có giá"}
              </p>
            </div>
            {!compact && (onBuy || onSell) && (
              <div className="ml-1 flex flex-col gap-1">
                {onBuy && (
                  <button
                    onClick={() => onBuy(r.symbol)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-[10.5px] font-bold cursor-pointer"
                  >
                    Mua
                  </button>
                )}
                {onSell && (
                  <button
                    disabled={r.qtySellable <= 0}
                    onClick={() => onSell(r.symbol, r.qtySellable)}
                    className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-[10.5px] font-bold cursor-pointer disabled:opacity-40"
                  >
                    Bán
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
