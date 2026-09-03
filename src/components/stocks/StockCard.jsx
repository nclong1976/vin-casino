import React from "react";
import { motion } from "framer-motion";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { ArrowUpRight, ArrowDownRight, Lock } from "lucide-react";

export default function StockCard({ stock, index, onTrade }) {
  const up = stock.change >= 0;
  const isActive = stock.is_active ?? true;
  const color = up ? "#10b981" : "#ef4444";
  const data = stock.spark.map((v) => ({ v }));

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
      <div className="flex items-center gap-3">
        {/* Logo + Symbol */}
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#1f2937] shrink-0">
          <span className="text-[13px] font-bold text-white">{stock.symbol}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white truncate">{stock.symbol}</p>
          <p className="text-[10px] text-gray-400 truncate">{stock.name}</p>
        </div>

        {/* Mini chart */}
        <div className="w-[60px] h-[34px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`grad-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#grad-${stock.symbol})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Price */}
        <div className="flex flex-col items-end shrink-0 w-[78px]">
          <p className="text-[13px] font-bold text-white">{stock.price}</p>
          <div className="flex items-center gap-0.5" style={{ color }}>
            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            <span className="text-[11px] font-semibold">{up ? "+" : ""}{stock.change}%</span>
          </div>
        </div>
      </div>

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
        style={isActive ? { backgroundColor: up ? "#10b981" : "#ef4444" } : undefined}
      >
        {isActive ? (up ? "Mua ngay" : "Bán ngay") : (<>Tạm khóa giao dịch <Lock className="w-3 h-3" /></>)}
      </button>
    </motion.div>
  );
}