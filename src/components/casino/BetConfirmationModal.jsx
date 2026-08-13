import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Clock, Landmark, AlertCircle, ArrowRight, Lock } from "lucide-react";

const fmt = (n) => new Intl.NumberFormat("vi-VN").format(n) + " VNĐ";

const ZONE_LABELS = {
  player_pair: { label: "Player Pair", odds: "11:1" },
  tie: { label: "Tie - Hòa", odds: "8:1" },
  banker_pair: { label: "Banker Pair", odds: "11:1" },
  player: { label: "Player", odds: "1:1" },
  tiger: { label: "Tiger", odds: "40:1" },
  banker: { label: "Banker", odds: "0.95:1" },
};

export default function BetConfirmationModal({
  open,
  onClose,
  onConfirm,
  gameTitle,
  bets,
  totalPlacedBet,
  balance,
  timerSeconds,
  phase,
}) {
  if (!open) return null;

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isTimerExpired = timerSeconds <= 0 || phase !== "betting";
  const remainingBalance = Math.max(0, balance - totalPlacedBet);
  const voucherCode = `REF-CASINO-${Math.floor(100000 + Math.random() * 900000)}`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 10 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="w-full max-w-sm sm:max-w-md bg-gradient-to-b from-[#1c1a14] via-[#12110c] to-[#0a0907] border-2 border-[#d4af37]/70 rounded-2xl p-4 sm:p-5 text-white shadow-[0_0_40px_rgba(212,175,55,0.25)] flex flex-col relative overflow-hidden"
        >
          {/* Top Decorative Gold Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent" />

          {/* Header & Banking Verification Badge */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#d4af37]/20">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#d4af37]/30 to-[#d4af37]/10 border border-[#d4af37]/60 flex items-center justify-center text-[#f2ca50] shadow-inner shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-[#d4af37] leading-tight">
                  XÁC NHẬN LỆNH CƯỢC
                </h3>
                <p className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400 inline" />
                  Chứng từ mã hóa SSL 256-bit • {gameTitle}
                </p>
              </div>
            </div>

            {/* Live 04:59 Countdown State */}
            <div className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold flex items-center gap-1.5 shrink-0 ${
              timerSeconds < 30
                ? "bg-red-950/60 border-red-500/60 text-red-400 animate-pulse"
                : "bg-amber-950/50 border-[#d4af37]/40 text-[#f2ca50]"
            }`}>
              <Clock className="w-3.5 h-3.5" />
              <span>{formatTimer(timerSeconds)}</span>
            </div>
          </div>

          {/* 4:59 Timer Banner Notice */}
          <div className="mb-3 p-2 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/30 flex items-center justify-between text-[11px] text-amber-200/90 font-medium">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              Đồng hồ phiên: <strong className="font-mono text-amber-300">{formatTimer(timerSeconds)}</strong>
            </span>
            <span className="text-[10px] text-gray-400 font-mono">Phiên #{(timerSeconds + 1000).toString().slice(-4)}</span>
          </div>

          {/* Selected Bets Itemized List */}
          <div className="w-full bg-black/60 rounded-xl p-3 border border-white/10 mb-3 space-y-2 max-h-48 overflow-y-auto">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pb-1.5 border-b border-white/10 flex justify-between">
              <span>CỬA ĐẶT CƯỢC</span>
              <span>TỶ LỆ & SỐ TIỀN</span>
            </div>

            {Object.entries(bets)
              .filter(([_, amount]) => amount > 0)
              .map(([key, amount]) => {
                const info = ZONE_LABELS[key] || { label: key, odds: "1:1" };
                return (
                  <div key={key} className="flex justify-between items-center text-xs py-1 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37]" />
                      <span className="font-semibold text-gray-200">{info.label}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-amber-300 font-mono">
                        {info.odds}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-emerald-400">{fmt(amount)}</span>
                  </div>
                );
              })}

            {/* Total Stake */}
            <div className="pt-2 flex justify-between items-center border-t border-[#d4af37]/40 text-xs sm:text-sm font-black">
              <span className="text-[#d4af37] uppercase tracking-wider">TỔNG VỐN CƯỢC:</span>
              <span className="font-mono text-yellow-400 text-sm sm:text-base">{fmt(totalPlacedBet)}</span>
            </div>
          </div>

          {/* Financial Account Projections */}
          <div className="w-full text-xs text-gray-300 space-y-1.5 mb-4 bg-white/5 p-3 rounded-xl border border-white/10 font-mono">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-400">Số dư khả dụng hiện tại:</span>
              <span className="text-white font-bold">{fmt(balance)}</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-400">Trích xuất vốn cược:</span>
              <span className="text-red-400 font-bold">-{fmt(totalPlacedBet)}</span>
            </div>
            <div className="pt-1.5 border-t border-white/10 flex justify-between items-center font-bold text-xs">
              <span className="text-sky-300">Số dư ví sau cược:</span>
              <span className="text-sky-300">{fmt(remainingBalance)}</span>
            </div>
          </div>

          {/* Voucher Reference ID */}
          <div className="flex justify-between items-center text-[10px] text-gray-500 mb-4 px-1 font-mono">
            <span>Mã chứng từ cược: <strong className="text-gray-400">{voucherCode}</strong></span>
            <span>Trạng thái: <strong className="text-amber-400">Chờ xác nhận</strong></span>
          </div>

          {/* Expiration warning if timer expired */}
          {isTimerExpired && (
            <div className="mb-3 p-2 rounded-lg bg-red-950/80 border border-red-500/50 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>Phiên cược đã hết thời gian hoặc đang chia bài. Vui lòng thử lại phiên sau!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex w-full gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-gradient-to-b from-gray-700 via-gray-800 to-gray-900 border border-gray-600 text-gray-200 font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md"
            >
              HỦY LỆNH
            </button>
            <button
              onClick={onConfirm}
              disabled={isTimerExpired}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f2ca50] to-[#b38822] hover:from-[#f2ca50] hover:to-[#d4af37] text-[#3c2f00] font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-yellow-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>XÁC NHẬN</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
