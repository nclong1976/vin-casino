import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import { supabase } from "@/lib/supabase";
import { changePct, priceColor, vnClock } from "@/lib/stockMarket";
import { buildSeries, intradaySeries, seriesStats, trendColor, vnTime } from "@/lib/stockChart";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n) || 0).toLocaleString("vi-VN"));

const RANGES = [
  ["1D", "Hôm nay", 0],
  ["1W", "1 tuần", 7],
  ["1M", "1 tháng", 30],
  ["3M", "3 tháng", 90],
  ["1Y", "1 năm", 365],
];

const fmtTime = (t, withTime) =>
  new Date(t).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    day: "2-digit",
    month: "2-digit",
  });

const fmtHour = (t) =>
  new Date(t).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });

function ChartTooltip({ active, payload, start, isDay }) {
  if (!active || !payload?.length) return null;
  const { t, p } = payload[0].payload;
  const d = p - start;
  const pctv = start > 0 ? (d / start) * 100 : 0;
  return (
    <div className="rounded-lg bg-[#0d1117] border border-[#222c38] px-2.5 py-1.5 text-[11px] shadow-lg">
      <p className="text-gray-400">{fmtTime(t, true)}</p>
      <p className="font-bold font-mono text-white">{fmt(p)} đ</p>
      <p className="font-mono" style={{ color: trendColor(d) }}>
        {d >= 0 ? "+" : ""}
        {fmt(d)} ({pctv >= 0 ? "+" : ""}
        {pctv.toFixed(2)}%) so với {isDay ? "TC" : "đầu kỳ"}
      </p>
    </div>
  );
}

/**
 * Chi tiết mã: biểu đồ lên / xuống từ giá thật (stock_price_ticks - mỗi lần
 * giá đổi một điểm), so với giá tham chiếu (hôm nay) hoặc giá đầu kỳ (tuần /
 * tháng / năm); Trần/TC/Sàn, mở cửa, cao/thấp, KL và nút Mua / Bán.
 */
export default function StockDetailSheet({ stock, quote, sellable = 0, onClose, onBuy, onSell }) {
  // Trước 9:00 phiên hôm nay chưa có giá - mở sẵn tab 1 tuần.
  const [range, setRange] = useState(() => (vnClock().minutes < 540 ? "1W" : "1D"));
  const [raw, setRaw] = useState({ ticks: [], before: null, from: 0, day: "" });
  const [loading, setLoading] = useState(true);
  const isDay = range === "1D";

  useEffect(() => {
    if (!stock?.symbol) return undefined;
    let alive = true;
    const day = vnClock().date;
    const days = RANGES.find(([k]) => k === range)?.[2] || 0;
    const from = days ? Date.now() - days * 86400000 : vnTime(day, 0);
    const iso = new Date(from).toISOString();
    setLoading(true);
    const q = supabase.from("stock_price_ticks").select("price, ts").eq("symbol", stock.symbol);
    Promise.all([
      q.gte("ts", iso).order("ts", { ascending: true }).limit(3000),
      // Giá tại đầu kỳ = lần đổi giá gần nhất trước mốc bắt đầu.
      days
        ? supabase.from("stock_price_ticks").select("price, ts").eq("symbol", stock.symbol).lt("ts", iso).order("ts", { ascending: false }).limit(1)
        : Promise.resolve({ data: [] }),
    ]).then(([inRange, prior]) => {
      if (!alive) return;
      setRaw({ ticks: inRange.data || [], before: prior.data?.[0] || null, from, day });
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [stock?.symbol, range]);

  const series = useMemo(() => {
    if (isDay) return intradaySeries({ ticks: raw.ticks, quote, dateStr: raw.day || vnClock().date });
    return buildSeries({
      ticks: raw.ticks,
      from: raw.before ? raw.from : undefined,
      startPrice: raw.before?.price,
      lastPrice: quote?.last_price,
    });
  }, [raw, quote, isDay]);
  const stats = seriesStats(series);

  if (!stock) return null;
  const last = Number(quote?.last_price) || 0;
  const pct = changePct(quote);
  const color = pct >= 0 ? "#10b981" : "#ef4444";
  const lineColor = trendColor(stats?.change || 0);
  const base = stats?.start || 0;
  const pad = stats ? Math.max((stats.high - stats.low) * 0.12, base * 0.005) : 0;
  const domain = stats ? [Math.min(stats.low, base) - pad, Math.max(stats.high, base) + pad] : ["auto", "auto"];
  const rangeLabel = RANGES.find(([k]) => k === range)?.[1];
  const data = series.length === 1 ? [series[0], { ...series[0], t: series[0].t + 60000 }] : series;

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

          {stats && !loading && (
            <div className="flex items-baseline justify-between mt-2 text-[11px]">
              <span className="text-gray-400">
                {isDay ? "Hôm nay so với giá tham chiếu" : `Trong ${rangeLabel?.toLowerCase()}`}
              </span>
              <span className="font-bold font-mono" style={{ color: lineColor }}>
                {stats.change > 0 ? "▲ +" : stats.change < 0 ? "▼ " : "■ "}
                {fmt(stats.change)} đ ({stats.pct >= 0 ? "+" : ""}
                {stats.pct}%)
              </span>
            </div>
          )}

          <div className="h-[200px] mt-1">
            {loading ? (
              <div className="h-full flex items-center justify-center text-[11px] text-gray-500">Đang tải biểu đồ...</div>
            ) : data.length < 2 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-gray-500 text-center px-6">
                {isDay && vnClock().minutes < 540
                  ? "Phiên hôm nay chưa mở (giao dịch từ 9:00). Chọn “1 tuần” để xem giá các phiên trước."
                  : "Chưa có dữ liệu giá trong khoảng này. Biểu đồ ghi lại mỗi lần giá thay đổi."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`detail-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#1f2937" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(t) => (isDay ? fmtHour(t) : fmtTime(t, false))}
                    tick={{ fill: "#6b7280", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    domain={domain}
                    tickFormatter={(v) => fmt(v)}
                    tick={{ fill: "#6b7280", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickCount={4}
                  />
                  <ReferenceLine
                    y={base}
                    stroke="#d4af37"
                    strokeDasharray="4 3"
                    strokeOpacity={0.8}
                    label={{ value: isDay ? "TC" : "Đầu kỳ", position: "insideTopLeft", fill: "#d4af37", fontSize: 9 }}
                  />
                  <Tooltip
                    content={<ChartTooltip start={base} isDay={isDay} />}
                    cursor={{ stroke: "#6b7280", strokeDasharray: "3 3" }}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="p"
                    baseValue={domain[0]}
                    stroke={lineColor}
                    strokeWidth={2}
                    fill={`url(#detail-${stock.symbol})`}
                    activeDot={{ r: 4, stroke: "#151b24", strokeWidth: 2, fill: lineColor }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {stats && !loading && data.length >= 2 && (
            <>
              <div className="grid grid-cols-3 gap-1.5 mt-2 text-center text-[10px]">
                {[
                  ["Cao nhất", stats.high, "#10b981"],
                  ["Thấp nhất", stats.low, "#ef4444"],
                  [isDay ? "Giá tham chiếu" : "Giá đầu kỳ", stats.start, "#d4af37"],
                ].map(([label, v, c]) => (
                  <div key={label} className="rounded-lg bg-[#0d1117] py-1.5">
                    <p className="text-gray-500">{label}</p>
                    <p className="text-[11.5px] font-bold font-mono" style={{ color: c }}>
                      {fmt(v)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed mt-2">
                {stats.flat
                  ? "Giá chưa thay đổi trong khoảng này nên đường giá nằm ngang. "
                  : ""}
                Đường vàng đứt là {isDay ? "giá tham chiếu (giá đóng cửa phiên trước)" : "giá lúc đầu kỳ"}. Đường giá nằm trên là đang{" "}
                <span className="text-emerald-400">tăng (xanh)</span>, nằm dưới là đang <span className="text-red-400">giảm (đỏ)</span>. Chạm vào
                biểu đồ để xem giá từng thời điểm.
              </p>
            </>
          )}

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
