import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { QrCode, Copy, ShieldCheck, Star, Wallet, Sparkles, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import BottomNav from "@/components/BottomNav";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getCardTierInfo, ALL_CARD_TIERS } from "@/lib/membershipUtils";
import { computeWalletNet, resolveTransactionKind, resolveTransactionStatus, TRANSACTION_KINDS } from "@/lib/transactionHistory";
import { toast } from "sonner";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

export default function MembershipCard() {
  const { user } = useAuth();
  const [walletTxs, setWalletTxs] = useState([]);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const me = user;
      if (me) {
        const [wt, t] = await Promise.all([
          base44.entities.WalletTransaction.filter(
            { $or: [{ user_id: me.id }, { created_by_id: me.id }] },
            "-created_date",
            100
          ).catch(() => []),
          base44.entities.Transaction.list("-created_date", 50).catch(() => [])
        ]);
        setWalletTxs(wt);
        setTxs(t);
      }
      setLoading(false);
    })();
  }, [user]);

  // Tổng nạp tích luỹ cho hạng thẻ VIP: CHỈ tính nạp tiền THẬT đã chốt
  // (không tính thưởng/lãi casino-vòng quay-lãi VIP dù chúng cũng có
  // type:"deposit", và không tính giao dịch pending/rejected/failed) -
  // khớp đúng cách total_deposited được cộng ở phía Admin duyệt nạp
  // (adjustUserBalance chỉ cộng total_deposited cho nạp tiền thật).
  const depositSum = walletTxs
    .filter((t) => resolveTransactionKind(t) === TRANSACTION_KINDS.DEPOSIT && resolveTransactionStatus(t) === "success")
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0) + (user?.total_deposited || (user?.role === "admin" ? (user?.balance ?? 0) : 0));

  // Số dư ví: lấy số dư THẬT của user làm gốc, chỉ "nâng" lên nếu ground
  // truth tính từ lịch sử ví (computeWalletNet - dùng chung với Profile.jsx)
  // cao hơn - tránh hiển thị số sai do tự cộng trừ lại từng dòng mà bỏ sót
  // loại giao dịch (đầu tư/đặt cược) hoặc không lọc trạng thái pending.
  const walletBalance = Math.max(Number(user?.balance || 0), computeWalletNet(walletTxs).netCalculated);

  // Chỉ tính hợp đồng đầu tư đã thực sự chốt (status "completed") - loại
  // pending/failed nếu có ra khỏi tổng.
  const totalInvested = txs
    .filter((t) => t.status === "completed")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const currentTier = getCardTierInfo(depositSum);

  useEffect(() => {
    if (!loading) {
      const idx = ALL_CARD_TIERS.findIndex((t) => t.tier === currentTier.tier);
      if (idx !== -1) setSelectedTierIndex(idx);
    }
  }, [loading, currentTier.tier]);

  const displayedTier = getCardTierInfo(
    ALL_CARD_TIERS[selectedTierIndex]?.tier === "DIAMOND"
      ? 10000000000
      : ALL_CARD_TIERS[selectedTierIndex]?.tier === "PLATINUM"
      ? 3000000000
      : ALL_CARD_TIERS[selectedTierIndex]?.tier === "GOLD"
      ? 1000000000
      : 0
  );

  const memberId = user?.id ? user.id.slice(-8).toUpperCase() : "VINCLUB";
  const displayName = user?.full_name || user?.name || user?.username || "Thành viên VinClub";

  const copyId = () => {
    navigator.clipboard?.writeText(memberId);
    toast.success("Đã sao chép mã thành viên");
  };

  // Progress to next tier
  const nextMin = currentTier.nextTierMin;
  const progressPercent = nextMin
    ? Math.min(100, Math.max(0, (depositSum / nextMin) * 100))
    : 100;
  const neededForNext = nextMin ? Math.max(0, nextMin - depositSum) : 0;

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <PageHeader title="Thẻ thành viên VinClub" />

      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4">
        {loading ? (
          <div className="text-center py-10 text-[12px] text-gray-400">Đang tải thẻ...</div>
        ) : (
          <>
            {/* Tier Selector Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
              {ALL_CARD_TIERS.map((item, idx) => {
                const isActive = selectedTierIndex === idx;
                const isUserTier = currentTier.tier === item.tier;
                return (
                  <button
                    key={item.tier}
                    onClick={() => setSelectedTierIndex(idx)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold whitespace-nowrap transition-all shrink-0 flex items-center gap-1 ${
                      isActive
                        ? "bg-[#948154] text-white shadow-md scale-105"
                        : "bg-white text-gray-600 border border-gray-200"
                    }`}
                  >
                    {isUserTier && <Sparkles className="w-3 h-3 text-yellow-300 fill-yellow-300" />}
                    {item.name}
                  </button>
                );
              })}
            </div>

            {/* Membership Card Display */}
            <motion.div
              key={displayedTier.tier}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              className="relative rounded-2xl overflow-hidden shadow-xl aspect-[1.58/1] w-full border border-amber-900/20 bg-slate-900 group"
            >
              {/* Card Background Image */}
              <img
                src={displayedTier.image}
                alt={displayedTier.name}
                className="absolute inset-0 w-full h-full object-fill rounded-2xl select-none"
                onError={(e) => {
                  e.currentTarget.src = "https://statics.vinpearl.com/vinclub-member_1723049424.png";
                }}
              />

              {/* Gradient Overlay for Text Contrast */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/40" />

              {/* Card Content Overlay */}
              <div className="relative z-10 p-4 h-full flex flex-col justify-between text-white">
                {/* Header */}
                <div className="flex items-start justify-end">
                  {currentTier.tier === displayedTier.tier ? (
                    <span className="text-[8px] font-bold bg-green-500/90 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm backdrop-blur-xs">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Thẻ của bạn
                    </span>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                      <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                    </div>
                  )}
                </div>

                {/* Card Number & Chip */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-5 rounded bg-gradient-to-br from-yellow-300 to-amber-600 opacity-90 shadow-inner border border-amber-200/50" />
                    <button onClick={copyId} className="flex items-center gap-1 bg-black/30 px-2 py-0.5 rounded backdrop-blur-xs text-left">
                      <span className="text-[11px] font-mono font-bold tracking-widest text-amber-100">{memberId}</span>
                      <Copy className="w-2.5 h-2.5 text-white/70" />
                    </button>
                  </div>
                </div>

                {/* Footer Owner Info */}
                <div className="pt-2 border-t border-white/20 flex items-end justify-between">
                  <div>
                    <p className="text-[7px] uppercase tracking-wider text-white/70">Chủ thẻ</p>
                    <p className="text-[13px] font-bold truncate max-w-[170px] uppercase text-white drop-shadow">
                      {displayName}
                    </p>
                  </div>
                  <p className="text-[8px] font-semibold text-amber-200/90 bg-black/40 px-2 py-0.5 rounded">
                    {displayedTier.minLabel}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Current Level Progress Card */}
            <div className="bg-white rounded-2xl p-3.5 shadow-sm space-y-2 border border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#948154]/10 flex items-center justify-center text-[#948154]">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-black">{currentTier.fullName}</p>
                    <p className="text-[9px] text-gray-500">
                      Tổng nạp tích lũy: <span className="font-bold text-[#948154]">{fmt(depositSum)} ₫</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              {currentTier.nextTierName ? (
                <div className="pt-1 space-y-1">
                  <div className="flex justify-between text-[9px] font-medium text-gray-500">
                    <span>Tiến trình lên {currentTier.nextTierName}</span>
                    <span className="font-bold text-[#948154]">{progressPercent.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden p-0.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 1 }}
                      className="h-full bg-gradient-to-r from-[#948154] to-amber-500 rounded-full"
                    />
                  </div>
                  <p className="text-[8px] text-gray-400 text-right">
                    Cần nạp thêm <span className="font-bold text-black">{fmt(neededForNext)} ₫</span> để đạt {currentTier.nextTierName}
                  </p>
                </div>
              ) : (
                <div className="text-[9px] font-bold text-green-600 bg-green-50 p-2 rounded-xl text-center flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Chúc mừng! Bạn đã đạt hạng thẻ Kim Cương cao nhất
                </div>
              )}
            </div>

            {/* Wallet & Deposit Stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <Wallet className="w-3.5 h-3.5 text-[#948154]" />
                  <p className="text-[9px] text-gray-400">Số dư ví khả dụng</p>
                </div>
                <p className="text-[13px] font-bold text-[#948154]">{fmt(walletBalance)} ₫</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                  <p className="text-[9px] text-gray-400">Tổng vốn đầu tư</p>
                </div>
                <p className="text-[13px] font-bold text-black">{fmt(totalInvested)} ₫</p>
              </div>
            </div>

            {/* QR Code Section */}
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center border border-gray-100">
              <p className="text-[12px] font-bold text-black mb-1 flex items-center justify-center gap-1.5">
                <QrCode className="w-4 h-4 text-[#948154]" /> Mã QR Thẻ VinClub
              </p>
              <p className="text-[9px] text-gray-400 mb-3">Quét mã để xác thực thông tin quyền lợi thành viên VIP</p>
              <div className="inline-block p-3 bg-white border-2 border-[#948154]/20 rounded-xl shadow-inner">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=VINCLUB:${memberId}:${user?.email || ""}`}
                  alt="QR Thẻ Thành Viên"
                  className="w-[130px] h-[130px]"
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-2 font-mono font-medium">{user?.email || user?.phone || "Mã KH: " + memberId}</p>
            </div>

            {/* Tier Criteria & Benefits */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h3 className="text-[12px] font-bold text-black flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-[#948154] fill-[#948154]" />
                  Đặc quyền {displayedTier.name}
                </h3>
                <span className="text-[9px] font-bold text-[#948154] bg-[#948154]/10 px-2 py-0.5 rounded-full">
                  {displayedTier.minLabel}
                </span>
              </div>

              <div className="space-y-2">
                {displayedTier.benefits.map((b, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#948154] shrink-0 mt-0.5" />
                    <span className="text-[10px] text-gray-700 font-medium leading-tight">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
