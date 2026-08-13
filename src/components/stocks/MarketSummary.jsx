import React from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

export default function MarketSummary() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-[#1a2332] to-[#0d1117] border border-[#243042]"
    >
      <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-emerald-500/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400">Chỉ số VINGROUP</p>
            <p className="text-[26px] font-bold text-white leading-tight mt-0.5">1.284,67</p>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[12px] font-semibold text-emerald-400">+2,34%</span>
            </div>
            <span className="text-[10px] text-emerald-400/80 mt-1">+29,45 điểm</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/5">
          <div>
            <p className="text-[9px] text-gray-500">KL Giao dịch</p>
            <p className="text-[12px] font-semibold text-white">48,2 Tr</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-500">GT Giao dịch</p>
            <p className="text-[12px] font-semibold text-white">2.150 Tỷ</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-500">Cổ phiếu tăng</p>
            <p className="text-[12px] font-semibold text-emerald-400">4 / 5</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}