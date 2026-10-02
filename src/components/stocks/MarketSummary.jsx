import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";
import { SESSION_LABELS, changePct, sessionHint } from "@/lib/stockMarket";

const compact = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} Tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} Tr`;
  return v.toLocaleString("vi-VN");
};

/** Tổng quan thị trường từ bảng giá thật (stock_quotes) - thay số liệu cố định trước đây. */
export default function MarketSummary({ quotes, session, calendar }) {
  const list = Object.values(quotes || {});
  const avg = list.length ? list.reduce((s, q) => s + changePct(q), 0) / list.length : 0;
  const up = list.filter((q) => changePct(q) > 0).length;
  const down = list.filter((q) => changePct(q) < 0).length;
  const volume = list.reduce((s, q) => s + (Number(q.volume) || 0), 0);
  const value = list.reduce((s, q) => s + (Number(q.volume) || 0) * (Number(q.last_price) || 0), 0);
  const positive = avg >= 0;
  const color = positive ? "text-emerald-400" : "text-red-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-[#1a2332] to-[#0d1117] border border-[#243042]"
    >
      <div className={`absolute -right-6 -top-6 w-28 h-28 rounded-full blur-2xl ${positive ? "bg-emerald-500/10" : "bg-red-500/10"}`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400">Nhóm cổ phiếu Vingroup</p>
            <p className="text-[18px] font-bold text-white leading-tight mt-0.5 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#d4af37]" /> {SESSION_LABELS[session] || "—"}
            </p>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${positive ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
            {positive ? <TrendingUp className={`w-3.5 h-3.5 ${color}`} /> : <TrendingDown className={`w-3.5 h-3.5 ${color}`} />}
            <span className={`text-[12px] font-semibold ${color}`}>
              {positive ? "+" : ""}
              {avg.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/5">
          <div>
            <p className="text-[9px] text-gray-500">KL khớp hôm nay</p>
            <p className="text-[12px] font-semibold text-white">{compact(volume)}</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-500">GT khớp hôm nay</p>
            <p className="text-[12px] font-semibold text-white">{compact(value)}</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-500">Tăng / Giảm</p>
            <p className="text-[12px] font-semibold">
              <span className="text-emerald-400">{up}</span>
              <span className="text-gray-500"> / </span>
              <span className="text-red-400">{down}</span>
              <span className="text-gray-500"> / {list.length}</span>
            </p>
          </div>
        </div>
        <p className="text-[10.5px] text-amber-200/90 mt-2">{sessionHint(session, new Date(), calendar)}</p>
        <p className="text-[9px] text-gray-500 mt-0.5">Giờ giao dịch: 09:00–11:30 · 13:00–14:45 (thứ Hai – thứ Sáu)</p>
      </div>
    </motion.div>
  );
}
