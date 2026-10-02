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

/**
 * Biểu đồ tăng / giảm hôm nay của từng mã: thanh mọc sang phải (xanh) là
 * tăng, sang trái (đỏ) là giảm so với giá tham chiếu; chạm mép là chạm
 * trần / sàn (±biên độ).
 */
function MoversChart({ list, band, onSelect }) {
  const rows = [...list].sort((a, b) => changePct(b) - changePct(a));
  if (rows.length === 0) return null;
  const scale = Math.max(Number(band) || 7, ...rows.map((q) => Math.abs(changePct(q))));
  return (
    <div className="mt-3 pt-3 border-t border-white/5">
      <div className="flex items-center justify-between text-[9.5px] text-gray-500 mb-1.5">
        <span>Tăng / giảm hôm nay</span>
        <span>
          <span className="text-red-400">◀ giảm</span> · <span className="text-emerald-400">tăng ▶</span>
        </span>
      </div>
      <div className="space-y-1">
        {rows.map((q) => {
          const p = changePct(q);
          const w = Math.min(50, (Math.abs(p) / scale) * 50);
          const c = p > 0 ? "#10b981" : p < 0 ? "#ef4444" : "#d4af37";
          return (
            <button
              key={q.symbol}
              type="button"
              onClick={onSelect ? () => onSelect(q.symbol) : undefined}
              className={`w-full flex items-center gap-2 text-left ${onSelect ? "cursor-pointer" : "cursor-default"}`}
              aria-label={`${q.symbol} ${p >= 0 ? "tăng" : "giảm"} ${Math.abs(p)}%`}
            >
              <span className="w-9 text-[11px] font-bold text-white">{q.symbol}</span>
              <span className="relative flex-1 h-3.5 rounded bg-white/[0.04]">
                <span className="absolute left-1/2 top-0 bottom-0 w-px bg-[#d4af37]/60" />
                <span
                  className="absolute top-0.5 bottom-0.5 rounded-sm"
                  style={{
                    background: c,
                    width: p === 0 ? 3 : `${Math.max(w, 1.5)}%`,
                    ...(p >= 0 ? { left: p === 0 ? "calc(50% - 1.5px)" : "50%" } : { right: "50%" }),
                  }}
                />
              </span>
              <span className="w-14 text-right text-[11px] font-mono font-semibold" style={{ color: c }}>
                {p > 0 ? "+" : ""}
                {p.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Tổng quan thị trường từ bảng giá thật (stock_quotes) - thay số liệu cố định trước đây. */
export default function MarketSummary({ quotes, session, calendar, band, onSelect }) {
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
        <MoversChart list={list} band={band} onSelect={onSelect} />
        <p className="text-[10.5px] text-amber-200/90 mt-2">{sessionHint(session, new Date(), calendar)}</p>
        <p className="text-[9px] text-gray-500 mt-0.5">Giờ giao dịch: 09:00–11:30 · 13:00–14:45 (thứ Hai – thứ Sáu)</p>
      </div>
    </motion.div>
  );
}
