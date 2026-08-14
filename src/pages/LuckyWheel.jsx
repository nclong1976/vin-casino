import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, RotateCcw, Sparkles, HelpCircle, Wallet } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import BottomNav from "@/components/BottomNav";
import { base44 } from "@/api/base44Client";
import { updateUserBalance } from "@/lib/balanceSync";
import { toast } from "sonner";

const PRIZES = [
  { label: "100K VNĐ", color: "#948154", weight: 30 },
  { label: "500K VNĐ", color: "#3B82F6", weight: 15 },
  { label: "Chúc may", color: "#94A3B8", weight: 25 },
  { label: "1M VNĐ", color: "#10B981", weight: 8 },
  { label: "50K VNĐ", color: "#F59E0B", weight: 15 },
  { label: "5M VNĐ", color: "#EF4444", weight: 7 },
];

const SEGMENT_ANGLE = 360 / PRIZES.length;

export default function LuckyWheel() {
  const [user, setUser] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  
  const [spinsLeft, setSpinsLeft] = useState(0);
  const [earnedSpins, setEarnedSpins] = useState(0);
  const [todayDeposit, setTodayDeposit] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadUserDataAndSpins = useCallback(async () => {
    try {
      const me = await base44.auth.me().catch(() => null);
      setUser(me);
      if (!me) {
        setLoading(false);
        return;
      }

      const todayStr = new Date().toISOString().split("T")[0];
      
      // Fetch user's wallet transactions
      const txs = await base44.entities.WalletTransaction.filter(
        { $or: [{ user_id: me.id }, { created_by_id: me.id }] },
        "-created_date",
        100
      ).catch(() => []);

      const todayDeposits = txs.filter((tx) => {
        if (tx.type !== "deposit") return false;
        const txDate = (tx.created_date || tx.created_at || "").split("T")[0];
        return txDate === todayStr;
      });

      const todaySum = todayDeposits.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
      setTodayDeposit(todaySum);

      // Auto rules:
      // >= 150M -> 3 spins
      // >= 80M  -> 2 spins
      // >= 20M  -> 1 spin
      // Max 3 spins per day
      let earned = 0;
      if (todaySum >= 150000000) {
        earned = 3;
      } else if (todaySum >= 80000000) {
        earned = 2;
      } else if (todaySum >= 20000000) {
        earned = 1;
      }
      earned = Math.min(3, earned);
      setEarnedSpins(earned);

      const storageKey = `vinclub_wheel_spins_used_${todayStr}_${me.id}`;
      const used = parseInt(localStorage.getItem(storageKey) || "0") || 0;
      setSpinsLeft(Math.max(0, earned - used));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserDataAndSpins();
  }, [loadUserDataAndSpins]);

  const spin = () => {
    if (spinning || spinsLeft <= 0 || !user) return;
    setSpinning(true);
    setResult(null);

    const totalWeight = PRIZES.reduce((s, p) => s + p.weight, 0);
    let rand = Math.random() * totalWeight;
    let prizeIndex = 0;
    for (let i = 0; i < PRIZES.length; i++) {
      rand -= PRIZES[i].weight;
      if (rand <= 0) { prizeIndex = i; break; }
    }

    const targetAngle = 360 * 5 + (360 - (prizeIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2));
    setRotation(rotation + targetAngle);

    const todayStr = new Date().toISOString().split("T")[0];
    const storageKey = `vinclub_wheel_spins_used_${todayStr}_${user.id}`;
    const used = parseInt(localStorage.getItem(storageKey) || "0") || 0;
    const newUsed = used + 1;
    localStorage.setItem(storageKey, String(newUsed));

    const newLeft = Math.max(0, earnedSpins - newUsed);
    setSpinsLeft(newLeft);

    setTimeout(() => {
      setSpinning(false);
      const prizeWon = PRIZES[prizeIndex];
      setResult(prizeWon);
      if (prizeWon.label === "Chúc may") {
        toast.info("Chúc bạn may mắn lần sau!");
      } else {
        toast.success(`Chúc mừng! Bạn nhận được ${prizeWon.label}`);
        
        let prizeAmt = 0;
        if (prizeWon.label.includes("50K")) prizeAmt = 50000;
        else if (prizeWon.label.includes("100K")) prizeAmt = 100000;
        else if (prizeWon.label.includes("500K")) prizeAmt = 500000;
        else if (prizeWon.label.includes("1M")) prizeAmt = 1000000;
        else if (prizeWon.label.includes("5M")) prizeAmt = 5000000;

        if (prizeAmt > 0 && user?.id) {
          const currentBal = Number(user.balance || 0);
          const newBal = currentBal + prizeAmt;
          updateUserBalance(user.id, newBal, prizeAmt);

          base44.entities.WalletTransaction.create({
            user_id: user.id,
            type: "deposit",
            amount: prizeAmt,
            note: `Trúng thưởng ${prizeWon.label} từ Vòng Quay May Mắn`,
            category: "Thưởng Vòng Quay",
            status: "approved",
          }).catch(() => null);
        }
      }
    }, 4000);
  };

  const fmt = (n) => (n || 0).toLocaleString("vi-VN");

  return (
    <main className="relative w-full min-h-screen bg-gradient-to-b from-[#1a1410] to-[#0d0a08] overflow-x-hidden font-heading">
      <PageHeader title="Vòng quay may mắn" />
      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-white"
        >
          <Sparkles className="w-6 h-6 mx-auto text-[#948154] mb-1" />
          <h2 className="text-[15px] font-bold">Quay trúng thưởng VinClub</h2>
          <p className="text-[11px] text-[#948154] font-semibold mt-0.5">
            Còn {spinsLeft} lượt quay (Đã nhận {earnedSpins}/3 lượt hôm nay)
          </p>
        </motion.div>

        {/* Deposit status card */}
        <div className="w-full bg-white/10 backdrop-blur rounded-2xl p-3 text-white space-y-1.5 border border-white/10">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/60 flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-[#948154]" /> Nạp tiền hôm nay:
            </span>
            <span className="font-bold text-[#948154]">{fmt(todayDeposit)} VNĐ</span>
          </div>

          <div className="pt-1.5 border-t border-white/10 text-[9.5px] text-white/70 space-y-0.5">
            <p className="font-semibold text-white/90 flex items-center gap-1">
              <HelpCircle className="w-3 h-3 text-[#948154]" /> Quy tắc tự động tích lượt quay:
            </p>
            <p className="pl-4">• Nạp từ 20 triệu VNĐ: +1 lượt quay</p>
            <p className="pl-4">• Nạp từ 80 triệu VNĐ: +2 lượt quay</p>
            <p className="pl-4">• Nạp từ 150 triệu VNĐ: +3 lượt quay</p>
            <p className="pl-4 text-white/50 italic">* Tối đa 3 lượt quay trong 1 ngày.</p>
          </div>
        </div>

        {/* Wheel */}
        <div className="relative w-[260px] h-[260px] mt-1">
          {/* Pointer */}
          <div className="absolute top-[-8px] left-1/2 -translate-x-1/2 z-20">
            <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-[#948154] drop-shadow-lg" />
          </div>

          {/* Wheel body */}
          <motion.div
            animate={{ rotate: rotation }}
            transition={{ duration: 4, ease: [0.17, 0.67, 0.12, 0.99] }}
            className="w-full h-full relative"
          >
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {PRIZES.map((prize, i) => {
                const startAngle = i * SEGMENT_ANGLE - 90;
                const endAngle = (i + 1) * SEGMENT_ANGLE - 90;
                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;
                const x1 = 100 + 95 * Math.cos(startRad);
                const y1 = 100 + 95 * Math.sin(startRad);
                const x2 = 100 + 95 * Math.cos(endRad);
                const y2 = 100 + 95 * Math.sin(endRad);
                const midAngle = (startAngle + endAngle) / 2;
                const midRad = (midAngle * Math.PI) / 180;
                const textX = 100 + 55 * Math.cos(midRad);
                const textY = 100 + 55 * Math.sin(midRad);
                return (
                  <g key={i}>
                    <path
                      d={`M 100 100 L ${x1} ${y1} A 95 95 0 0 1 ${x2} ${y2} Z`}
                      fill={prize.color}
                      stroke="#1a1410"
                      strokeWidth="1"
                    />
                    <text
                      x={textX}
                      y={textY}
                      fill="white"
                      fontSize="9"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${midAngle + 90} ${textX} ${textY})`}
                    >
                      {prize.label}
                    </text>
                  </g>
                );
              })}
              <circle cx="100" cy="100" r="15" fill="#1a1410" stroke="#948154" strokeWidth="2" />
            </svg>
          </motion.div>
        </div>

        {/* Spin Button */}
        <button
          onClick={spin}
          disabled={spinning || spinsLeft <= 0 || loading}
          className="px-10 py-3 rounded-full bg-[#948154] hover:bg-[#837046] disabled:opacity-40 text-white text-[14px] font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-[#948154]/20"
        >
          {spinning ? (
            <>
              <RotateCcw className="w-4 h-4 animate-spin" /> Đang quay...
            </>
          ) : (
            <>
              <Gift className="w-4 h-4" /> Quay ngay
            </>
          )}
        </button>

        {spinsLeft <= 0 && !spinning && (
          <p className="text-[10px] text-white/50 text-center">
            {todayDeposit < 20000000
              ? "Nạp từ 20.000.000 VNĐ hôm nay để nhận 1 lượt quay!"
              : "Bạn đã dùng hết lượt quay của hôm nay. Hãy quay lại vào ngày mai!"}
          </p>
        )}

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="bg-white/10 backdrop-blur rounded-2xl px-6 py-4 text-center border border-white/20"
            >
              <p className="text-[11px] text-white/50">Kết quả lượt quay</p>
              <p className="text-[18px] font-bold" style={{ color: result.color === "#94A3B8" ? "#fff" : result.color }}>
                {result.label}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prize List */}
        <div className="w-full bg-white/5 rounded-xl p-3 mt-1">
          <p className="text-[11px] font-bold text-white/80 mb-2">Danh sách phần thưởng</p>
          <div className="grid grid-cols-3 gap-2">
            {PRIZES.map((p) => (
              <div key={p.label} className="bg-white/5 rounded-lg p-2 text-center">
                <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{ background: p.color }} />
                <p className="text-[10px] text-white/70">{p.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <BottomNav />
    </main>
  );
}