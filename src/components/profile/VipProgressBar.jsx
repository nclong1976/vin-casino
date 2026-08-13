import React from "react";
import { motion } from "framer-motion";
import { Crown, Sparkles, TrendingUp, Award, ShieldCheck, ChevronRight } from "lucide-react";
import { getCardTierInfo } from "@/lib/membershipUtils";

const fmt = (n) => new Intl.NumberFormat("vi-VN").format(n) + " VNĐ";

export default function VipProgressBar({ totalDepositSum = 0, onDeposit }) {
  const currentTier = getCardTierInfo(totalDepositSum);

  // Determine progress metrics
  const minDeposit = currentTier.min;
  const nextMinDeposit = currentTier.nextTierMin;
  const isMaxTier = !nextMinDeposit || currentTier.tier === "DIAMOND";

  let progressPercent = 100;
  let remainingNeeded = 0;

  if (!isMaxTier && nextMinDeposit > minDeposit) {
    const currentProgress = totalDepositSum - minDeposit;
    const totalRequired = nextMinDeposit - minDeposit;
    progressPercent = Math.min(100, Math.max(0, (currentProgress / totalRequired) * 100));
    remainingNeeded = Math.max(0, nextMinDeposit - totalDepositSum);
  }

  // Tier color themes
  const tierColorMap = {
    MEMBER: {
      badgeBg: "bg-gradient-to-r from-gray-700 to-gray-900 border-gray-600 text-gray-200",
      barGradient: "from-gray-500 via-amber-400 to-[#d4af37]",
      icon: Award,
    },
    GOLD: {
      badgeBg: "bg-gradient-to-r from-amber-600 via-[#d4af37] to-yellow-600 text-[#3c2f00]",
      barGradient: "from-amber-500 via-yellow-400 to-amber-200",
      icon: Sparkles,
    },
    PLATINUM: {
      badgeBg: "bg-gradient-to-r from-slate-300 via-slate-100 to-sky-200 text-slate-900",
      barGradient: "from-sky-400 via-indigo-400 to-purple-400",
      icon: TrendingUp,
    },
    DIAMOND: {
      badgeBg: "bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 text-white",
      barGradient: "from-cyan-300 via-blue-400 to-purple-500",
      icon: Crown,
    },
  };

  const theme = tierColorMap[currentTier.tier] || tierColorMap.MEMBER;
  const TierIcon = theme.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-br from-[#1b1915] via-[#14120e] to-[#0a0a08] border border-[#d4af37]/40 rounded-2xl p-4 text-white shadow-md relative overflow-hidden font-heading"
    >
      {/* Top Metallic Glow Accent */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent" />

      {/* Header Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg border flex items-center justify-center shadow ${theme.badgeBg}`}>
            <TierIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-amber-300/80 uppercase tracking-wider">Tiến Độ Thăng Hạng VIP</span>
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-[#f2ca50] text-[9px] font-mono font-bold">
                {progressPercent.toFixed(1)}%
              </span>
            </div>
            <h4 className="text-xs sm:text-sm font-extrabold text-[#d4af37] tracking-wide uppercase">
              {currentTier.name}
            </h4>
          </div>
        </div>

        {/* Daily Rate Tag */}
        <div className="text-right">
          <span className="text-[9px] text-gray-400 block font-medium">Đặc quyền lãi:</span>
          <span className="text-xs font-mono font-bold text-emerald-400">{currentTier.dailyRateLabel}</span>
        </div>
      </div>

      {/* Real-time Progress Bar Track */}
      <div className="relative w-full h-3.5 bg-black/70 rounded-full p-0.5 border border-[#d4af37]/30 mb-3 shadow-inner overflow-hidden">
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full rounded-full bg-gradient-to-r ${theme.barGradient} relative shadow-[0_0_12px_rgba(212,175,55,0.6)]`}
        >
          {/* Shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-[shimmer_2s_infinite]" />
        </motion.div>
      </div>

      {/* Progress Breakdown Text */}
      {!isMaxTier ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-300">
            <span className="text-gray-400">Đã nạp: <strong className="text-white font-bold">{fmt(totalDepositSum)}</strong></span>
            <span className="text-amber-300 font-bold">Mục tiêu {currentTier.nextTierName}: {fmt(nextMinDeposit)}</span>
          </div>

          <div className="p-2 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-amber-200">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Cần nạp thêm: <strong className="text-emerald-400 font-mono font-bold">{fmt(remainingNeeded)}</strong></span>
            </div>

            {onDeposit && (
              <button
                onClick={onDeposit}
                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#f2ca50] hover:from-[#f2ca50] hover:to-[#d4af37] text-[#3c2f00] font-black text-[10px] uppercase tracking-wider flex items-center gap-0.5 shadow transition-transform active:scale-95 cursor-pointer shrink-0"
              >
                <span>Nạp Ngay</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <strong className="block text-emerald-300 font-bold uppercase tracking-wider">Đã Đạt Hạng VIP Kim Cương Cao Nhất</strong>
            <span className="text-[10px] text-emerald-300/80">Bạn đang được nhận lãi suất đặc quyền tối đa 1.2%/ngày & chăm sóc KH riêng 24/7.</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
