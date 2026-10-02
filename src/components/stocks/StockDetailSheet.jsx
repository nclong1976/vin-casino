import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { supabase } from "@/lib/supabase";
import { changePct, priceColor } from "@/lib/stockMarket";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n) || 0).toLocaleString("vi-VN"));

const RANGES = [
  ["1D", "1 ngày", 1],
  ["1W", "1 tuần", 7],
  ["1M", "1 tháng", 30],
  ["3M", "3 tháng", 90],
];

/**
 * Chi tiết mã: biểu đồ giá thật từ stock_price_ticks (mỗi lần giá đổi, mở /
 * đóng cửa), Trần/TC/Sàn, mở/đóng, cao/thấp, KL và nút Mua / Bán.
 */
export default function StockDetailSheet({ stock, quote, sellable = 0, onClose, onBuy, onSell }) {
  const [range, setRange] = useState("1W");
  const [ticks, setTicks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stock?.symbol) return undefined;
    let alive = true;
    const days = RANGES.find(([k]) => k === range)?.[2] || 7;
    const from = new Date(Date.now() - days * 86400000).toISOString();
    setLoading(true);
    supabase
      .from("stock_price_ticks")
      .select("price, ts")
      .eq("symbol", stock.symbol)
      .gte("ts", from)
      .order("ts", { ascending: true })
      .limit(3000)
      .then(({ data }) => {
        if (!alive) return;
        setTicks(data || []);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [stock?.symbol, range]);

  const data = useMemo(() => {
    const pts = ticks.map((t) => ({ t: new Date(t.ts).getTime(), p: Number(t.price) }));
    const last = Number(quote?.last_price);
    if (last > 0) pts.push({ t: Date.now(), p: last });
    return pts;
  }, [ticks, quote?.last_price]);

  if (!stock) return null;
  const last = Number(quote?.last_price) || 0;
  const pct = changePct(quote);
  const color = pct >= 0 ? "#10b981" : "#ef4444";
  const showTime = range === "1D";
  const fmtTick = (t) =>
    new Date(t).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      ...(showTime ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }),
    });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[55] bg-black/60 flex items-end justify-center font-heading"
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[480px] max-h-[92vh] overflow-y-auto bg-[#151b24] rounded-t-3xl p-5 pb-8 border-t border-[#d4af37]/30"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[16px] font-bold text-white">{stock.symbol}</p>
              <p className="text-[11px] text-gray-400">{stock.name}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 cursor-pointer">
              <X className="w-4 h-4 text-gray-300" />
            </button>
          </div>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-[24px] font-bold font-mono" style={{ color: priceColor(last, quote) }}>
              {fmt(last)}
            </span>
            <span className="text-[12px] font-semibold font-mono" style={{ color }}>
              {pct >= 0 ? "+" : ""}
              {fmt(last - Number(quote?.reference_price || last))} ({pct >= 0 ? "+" : ""}
              {pct}%)
            </span>
          </div>

          <div className="flex gap-1 mt-3 p-1 rounded-xl bg-[#0d1117]">
            {RANGES.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                className={`flex-1 py-1 rounded-lg text-[11px] cursor-pointer ${range === k ? "bg-[#d4af37] text-black font-bold" : "text-gray-400"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="h-[200px] mt-2">
            {loading ? (
              <div className="h-full flex items-center justify-center text-[11px] text-gray-500">Đang tải biểu đồ...</div>
            ) : data.length < 2 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-gray-500 text-center px-6">
                Chưa đủ dữ liệu giá trong khoảng này. Biểu đồ ghi nhận mỗi lần giá thay đổi.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`detail-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={fmtTick}
                    tick={{ fill: "#6b7280", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    dataKey="p"
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => fmt(v)}
                    tick={{ fill: "#6b7280", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  {quote?.reference_price && (
                    <ReferenceLine y={Number(quote.reference_price)} stroke="#d4af37" strokeDasharray="3 3" strokeOpacity={0.6} />
                  )}
                  <Tooltip
                    contentStyle={{ background: "#0d1117", border: "1px solid #222c38", borderRadius: 8, fontSize: 11 }}
                    labelFormatter={(t) =>
                      new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
                    }
                    formatter={(v) => [`${fmt(v)} đ`, "Giá"]}
                  />
                  <Area type="stepAfter" dataKey="p" stroke={color} strokeWidth={1.8} fill={`url(#detail-${stock.symbol})`} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {quote && (
            <div className="grid grid-cols-3 gap-1.5 mt-3 text-center text-[10px]">
              {[
                ["Trần", quote.ceiling_price, "#a855f7"],
                ["TC", quote.reference_price, "#d4af37"],
                ["Sàn", quote.floor_price, "#22d3ee"],
                ["Mở cửa", quote.open_price, "#e5e7eb"],
                ["Cao / Thấp", quote.high_price != null ? `${fmt(quote.high_price)} / ${fmt(quote.low_price)}` : null, "#e5e7eb"],
                ["KL hôm nay", quote.volume, "#e5e7eb"],
              ].map(([label, v, c]) => (
                <div key={label} className="rounded-lg bg-[#0d1117] py-1.5">
                  <p className="text-gray-500">{label}</p>
                  <p className="text-[11.5px] font-bold font-mono" style={{ color: c }}>
                    {typeof v === "string" ? v : fmt(v)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {stock.description && <p className="text-[11px] text-gray-400 leading-relaxed mt-3">{stock.description}</p>}

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              disabled={!stock.is_active}
              onClick={onBuy}
              className="py-3 rounded-xl bg-emerald-500 text-white text-[13px] font-extrabold uppercase cursor-pointer disabled:opacity-40"
            >
              Mua
            </button>
            <button
              disabled={!stock.is_active || sellable <= 0}
              onClick={onSell}
              className="py-3 rounded-xl bg-red-500 text-white text-[13px] font-extrabold uppercase cursor-pointer disabled:opacity-40"
            >
              Bán{sellable > 0 ? ` · ${sellable.toLocaleString("vi-VN")} CP` : ""}
            </button>
          </div>
          {!stock.is_active && <p className="text-[10px] text-amber-400 text-center mt-2">Mã đang tạm khoá giao dịch.</p>}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
