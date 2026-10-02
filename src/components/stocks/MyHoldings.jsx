import React, { useEffect, useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { summarizePositions } from "@/lib/stockOrders";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const pct = (n) => `${n >= 0 ? "+" : ""}${(Number(n) || 0).toFixed(2)}%`;
const tone = (n) => (n > 0 ? "#10b981" : n < 0 ? "#ef4444" : "#d4af37");

/**
 * "Cổ phiếu của tôi": nắm giữ đọc từ stock_positions (RLS chỉ trả dòng của
 * người dùng), định giá theo giá hiện tại của các mã trên trang. Ẩn khi chưa
 * có cổ phần nào.
 */
export default function MyHoldings({ stocks }) {
  const { user } = useAuth();
  const [positions, setPositions] = useState([]);

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
        .select("symbol, project_id, qty, total_cost")
        .eq("user_id", uid)
        .then(({ data }) => alive && setPositions(data || []));
    load();
    const channel = supabase
      .channel(`stock_positions_${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_positions", filter: `user_id=eq.${uid}` }, () => load())
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const summary = useMemo(() => {
    const prices = {};
    (stocks || []).forEach((s) => {
      if (s.id && s.priceNum > 0) prices[s.symbol] = s.priceNum;
    });
    return summarizePositions(positions, prices);
  }, [positions, stocks]);

  if (summary.rows.length === 0) return null;

  return (
    <section className="rounded-2xl p-3.5 bg-[#151b24] border border-[#d4af37]/30">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-white flex items-center gap-1.5">
          <Briefcase className="w-4 h-4 text-[#d4af37]" /> Cổ phiếu của tôi
        </h2>
        <span className="text-[10px] text-gray-500">{summary.rows.length} mã</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-xl bg-[#0d1117] p-2.5">
          <p className="text-[10px] text-gray-400">Giá trị thị trường</p>
          <p className="text-[15px] font-bold text-white font-mono">{fmt(summary.marketValue)} đ</p>
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
              <p className="text-[10px] text-gray-400">Giá vốn {fmt(r.avgCost)} đ</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[12px] font-bold text-white font-mono">{fmt(r.value)} đ</p>
              <p className="text-[10px] font-mono" style={{ color: tone(r.pnl) }}>
                {r.price != null ? pct(r.pnlPct) : "Chưa có giá"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
