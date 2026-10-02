import React from "react";
import { motion } from "framer-motion";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, ReferenceLine } from "recharts";
import { trendColor } from "@/lib/stockChart";
import { ArrowUpRight, ArrowDownRight, Lock, Star } from "lucide-react";

/**
 * Thẻ cổ phiếu. series = các điểm giá thật trong ngày { t, p } (bắt đầu từ
 * giá tham chiếu lúc 9:00) - vẽ biểu đồ nhỏ kèm đường tham chiếu (vàng, đứt):
 * trên đường là tăng, dưới đường là giảm so với hôm qua.
 */
export default function StockCard({ stock, series = [], index, onTrade, onDetail, watched = false, onToggleWatch }) {
  const up = stock.change >= 0;
  const isActive = stock.is_active ?? true;
  const color = trendColor(stock.change);
  const ref = Number(stock.quote?.reference_price) || 0;
  const prices = series.map((x) => x.p).concat(ref > 0 ? [ref] : []);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = Math.max((hi - lo) * 0.15, (ref || hi) * 0.004);
  const data = series.length === 1 ? [series[0], { ...series[0], t: series[0].t + 1 }] : series;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 260, damping: 22 }}
      className={`rounded-2xl p-3.5 bg-[#151b24] border transition-all ${
        isActive ? "border-[#222c38]" : "border-amber-500/60 opacity-90"
      }`}
    >
      {!isActive && (
        <div className="mb-2 inline-flex items-center gap-1 bg-amber-600 text-white text-[8.5px] font-bold px-2 py-0.5 rounded-md shadow-sm">
          <Lock className="w-2.5 h-2.5" /> Tạm khóa giao dịch
        </div>
      )}
      <div
        className={`flex items-center gap-3 ${onDetail ? "cursor-pointer" : ""}`}
        onClick={onDetail ? () => onDetail(stock) : undefined}
        title={onDetail ? "Xem biểu đồ & chi tiết" : undefined}
      >
        {/* Logo + Symbol */}
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#1f2937] shrink-0">
          <span className="text-[13px] font-bold text-white">{stock.symbol}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white truncate flex items-center gap-1">
            {stock.symbol}
            {onToggleWatch && (
              <button
                type="button"
                aria-label={watched ? "Bỏ theo dõi" : "Theo dõi"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWatch(stock.symbol);
                }}
                className="p-0.5 -m-0.5 cursor-pointer"
              >
                <Star className={`w-3.5 h-3.5 ${watched ? "fill-[#d4af37] text-[#d4af37]" : "text-gray-500"}`} />
              </button>
            )}
          </p>
          <p className="text-[10px] text-gray-400 truncate">{stock.name}</p>
        </div>

        {/* Biểu đồ nhỏ trong ngày (giá thật) */}
        {data.length > 0 && (
          <div className="w-[64px] h-[36px]" aria-label={`Biểu đồ giá ${stock.symbol} hôm nay`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                <defs>
                  <linearGradient id={`grad-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis hide dataKey="t" type="number" domain={["dataMin", "dataMax"]} />
                <YAxis hide domain={[lo - pad, hi + pad]} />
                {ref > 0 && <ReferenceLine y={ref} stroke="#d4af37" strokeDasharray="2 2" strokeOpacity={0.7} />}
                <Area
                  type="stepAfter"
                  dataKey="p"
                  baseValue="dataMin"
                  stroke={color}
                  strokeWidth={1.5}
                  fill={`url(#grad-${stock.symbol})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Price */}
        <div className="flex flex-col items-end shrink-0 w-[78px]">
          <p className="text-[13px] font-bold text-white">{stock.price}</p>
          <div className="flex items-center gap-0.5" style={{ color }}>
            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            <span className="text-[11px] font-semibold">{up ? "+" : ""}{stock.change}%</span>
          </div>
        </div>
      </div>

      {stock.quote && (
        <div className="flex items-center justify-between mt-2 text-[10px] font-mono">
          <span className="text-[#a855f7]">Trần {Number(stock.quote.ceiling_price).toLocaleString("vi-VN")}</span>
          <span className="text-[#d4af37]">TC {Number(stock.quote.reference_price).toLocaleString("vi-VN")}</span>
          <span className="text-[#22d3ee]">Sàn {Number(stock.quote.floor_price).toLocaleString("vi-VN")}</span>
          <span className="text-gray-500">KL {Number(stock.quote.volume || 0).toLocaleString("vi-VN")}</span>
        </div>
      )}

      {stock.description && (
        <p className="text-[10.5px] text-gray-400 leading-tight mt-2.5 pt-2.5 border-t border-[#222c38]">{stock.description}</p>
      )}

      <button
        disabled={!isActive}
        onClick={() => {
          if (!isActive) return;
          onTrade(stock);
        }}
        className={`w-full mt-3 py-2 rounded-lg text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
          isActive ? "text-white active:scale-[0.98]" : "bg-gray-700 text-gray-400 cursor-not-allowed"
        }`}
        style={isActive ? { backgroundColor: "#10b981" } : undefined}
      >
        {isActive ? "Mua ngay" : (<>Tạm khóa giao dịch <Lock className="w-3 h-3" /></>)}
      </button>
    </motion.div>
  );
}