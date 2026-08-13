import React from "react";
import { ArrowDownToLine, ArrowUpFromLine, ShieldCheck, Wallet, Sparkles } from "lucide-react";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

export default function WalletCard({ balance, onDeposit, onWithdraw }) {
  return (
    <div className="relative rounded-2xl overflow-hidden shadow-xl border border-[#d4af37]/40 bg-gradient-to-br from-[#1c1810] via-[#282216] to-[#0f0d09] p-4 text-white font-heading">
      {/* Metallic Gold Shimmer Background Effect */}
      <div className="absolute -top-10 -right-10 w-36 h-36 bg-[#d4af37]/15 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#f2ca50] to-transparent opacity-60" />

      {/* Top Bar: Wallet Label & VIP Badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs text-[#d4af37] font-semibold tracking-wide uppercase">
          <Wallet className="w-3.5 h-3.5 text-[#f2ca50]" />
          <span>Ví Tài Khoản Khả Dụng</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f2ca50]/10 border border-[#f2ca50]/30 text-[9px] font-bold text-[#f2ca50]">
          <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
          <span>BẢO MẬT VIP</span>
        </div>
      </div>

      {/* Main Balance Display */}
      <div className="my-2">
        <p className="text-[26px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#ffffff] via-[#f2ca50] to-[#d4af37] tracking-tight leading-none">
          {fmt(balance)} <span className="text-[13px] font-bold text-[#f2ca50] font-sans">VNĐ</span>
        </p>
        <p className="text-[10px] text-gray-400 mt-1 font-medium flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
          Nạp & rút tiền tự động 24/7 qua cổng ngân hàng
        </p>
      </div>

      {/* Action Buttons: Gửi Tiền & Rút Tiền */}
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        {/* Gửi Tiền (Deposit) */}
        <button
          onClick={onDeposit}
          className="relative group overflow-hidden py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f2ca50] to-[#b38822] hover:from-[#f2ca50] hover:to-[#d4af37] text-[#3c2f00] font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          <ArrowDownToLine className="w-4 h-4 text-[#3c2f00] stroke-[2.5]" />
          <span>GỬI TIỀN</span>
        </button>

        {/* Rút Tiền (Withdraw) */}
        <button
          onClick={onWithdraw}
          className="relative group overflow-hidden py-2.5 px-3 rounded-xl bg-black/60 hover:bg-black/80 border border-[#d4af37]/60 text-[#f2ca50] font-extrabold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 backdrop-blur-sm"
        >
          <ArrowUpFromLine className="w-4 h-4 text-[#f2ca50] stroke-[2.5]" />
          <span>RÚT TIỀN</span>
        </button>
      </div>
    </div>
  );
}
