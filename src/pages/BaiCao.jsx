import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Coins, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import PlayingCard from "@/components/casino/PlayingCard";
import { useAuth } from "@/lib/AuthContext";
import { updateUserBalance } from "@/lib/balanceSync";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const cardValue = (rank) => (rank === "A" ? 1 : ["J", "Q", "K"].includes(rank) ? 10 : parseInt(rank));
const handScore = (cards) => cards.reduce((s, c) => s + cardValue(c.rank), 0) % 10;
const isCao = (cards) => {
  const r = cards.map((c) => c.rank);
  return r.every((x) => ["J", "Q", "K"].includes(x)) || r.every((x) => x === "A");
};
const fmt = (n) => n.toLocaleString("vi-VN");

function buildDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
const draw = (deck, n) => deck.splice(0, n);
const compare = (player, dealer) => {
  const pC = isCao(player), dC = isCao(dealer);
  if (pC && dC) return "tie";
  if (pC) return "win";
  if (dC) return "lose";
  const ps = handScore(player), ds = handScore(dealer);
  if (ps > ds) return "win";
  if (ps < ds) return "lose";
  return "tie";
};

const CHIPS = [10000, 50000, 100000, 500000];
const RESULT_TEXT = {
  win: { label: "BẠN THẮNG", color: "#e8c87a" },
  lose: { label: "BẠN THUA", color: "#c1272d" },
  tie: { label: "HÒA", color: "#9ca3af" },
};

export default function BaiCao() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [balance, setBalance] = useState(() => {
    if (user?.balance !== undefined) return Number(user.balance);
    const localUserStr = localStorage.getItem("base44_local_user");
    if (localUserStr) {
      try {
        const u = JSON.parse(localUserStr);
        if (u && u.balance !== undefined) return Number(u.balance);
      } catch (e) {}
    }
    const v = localStorage.getItem("baicao_balance");
    return v ? parseInt(v) : 0;
  });
  const [bet, setBet] = useState(50000);
  const [phase, setPhase] = useState("betting"); // betting | dealt | result
  const [player, setPlayer] = useState([]);
  const [dealer, setDealer] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handleSync = () => {
      const localUserStr = localStorage.getItem("base44_local_user");
      if (localUserStr) {
        try {
          const u = JSON.parse(localUserStr);
          if (u && u.balance !== undefined) {
            setBalance(Number(u.balance));
            return;
          }
        } catch (e) {}
      }
      if (user?.balance !== undefined) {
        setBalance(Number(user.balance));
      }
    };

    handleSync();
    window.addEventListener("vinclub:balance_updated", handleSync);
    window.addEventListener("storage", handleSync);

    return () => {
      window.removeEventListener("vinclub:balance_updated", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [user]);

  const persist = (v) => {
    const safeBal = Math.max(0, Number(v) || 0);
    setBalance(safeBal);
    localStorage.setItem("baicao_balance", String(safeBal));
    if (user?.id) {
      updateUserBalance(user.id, safeBal);
    } else {
      try {
        const localUserStr = localStorage.getItem("base44_local_user");
        if (localUserStr) {
          const localUser = JSON.parse(localUserStr);
          localUser.balance = safeBal;
          localStorage.setItem("base44_local_user", JSON.stringify(localUser));
        }
      } catch (e) {}
      window.dispatchEvent(new CustomEvent("vinclub:balance_updated"));
    }
  };

  const deal = useCallback(() => {
    if (bet > balance) {
      toast.error("Số dư không đủ để đặt cược!");
      return;
    }
    setBusy(true);

    // Trừ tiền cược vào ví ngay khi đặt cược thành công
    const newBal = balance - bet;
    persist(newBal);

    if (user?.id) {
      base44.entities.WalletTransaction.create({
        user_id: user.id,
        type: "withdrawal",
        amount: bet,
        note: `Đặt cược Bài Cào`,
        category: "Cược Casino",
        status: "approved",
      }).catch(() => null);
    }

    const deck = buildDeck();
    setPlayer(draw(deck, 3));
    setDealer(draw(deck, 3));
    setResult(null);
    setPhase("dealt");
    setBusy(false);
    toast.success(`Đã đặt cược ${fmt(bet)} VNĐ thành công!`);
  }, [bet, balance, user]);

  const reveal = useCallback(() => {
    const r = compare(player, dealer);
    let winPayout = 0;
    
    // Lấy số dư ví hiện tại sau khi đã trừ cược ở bước deal
    const currentBal = (() => {
      const local = localStorage.getItem("baicao_balance");
      return local ? parseInt(local) : balance;
    })();

    if (r === "win") {
      // Thắng: Trả lại vốn (1x) + Lợi nhuận (1x hoặc 2x nếu là sáp/cao)
      winPayout = isCao(player) ? bet * 3 : bet * 2;
      persist(currentBal + winPayout);

      if (user?.id) {
        base44.entities.WalletTransaction.create({
          user_id: user.id,
          type: "deposit",
          amount: winPayout,
          note: `Thắng Bài Cào ${isCao(player) ? "(3 Tiên)" : ""}`,
          category: "Thắng Casino",
          status: "approved",
        }).catch(() => null);
      }
    } else if (r === "tie") {
      // Hòa: Hoàn trả lại tiền cược
      winPayout = bet;
      persist(currentBal + winPayout);
    } else {
      // Thua: Tiền đã trừ lúc đặt cược, không cộng thêm
      winPayout = 0;
    }

    setResult({ type: r, payout: r === "win" ? winPayout : r === "lose" ? -bet : 0 });
    setPhase("result");
  }, [player, dealer, bet, balance, user]);

  const newRound = useCallback(() => {
    setPhase("betting");
    setPlayer([]);
    setDealer([]);
    setResult(null);
  }, []);

  const resetBalance = () => {
    persist(5000000);
    toast.success("Đã nạp lại số dư");
  };

  const dealerRevealed = phase === "result";
  const playerRevealed = phase === "dealt" || phase === "result";

  return (
    <main className="relative w-full min-h-screen bg-[#0c0905] overflow-x-hidden font-heading flex flex-col">
      {/* Felt glow background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-[#1a1208]/80 to-transparent" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 70% at 50% 45%, rgba(202,164,90,0.12), transparent 60%)" }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 w-full bg-[#120d08]/95 backdrop-blur border-b border-[#3a2c14]">
        <div className="max-w-3xl mx-auto flex items-center justify-center px-4 py-3 relative">
          <button
            onClick={() => navigate(-1)}
            title="Quay lại"
            className="absolute left-4 w-7 h-7 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-[#e8c87a] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <h1 className="text-[13px] sm:text-sm font-semibold tracking-[0.15em] text-[#e8c87a] text-center">BÀI CÀO</h1>
        </div>
      </header>

      {/* Balance bar */}
      <div className="relative z-10 w-full bg-[#160f08] border-b border-[#3a2c14]">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-[#e8c87a]" />
            <span className="text-[11px] sm:text-xs font-semibold text-[#e8c87a]">{fmt(balance)} VNĐ</span>
          </div>
          <button onClick={resetBalance} className="text-[10px] text-[#9a8456] active:opacity-70 flex items-center gap-1 cursor-pointer">
            <RefreshCw className="w-3 h-3" /> Nạp lại
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="relative z-10 flex-1 w-full max-w-3xl mx-auto flex flex-col items-center justify-between py-6 px-4">
        {/* Dealer */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] tracking-[0.2em] text-[#9a8456]">NHÀ CÁI</span>
          <div className="flex gap-2 min-h-[80px]">
            {dealer.length === 0 ? (
              <EmptySlots count={3} />
            ) : (
              dealer.map((c, i) => (
                <PlayingCard key={i} card={c} revealed={dealerRevealed} delay={0.1 * i} />
              ))
            )}
          </div>
          {dealerRevealed && (
            <ScoreTag score={handScore(dealer)} cao={isCao(dealer)} />
          )}
        </div>

        {/* Divider */}
        <div className="w-full flex items-center gap-2 my-3">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#caa45a]/40" />
          <span className="text-[8px] tracking-[0.3em] text-[#9a8456]">VS</span>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#caa45a]/40" />
        </div>

        {/* Player */}
        <div className="flex flex-col items-center gap-2">
          {playerRevealed && (
            <ScoreTag score={handScore(player)} cao={isCao(player)} />
          )}
          <div className="flex gap-2 min-h-[80px]">
            {player.length === 0 ? (
              <EmptySlots count={3} />
            ) : (
              player.map((c, i) => (
                <PlayingCard key={i} card={c} revealed={playerRevealed} delay={0.1 * i} />
              ))
            )}
          </div>
          <span className="text-[10px] tracking-[0.2em] text-[#9a8456]">BẠN</span>
        </div>

        {/* Result banner */}
        <AnimatePresence>
          {result && RESULT_TEXT[result.type] && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-5 py-2.5 rounded-xl bg-[#120d08]/95 border"
              style={{ borderColor: RESULT_TEXT[result.type]?.color || "#e8c87a" }}
            >
              <p className="text-[16px] font-bold tracking-wider text-center" style={{ color: RESULT_TEXT[result.type]?.color || "#e8c87a" }}>
                {RESULT_TEXT[result.type]?.label}
              </p>
              {result.payout !== 0 && (
                <p className="text-[10px] text-center mt-0.5" style={{ color: result.payout > 0 ? "#e8c87a" : "#c1272d" }}>
                  {result.payout > 0 ? "+" : ""}{fmt(Math.abs(result.payout))} VNĐ
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="relative z-10 w-full bg-gradient-to-t from-[#0c0905] to-transparent pb-20 pt-2">
        <div className="max-w-3xl mx-auto px-4">
        {phase === "betting" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <p className="text-[10px] text-center text-[#9a8456]">Chọn mức cược</p>
            <div className="grid grid-cols-4 gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => setBet(c)}
                  className={`py-2 rounded-lg text-[10px] font-semibold border transition active:scale-95 ${
                    bet === c
                      ? "bg-[#caa45a] text-[#1a1208] border-[#caa45a]"
                      : "bg-[#160f08] text-[#e8c87a] border-[#3a2c14] active:border-[#caa45a]"
                  }`}
                >
                  {c >= 1000 ? `${c / 1000}K` : c}
                </button>
              ))}
            </div>
            <button
              onClick={deal}
              disabled={busy}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#caa45a] to-[#948154] text-[#1a1208] text-[13px] font-bold tracking-wide active:scale-95 transition disabled:opacity-50"
            >
              CHIA BÀI
            </button>
          </motion.div>
        )}

        {phase === "dealt" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <button
              onClick={reveal}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#caa45a] to-[#948154] text-[#1a1208] text-[13px] font-bold tracking-wide active:scale-95 transition"
            >
              MỞ BÀI
            </button>
          </motion.div>
        )}

        {phase === "result" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between text-[10px] text-[#9a8456]">
            <span>Cược: <span className="text-[#e8c87a] font-semibold">{fmt(bet)} VNĐ</span></span>
            <button
              onClick={newRound}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#caa45a] to-[#948154] text-[#1a1208] text-[13px] font-bold tracking-wide active:scale-95 transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> VÁN MỚI
            </button>
          </motion.div>
        )}
        </div>
      </div>
    </main>
  );
}

function EmptySlots({ count }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-[56px] h-[80px] rounded-lg border border-dashed border-[#caa45a]/30 bg-[#160f08]/40"
        />
      ))}
    </>
  );
}

function ScoreTag({ score, cao }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
        cao
          ? "bg-[#caa45a] text-[#1a1208] border-[#caa45a]"
          : "bg-[#160f08] text-[#e8c87a] border-[#3a2c14]"
      }`}
    >
      {cao ? "CÀO" : `${score} ĐIỂM`}
    </motion.span>
  );
}