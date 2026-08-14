import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { updateUserBalance, getFreshUserBalance } from "@/lib/balanceSync";
import { toast } from "sonner";
import GameCountdownTimer, { getSyncedTimerSeconds, scheduleSecondAlignedTicker } from "@/components/GameCountdownTimer";
import WinAnimationOverlay from "@/components/casino/WinAnimationOverlay";
import { getCasinoConfig, incrementGameStats } from "@/lib/casinoConfig";
import { useCasinoMaintenance, BankingDowntimeScreen } from "@/hooks/useCasinoMaintenance";
import MyBetsDrawer, { recordCasinoBet, resolveLatestCasinoBet } from "@/components/casino/MyBetsDrawer";
import BetConfirmationModal from "@/components/casino/BetConfirmationModal";
import { Receipt, XCircle, Sparkles } from "lucide-react";

// Card Definitions
const SUITS = [
  { symbol: "♠", name: "spades", isRed: false },
  { symbol: "♥", name: "hearts", isRed: true },
  { symbol: "♦", name: "diamonds", isRed: true },
  { symbol: "♣", name: "clubs", isRed: false },
];

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function buildDeck() {
  const deck = [];
  for (let d = 0; d < 8; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          suit,
          rank,
          value: ["10", "J", "Q", "K"].includes(rank) ? 0 : rank === "A" ? 1 : parseInt(rank),
        });
      }
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getHandScore(cards) {
  if (!cards || cards.length === 0) return 0;
  const total = cards.reduce((sum, c) => sum + c.value, 0);
  return total % 10;
}

function isPair(cards) {
  if (!cards || cards.length < 2) return false;
  return cards[0].rank === cards[1].rank;
}

const fmt = (n) => (n || 0).toLocaleString("vi-VN");
const fmtShort = (n) => {
  if (!n) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "K";
  return n.toString();
};

// Neutral Preset Chip Values (Không ưu tiên gợi ý - Đồng đều, sang trọng)
const CHIP_VALUES = [
  { label: "500K", value: 500000, bgClass: "bg-amber-700 border-amber-400/70 text-white font-bold" },
  { label: "2M", value: 2000000, bgClass: "bg-purple-800 border-purple-400/70 text-white font-bold" },
  { label: "5M", value: 5000000, bgClass: "bg-rose-900 border-rose-400/70 text-white font-bold" },
  { label: "50%", value: 0.5, isPercent: true, bgClass: "bg-yellow-600 border-yellow-300/80 text-black font-extrabold" },
];

export default function TigerBaccarat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Determine game variation & Maintenance status
  const isLongHo = location.pathname.includes("baccarat-long-ho");
  const gameSlug = isLongHo ? "baccarat-long-ho" : "tiger-baccarat";
  const gameTitle = isLongHo ? "BACCARAT LONG HỔ" : "TIGER BACCARAT";

  const { isMaintenance, maintenanceMessage, gameSettings } = useCasinoMaintenance(gameSlug);
  const odds205 = !!gameSettings?.odds205;
  const [showMyBets, setShowMyBets] = useState(false);

  // Dealer image: Casino Dealer Background
  const bgImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuAbPyMkkA-oNWH3VWIBa7To7lvUJhBRUmuTxTNIUrZuAdmwGFfkY8wmtzmkx2eQu3qiGbfVgO2Crltli1C7lj6AxmP_9LCYekOJtNIldYWvsNwWpp42r66O2UHcsnKDGkcruchbW8C9nG89pfx1NR0hxK_6vIZY6wA64ZzzhJZmdyv4fMSQjsS_JxqE-8q26tQJL_FrIfZKWpq6l-0R8ij_Wc67nmd0GWwu_o4PrPzmYqjoQZlxu91mZw";

  // Balance Management
  const [balance, setBalance] = useState(() => {
    if (user?.id) {
      const fresh = getFreshUserBalance(user.id);
      if (fresh !== undefined && fresh !== 0) return fresh;
    }
    if (user?.balance !== undefined) return Number(user.balance);
    const localUserStr = localStorage.getItem("base44_local_user");
    if (localUserStr) {
      try {
        const u = JSON.parse(localUserStr);
        if (u && u.balance !== undefined) return Number(u.balance);
      } catch (e) {}
    }
    const local = localStorage.getItem("vinclub_xito_balance");
    if (local) {
      const parsed = parseInt(local);
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  });

  // Selected Chip (Trung tính, người dùng tự do chọn bất kỳ mệnh giá nào)
  const [selectedChipIndex, setSelectedChipIndex] = useState(0);

  // Placed Bets per zone - Cho phép cược nhiều ô đồng thời không giới hạn
  const [bets, setBets] = useState({
    player: 0,
    banker: 0,
    tie: 0,
    tiger: 0,
    player_pair: 0,
    banker_pair: 0,
  });

  // Game Phases: 'betting' -> 'waiting_timer' -> 'dealing' -> 'result'
  const [phase, setPhase] = useState("betting");
  const [timerSeconds, setTimerSeconds] = useState(() => getSyncedTimerSeconds());
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Card Deal State
  const [playerCards, setPlayerCards] = useState([]);
  const [bankerCards, setBankerCards] = useState([]);
  const [flippedCards, setFlippedCards] = useState({ player: [], banker: [] });

  // Outcome
  const [winningZones, setWinningZones] = useState([]);
  const [winPayout, setWinPayout] = useState(0);
  const [winSummary, setWinSummary] = useState([]);
  const [showWinModal, setShowWinModal] = useState(false);
  const [prevBalance, setPrevBalance] = useState(0);

  // Audio Context
  const audioCtxRef = useRef(null);

  // Sync user balance with app-wide events & localStorage
  useEffect(() => {
    const handleSync = () => {
      if (user?.id) {
        const fresh = getFreshUserBalance(user.id);
        if (fresh !== undefined) {
          setBalance(fresh);
          return;
        }
      }
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

  const updateGlobalBalance = useCallback((newBal) => {
    const safeBal = Math.max(0, Number(newBal) || 0);
    setBalance(safeBal);
    localStorage.setItem("vinclub_xito_balance", String(safeBal));

    if (user?.id) {
      updateUserBalance(user.id, safeBal);
    } else {
      try {
        const localUserStr = localStorage.getItem('base44_local_user');
        if (localUserStr) {
          const localUser = JSON.parse(localUserStr);
          localUser.balance = safeBal;
          localStorage.setItem('base44_local_user', JSON.stringify(localUser));
        }
      } catch (e) {}
      window.dispatchEvent(new CustomEvent("vinclub:balance_updated"));
    }
  }, [user]);

  // Sync timer with real-time epoch every second
  useEffect(() => {
    const stop = scheduleSecondAlignedTicker(() => {
      const synced = getSyncedTimerSeconds();
      setTimerSeconds(synced);

      // When real-time cycle hits 00:00 and user has locked bet → deal cards
      if (synced === 0 && phase === "waiting_timer") {
        triggerDealAndReveal();
      }
    });
    return stop;
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  };

  const playChipSound = () => {
    if (!audioCtxRef.current) return;
    try {
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {}
  };

  const getCurrentChipAmount = () => {
    const chipConfig = CHIP_VALUES[selectedChipIndex] || CHIP_VALUES[0];
    if (chipConfig.isPercent) {
      return Math.max(10000, Math.floor(balance * chipConfig.value));
    }
    return chipConfig.value;
  };

  // Đặt cược vào ô bất kỳ (cho phép cược nhiều ô cùng lúc)
  const handlePlaceBet = (zoneKey) => {
    if (phase !== "betting") return;
    initAudio();

    if (user?.is_locked) {
      toast.error("Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ CSKH để được hỗ trợ.");
      return;
    }

    const amount = getCurrentChipAmount();
    if (amount <= 0) return;

    if (amount > balance) {
      toast.error("Số dư ví không đủ để đặt cược thêm!");
      return;
    }

    playChipSound();

    // Trừ số tiền cược vào ví ngay khi người chơi đặt chip lên bàn
    const nextBal = balance - amount;
    updateGlobalBalance(nextBal);

    setBets((prev) => ({
      ...prev,
      [zoneKey]: (prev[zoneKey] || 0) + amount,
    }));
  };

  // Hủy cược ô cụ thể
  const handleClearSingleZone = (zoneKey, e) => {
    if (e) e.stopPropagation();
    if (phase !== "betting") return;
    const currentZoneBet = bets[zoneKey] || 0;
    if (currentZoneBet <= 0) return;

    initAudio();
    const nextBal = balance + currentZoneBet;
    updateGlobalBalance(nextBal);

    setBets((prev) => ({
      ...prev,
      [zoneKey]: 0,
    }));
    toast.info(`Đã hủy cược ô (${fmt(currentZoneBet)} VNĐ)`);
  };

  // Nhân đôi tất cả các ô đã cược (x2)
  const handleDoubleAllBets = () => {
    if (phase !== "betting") return;
    const totalCurrentBets = Object.values(bets).reduce((a, b) => a + b, 0);
    if (totalCurrentBets <= 0) {
      toast.warning("Vui lòng đặt cược trước khi nhân đôi!");
      return;
    }
    if (totalCurrentBets > balance) {
      toast.error("Số dư ví không đủ để nhân đôi toàn bộ cược!");
      return;
    }

    initAudio();
    playChipSound();

    const nextBal = balance - totalCurrentBets;
    updateGlobalBalance(nextBal);

    setBets((prev) => {
      const doubled = {};
      for (const [k, v] of Object.entries(prev)) {
        doubled[k] = v * 2;
      }
      return doubled;
    });
    toast.success("Đã nhân đôi tất cả các ô cược!");
  };

  const handleCancelBets = () => {
    initAudio();
    if (phase !== "betting") return;
    const totalCurrentBets = Object.values(bets).reduce((a, b) => a + b, 0);
    if (totalCurrentBets <= 0) return;

    // Hoàn trả toàn bộ số tiền cược đang đặt trên bàn về ví
    const nextBal = balance + totalCurrentBets;
    updateGlobalBalance(nextBal);

    setBets({
      player: 0,
      banker: 0,
      tie: 0,
      tiger: 0,
      player_pair: 0,
      banker_pair: 0,
    });
    toast.info(`Đã hủy toàn bộ cược và hoàn lại ${fmt(totalCurrentBets)} VNĐ về ví!`);
  };

  // Open Bet Confirmation Modal when user taps XÁC NHẬN
  const handleConfirmBets = () => {
    initAudio();

    if (user?.is_locked) {
      toast.error("Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ CSKH để được hỗ trợ.");
      return;
    }

    const totalBet = Object.values(bets).reduce((a, b) => a + b, 0);

    if (totalBet === 0) {
      toast.warning("Vui lòng chọn chip và đặt vào ít nhất 1 ô cược!");
      return;
    }

    setShowConfirmModal(true);
  };

  // Executed when user agrees on the confirmation modal
  const executeGameRound = () => {
    setShowConfirmModal(false);
    const totalBet = Object.values(bets).reduce((a, b) => a + b, 0);

    if (user?.id) {
      base44.entities.WalletTransaction.create({
        user_id: user.id,
        type: "withdrawal",
        amount: totalBet,
        note: `Đặt cược ${gameTitle}`,
        category: "Cược Casino",
        status: "approved",
      }).catch(() => null);
    }

    // Record bet in local ledger
    recordCasinoBet(gameSlug, gameTitle, bets, totalBet);

    // Set phase to waiting_timer. Game will deal and calculate results when timer reaches 00:00!
    setPhase("waiting_timer");
    toast.success("Đã khóa cược thành công! Đang chờ đồng hồ về 00:00 để lật bài & mở kết quả.");
  };

  // Called when timer reaches 00:00 (or user clicks skip to 00:00)
  const triggerDealAndReveal = () => {
    setPhase("dealing");
    setShowWinModal(false);
    setFlippedCards({ player: [], banker: [] });

    // Check Admin forced outcome configuration for Tiger Baccarat / Baccarat Long Hổ
    const gameSlug = location.pathname.includes("long-ho") ? "baccarat-long-ho" : "tiger-baccarat";
    const casinoCfg = getCasinoConfig();
    const gameSettings = casinoCfg.games[gameSlug] || {};
    const forcedOutcome = gameSettings.forcedOutcome || "auto";

    // Build & Deal
    let deck = buildDeck();
    let pHand = [deck.pop(), deck.pop()];
    let bHand = [deck.pop(), deck.pop()];

    let pScore = getHandScore(pHand);
    let bScore = getHandScore(bHand);

    // Natural Check (8 or 9)
    if (pScore < 8 && bScore < 8) {
      let p3 = null;
      if (pScore <= 5) {
        p3 = deck.pop();
        pHand.push(p3);
        pScore = getHandScore(pHand);
      }

      if (!p3) {
        if (bScore <= 5) {
          const b3 = deck.pop();
          bHand.push(b3);
          bScore = getHandScore(bHand);
        }
      } else {
        const p3Val = p3.value;
        let bankerDraws = false;
        if (bScore <= 2) bankerDraws = true;
        else if (bScore === 3 && p3Val !== 8) bankerDraws = true;
        else if (bScore === 4 && [2, 3, 4, 5, 6, 7].includes(p3Val)) bankerDraws = true;
        else if (bScore === 5 && [4, 5, 6, 7].includes(p3Val)) bankerDraws = true;
        else if (bScore === 6 && [6, 7].includes(p3Val)) bankerDraws = true;

        if (bankerDraws) {
          const b3 = deck.pop();
          bHand.push(b3);
          bScore = getHandScore(bHand);
        }
      }
    }

    // APPLY ADMIN FORCED OUTCOME OVERRIDE & FEATURE RULES
    if (forcedOutcome === "player") {
      pHand = [
        { rank: "9", suit: SUITS[1], value: 9 },
        { rank: "K", suit: SUITS[0], value: 0 },
      ];
      bHand = [
        { rank: "5", suit: SUITS[2], value: 5 },
        { rank: "J", suit: SUITS[3], value: 0 },
      ];
    } else if (forcedOutcome === "banker") {
      pHand = [
        { rank: "4", suit: SUITS[0], value: 4 },
        { rank: "Q", suit: SUITS[1], value: 0 },
      ];
      bHand = [
        { rank: "9", suit: SUITS[2], value: 9 },
        { rank: "K", suit: SUITS[3], value: 0 },
      ];
    } else if (forcedOutcome === "tie") {
      pHand = [
        { rank: "8", suit: SUITS[1], value: 8 },
        { rank: "10", suit: SUITS[0], value: 0 },
      ];
      bHand = [
        { rank: "8", suit: SUITS[2], value: 8 },
        { rank: "J", suit: SUITS[3], value: 0 },
      ];
    } else if (forcedOutcome === "tiger") {
      pHand = [
        { rank: "5", suit: SUITS[1], value: 5 },
        { rank: "10", suit: SUITS[0], value: 0 },
      ];
      bHand = [
        { rank: "6", suit: SUITS[2], value: 6 },
        { rank: "Q", suit: SUITS[3], value: 0 },
      ];
    }

    // Recalculate scores after forced outcome
    pScore = getHandScore(pHand);
    bScore = getHandScore(bHand);

    // If admin feature (odds205) is enabled
    const isOdds205 = !!gameSettings?.odds205;
    if (isOdds205) {
      if (pScore === bScore || forcedOutcome === "auto" || forcedOutcome === "tie") {
        if (Math.random() >= 0.5) {
          pHand = [
            { rank: "9", suit: SUITS[1], value: 9 },
            { rank: "K", suit: SUITS[0], value: 0 },
          ];
          bHand = [
            { rank: "5", suit: SUITS[2], value: 5 },
            { rank: "J", suit: SUITS[3], value: 0 },
          ];
        } else {
          pHand = [
            { rank: "4", suit: SUITS[0], value: 4 },
            { rank: "Q", suit: SUITS[1], value: 0 },
          ];
          bHand = [
            { rank: "9", suit: SUITS[2], value: 9 },
            { rank: "K", suit: SUITS[3], value: 0 },
          ];
        }
      } else if (pScore === bScore) {
        pHand = [
          { rank: "8", suit: SUITS[0], value: 8 },
          { rank: "K", suit: SUITS[1], value: 0 },
        ];
        bHand = [
          { rank: "3", suit: SUITS[2], value: 3 },
          { rank: "4", suit: SUITS[3], value: 4 },
        ];
      }
      pScore = getHandScore(pHand);
      bScore = getHandScore(bHand);
    }

    setPlayerCards(pHand);
    setBankerCards(bHand);

    // Staggered card flip animation
    const flipDelay = 300;
    pHand.forEach((_, idx) => {
      setTimeout(() => {
        setFlippedCards((prev) => ({ ...prev, player: [...prev.player, idx] }));
      }, (idx + 1) * flipDelay);
    });

    bHand.forEach((_, idx) => {
      setTimeout(() => {
        setFlippedCards((prev) => ({ ...prev, banker: [...prev.banker, idx] }));
      }, (pHand.length + idx + 1) * flipDelay);
    });

    // Reveal result after all flips
    const totalFlipTime = (pHand.length + bHand.length + 1) * flipDelay + 300;
    setTimeout(() => {
      setPhase("revealed");

      const winners = [];
      const winsList = [];
      let totalPayout = 0;

      const playerPairWin = isPair(pHand);
      const bankerPairWin = isPair(bHand);

      if (playerPairWin) {
        winners.push("player_pair");
        if (bets.player_pair > 0) {
          const pay = bets.player_pair * 11 + bets.player_pair;
          totalPayout += pay;
          winsList.push(`PLAYER PAIR (11:1): +${fmt(pay)}`);
        }
      }

      if (bankerPairWin) {
        winners.push("banker_pair");
        if (bets.banker_pair > 0) {
          const pay = bets.banker_pair * 11 + bets.banker_pair;
          totalPayout += pay;
          winsList.push(`BANKER PAIR (11:1): +${fmt(pay)}`);
        }
      }

      const isOdds205 = !!gameSettings?.odds205;

      if (pScore > bScore) {
        winners.push("player");
        if (bets.player > 0) {
          const pay = isOdds205
            ? Math.floor(bets.player * 2.1)
            : (bets.player * 1 + bets.player);
          totalPayout += pay;
          winsList.push(`PLAYER thắng (${isOdds205 ? "1.1:1" : "1:1"}): +${fmt(pay)}`);
        }
      } else if (bScore > pScore) {
        winners.push("banker");
        if (bets.banker > 0) {
          const pay = isOdds205
            ? Math.floor(bets.banker * 2.1)
            : (Math.floor(bets.banker * 0.95) + bets.banker);
          totalPayout += pay;
          winsList.push(`BANKER thắng (${isOdds205 ? "1.1:1" : "0.95:1"}): +${fmt(pay)}`);
        }

        if (bScore === 6) {
          winners.push("tiger");
          if (bets.tiger > 0) {
            const tigerPay = bets.tiger * 40 + bets.tiger;
            totalPayout += tigerPay;
            winsList.push(`TIGER BACCARAT 6 ĐIỂM (40:1): +${fmt(tigerPay)}`);
          }
        }
      } else {
        winners.push("tie");
        if (bets.tie > 0) {
          const pay = bets.tie * 8 + bets.tie;
          totalPayout += pay;
          winsList.push(`TIE Hòa (8:1): +${fmt(pay)}`);
        } else {
          if (bets.player > 0) totalPayout += bets.player;
          if (bets.banker > 0) totalPayout += bets.banker;
        }
      }

      setWinningZones(winners);
      setWinPayout(totalPayout);
      setWinSummary(winsList);

      // Resolve pending bet in ledger
      resolveLatestCasinoBet(gameSlug, totalPayout, winsList.join(" | ") || `Player (${pScore}) vs Banker (${bScore})`);

      // Increment game revenue stats in admin
      const roundTotalBet = Object.values(bets).reduce((a, b) => a + b, 0);
      incrementGameStats(gameSlug, roundTotalBet, totalPayout);

      if (totalPayout > 0) {
        const currentBal = (() => {
          const local = localStorage.getItem("vinclub_xito_balance");
          return local ? parseInt(local) : balance;
        })();
        setPrevBalance(currentBal);
        updateGlobalBalance(currentBal + totalPayout);
        setShowWinModal(true);

        if (user?.id) {
          base44.entities.WalletTransaction.create({
            user_id: user.id,
            type: "deposit",
            amount: totalPayout,
            note: `Thắng ${gameTitle}`,
            category: "Thắng Casino",
            status: "approved",
          }).catch(() => null);
        }
      } else {
        toast.error(`Kết quả: Player (${pScore}) - Banker (${bScore}). Chúc bạn may mắn ván sau!`);
      }

      // Auto-reset to next betting round after 1 second
      setTimeout(() => {
        setShowWinModal(false);
        setPhase("betting");
        setPlayerCards([]);
        setBankerCards([]);
        setFlippedCards({ player: [], banker: [] });
        setBets({ player: 0, banker: 0, tie: 0, tiger: 0, player_pair: 0, banker_pair: 0 });
        setWinningZones([]);
      }, 1000);
    }, totalFlipTime);
  };

  const handleNextRound = () => {
    initAudio();
    setShowWinModal(false);
    setPhase("betting");
    setPlayerCards([]);
    setBankerCards([]);
    setFlippedCards({ player: [], banker: [] });
    setBets({
      player: 0,
      banker: 0,
      tie: 0,
      tiger: 0,
      player_pair: 0,
      banker_pair: 0,
    });
    setWinningZones([]);
  };

  const totalPlacedBet = Object.values(bets).reduce((a, b) => a + b, 0);
  const activeBetZonesCount = Object.values(bets).filter((amt) => amt > 0).length;
  const pScore = getHandScore(playerCards);
  const bScore = getHandScore(bankerCards);

  return (
    <div className="bg-black text-white min-h-screen w-full overflow-x-hidden flex flex-col font-['Be_Vietnam_Pro',sans-serif]">
      {/* CSS Styles injection for exact perspective grid & card flips */}
      <style>{`
        .perspective-grid {
          transform: perspective(700px) rotateX(36deg);
          transform-origin: bottom;
        }
        .text-shadow-strong {
          text-shadow: 1px 1px 3px rgba(0,0,0,0.9);
        }
        .card-container {
          perspective: 1000px;
        }
        .card-flipper {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.6s;
          transform-style: preserve-3d;
        }
        .card-container.flip .card-flipper {
          transform: rotateY(180deg);
        }
        .card-front, .card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .card-back {
          transform: rotateY(180deg);
        }
      `}</style>

      {/* BEGIN: Fullscreen Game Container */}
      <main
        className="relative w-full min-h-screen bg-cover bg-center overflow-hidden flex flex-col justify-between select-none"
        style={{
          backgroundImage: `url("${bgImage}")`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
        }}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />

        {/* BEGIN: Header Section */}
        <header className="relative z-10 w-full max-w-5xl mx-auto flex justify-between items-center px-4 py-3 sm:py-4">
          {/* Player Info */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold tracking-wider text-white/80">VIP CASINO</span>
              <span className="text-[#d4af37] font-extrabold text-base sm:text-xl leading-tight drop-shadow-md">
                {fmt(balance)} VNĐ
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMyBets(true)}
              title="Sổ Lệnh Giao Dịch Cược"
              className="px-3.5 h-10 rounded-full bg-black/70 border border-[#d4af37]/60 text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 backdrop-blur-md active:scale-95 transition-transform cursor-pointer shadow-lg"
            >
              <Receipt className="w-4 h-4 text-amber-400" />
              <span>Sổ Lệnh</span>
            </button>
          </div>
        </header>

        {/* Synchronized Countdown Timer */}
        <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
          <GameCountdownTimer
            phase={phase}
            onTimeZero={() => {
              if (phase === "waiting_timer") {
                triggerDealAndReveal();
              }
            }}
            manualFastForward={triggerDealAndReveal}
            gameTitle={gameTitle}
          />
        </div>
        {/* END: Header Section */}

        {/* Center Table Area (Cards + Dealer View) */}
        <div className="relative z-10 w-full flex-grow flex flex-col justify-center items-center py-2">
          {/* Cards Display Row */}
          <div className="flex flex-col gap-2 mb-2 relative z-10">
            <div className="flex justify-center items-center gap-6 sm:gap-14 bg-black/50 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 shadow-2xl">
              {/* PLAYER CARDS */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                  PLAYER {phase === "revealed" && playerCards.length > 0 ? `(${pScore} nút)` : ""}
                </span>
                <div className="flex -space-x-6 sm:-space-x-8">
                  {(playerCards.length > 0 ? playerCards : [null, null, null]).map((card, idx) => {
                    const isFlipped = flippedCards.player.includes(idx);
                    return (
                      <div key={idx} className={`card-container w-14 h-20 sm:w-16 sm:h-24 ${isFlipped ? "flip" : ""}`}>
                        <div className="card-flipper">
                          {/* Front face (Card Back) */}
                          <div className="card-front bg-white rounded-lg shadow-md border border-gray-300 flex items-center justify-center p-1">
                            <div className="w-full h-full rounded bg-gradient-to-br from-amber-600 via-amber-700 to-amber-900 border border-yellow-400 flex items-center justify-center">
                              <span className="text-[#f2ca50] text-lg sm:text-xl">♦</span>
                            </div>
                          </div>
                          {/* Back face (Card Front) */}
                          <div className="card-back bg-white rounded-lg shadow-md border border-gray-300 flex flex-col justify-between p-1.5">
                            {card ? (
                              <>
                                <div className={`text-xs sm:text-sm font-black leading-none ${card.suit.isRed ? "text-red-600" : "text-black"}`}>
                                  {card.rank}{card.suit.symbol}
                                </div>
                                <div className={`text-xl sm:text-2xl self-center ${card.suit.isRed ? "text-red-600" : "text-black"}`}>
                                  {card.suit.symbol}
                                </div>
                                <div className={`text-xs sm:text-sm font-black leading-none rotate-180 ${card.suit.isRed ? "text-red-600" : "text-black"}`}>
                                  {card.rank}{card.suit.symbol}
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* VS BADGE */}
              <div className="flex flex-col items-center">
                <span className="text-xs font-black text-amber-400 px-2 py-0.5 rounded bg-black/60 border border-amber-400/40">VS</span>
              </div>

              {/* BANKER CARDS */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                  BANKER {phase === "revealed" && bankerCards.length > 0 ? `(${bScore} nút)` : ""}
                </span>
                <div className="flex -space-x-6 sm:-space-x-8">
                  {(bankerCards.length > 0 ? bankerCards : [null, null, null]).map((card, idx) => {
                    const isFlipped = flippedCards.banker.includes(idx);
                    return (
                      <div key={idx} className={`card-container w-14 h-20 sm:w-16 sm:h-24 ${isFlipped ? "flip" : ""}`}>
                        <div className="card-flipper">
                          {/* Front face (Card Back) */}
                          <div className="card-front bg-white rounded-lg shadow-md border border-gray-300 flex items-center justify-center p-1">
                            <div className="w-full h-full rounded bg-gradient-to-br from-red-700 via-red-800 to-red-950 border border-red-400 flex items-center justify-center">
                              <span className="text-white text-lg sm:text-xl">♠</span>
                            </div>
                          </div>
                          {/* Back face (Card Front) */}
                          <div className="card-back bg-white rounded-lg shadow-md border border-gray-300 flex flex-col justify-between p-1.5">
                            {card ? (
                              <>
                                <div className={`text-xs sm:text-sm font-black leading-none ${card.suit.isRed ? "text-red-600" : "text-black"}`}>
                                  {card.rank}{card.suit.symbol}
                                </div>
                                <div className={`text-xl sm:text-2xl self-center ${card.suit.isRed ? "text-red-600" : "text-black"}`}>
                                  {card.suit.symbol}
                                </div>
                                <div className={`text-xs sm:text-sm font-black leading-none rotate-180 ${card.suit.isRed ? "text-red-600" : "text-black"}`}>
                                  {card.rank}{card.suit.symbol}
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BEGIN: Betting Area Bottom (Full Width & Multi-Zone Responsive Grid) */}
        <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center pb-5 px-3">
          {/* Multi-Bet Status & Quick Stats Bar */}
          <div className="w-full flex items-center justify-between text-xs mb-2 px-2 bg-black/60 backdrop-blur-md rounded-xl py-1.5 border border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-gray-300">Đã cược:</span>
              <strong className="text-amber-300 font-bold">{activeBetZonesCount} ô</strong>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-300">Tổng cược:</span>
              <strong className="text-yellow-400 font-mono font-black text-sm">{fmt(totalPlacedBet)} VNĐ</strong>
            </div>
          </div>

          {/* Betting Grid (3D Perspective Table - Cho phép cược nhiều ô cùng lúc) */}
          <div className="w-full perspective-grid mb-3">
            <div className="grid grid-cols-3 grid-rows-2 border-2 border-emerald-500/60 bg-emerald-950/70 backdrop-blur-sm rounded-xl overflow-hidden divide-x-2 divide-y-2 divide-emerald-500/40 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
              {/* TOP ROW */}
              {/* PLAYER PAIR */}
              <button
                onClick={() => handlePlaceBet("player_pair")}
                className={`relative flex flex-col items-center justify-center p-3 text-center transition-all cursor-pointer select-none ${
                  winningZones.includes("player_pair") ? "bg-emerald-500/60 animate-pulse" : "hover:bg-white/10 active:bg-white/20"
                }`}
              >
                <span className="text-blue-300 font-extrabold text-xs sm:text-sm uppercase tracking-wider text-shadow-strong">
                  Player Pair
                </span>
                <span className="text-white/90 text-[11px] font-mono">11:1</span>
                {bets.player_pair > 0 && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    <span className="bg-[#f2ca50] text-[#3c2f00] font-mono text-[10px] font-black px-1.5 py-0.5 rounded-full shadow">
                      {fmtShort(bets.player_pair)}
                    </span>
                    {phase === "betting" && (
                      <span
                        onClick={(e) => handleClearSingleZone("player_pair", e)}
                        className="text-red-300 hover:text-red-100 p-0.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* TIE (Hòa) */}
              <button
                onClick={() => handlePlaceBet("tie")}
                className={`relative flex flex-col items-center justify-center p-3 text-center transition-all cursor-pointer select-none ${
                  winningZones.includes("tie") ? "bg-emerald-500/60 animate-pulse" : "hover:bg-white/10 active:bg-white/20"
                }`}
              >
                <span className="text-green-300 font-extrabold text-xs sm:text-sm uppercase tracking-wider text-shadow-strong">
                  Tie (Hòa)
                </span>
                <span className="text-white/90 text-[11px] font-mono">8:1</span>
                {bets.tie > 0 && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    <span className="bg-[#f2ca50] text-[#3c2f00] font-mono text-[10px] font-black px-1.5 py-0.5 rounded-full shadow">
                      {fmtShort(bets.tie)}
                    </span>
                    {phase === "betting" && (
                      <span
                        onClick={(e) => handleClearSingleZone("tie", e)}
                        className="text-red-300 hover:text-red-100 p-0.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* BANKER PAIR */}
              <button
                onClick={() => handlePlaceBet("banker_pair")}
                className={`relative flex flex-col items-center justify-center p-3 text-center transition-all cursor-pointer select-none ${
                  winningZones.includes("banker_pair") ? "bg-emerald-500/60 animate-pulse" : "hover:bg-white/10 active:bg-white/20"
                }`}
              >
                <span className="text-red-300 font-extrabold text-xs sm:text-sm uppercase tracking-wider text-shadow-strong">
                  Banker Pair
                </span>
                <span className="text-white/90 text-[11px] font-mono">11:1</span>
                {bets.banker_pair > 0 && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    <span className="bg-[#f2ca50] text-[#3c2f00] font-mono text-[10px] font-black px-1.5 py-0.5 rounded-full shadow">
                      {fmtShort(bets.banker_pair)}
                    </span>
                    {phase === "betting" && (
                      <span
                        onClick={(e) => handleClearSingleZone("banker_pair", e)}
                        className="text-red-300 hover:text-red-100 p-0.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* BOTTOM ROW */}
              {/* PLAYER */}
              <button
                onClick={() => handlePlaceBet("player")}
                className={`relative flex flex-col items-center justify-center py-4 px-2 text-center transition-all cursor-pointer select-none ${
                  winningZones.includes("player") ? "bg-blue-600/60 animate-pulse" : "hover:bg-blue-900/30 active:bg-blue-900/50"
                }`}
              >
                <span className="text-blue-400 font-black text-base sm:text-xl uppercase tracking-widest text-shadow-strong">
                  Player
                </span>
                <span className={`text-[11px] font-mono ${odds205 ? "text-amber-300 font-extrabold" : "text-white/80"}`}>
                  {odds205 ? "1.1:1" : "1:1"}
                </span>
                {bets.player > 0 && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    <span className="bg-[#38bdf8] text-[#002117] font-mono text-[10px] font-black px-1.5 py-0.5 rounded-full shadow">
                      {fmtShort(bets.player)}
                    </span>
                    {phase === "betting" && (
                      <span
                        onClick={(e) => handleClearSingleZone("player", e)}
                        className="text-red-300 hover:text-red-100 p-0.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* TIGER (40:1) */}
              <button
                onClick={() => handlePlaceBet("tiger")}
                className={`relative flex flex-col items-center justify-center py-4 px-2 text-center transition-all cursor-pointer select-none ${
                  winningZones.includes("tiger") ? "bg-amber-500/60 animate-pulse" : "hover:bg-amber-900/30 active:bg-amber-900/50"
                }`}
              >
                <span className="text-[#d4af37] font-black text-base sm:text-xl uppercase tracking-widest text-shadow-strong">
                  Tiger
                </span>
                <span className="text-white/90 text-[11px] font-mono">40:1</span>
                {bets.tiger > 0 && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    <span className="bg-[#f2ca50] text-[#3c2f00] font-mono text-[10px] font-black px-1.5 py-0.5 rounded-full shadow">
                      {fmtShort(bets.tiger)}
                    </span>
                    {phase === "betting" && (
                      <span
                        onClick={(e) => handleClearSingleZone("tiger", e)}
                        className="text-red-300 hover:text-red-100 p-0.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* BANKER */}
              <button
                onClick={() => handlePlaceBet("banker")}
                className={`relative flex flex-col items-center justify-center py-4 px-2 text-center transition-all cursor-pointer select-none ${
                  winningZones.includes("banker") ? "bg-red-600/60 animate-pulse" : "hover:bg-red-900/30 active:bg-red-900/50"
                }`}
              >
                <span className="text-red-400 font-black text-base sm:text-xl uppercase tracking-widest text-shadow-strong">
                  Banker
                </span>
                <span className={`text-[11px] font-mono ${odds205 ? "text-amber-300 font-extrabold" : "text-white/80"}`}>
                  {odds205 ? "1.1:1" : "0.95:1"}
                </span>
                {bets.banker > 0 && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    <span className="bg-[#f87171] text-white font-mono text-[10px] font-black px-1.5 py-0.5 rounded-full shadow">
                      {fmtShort(bets.banker)}
                    </span>
                    {phase === "betting" && (
                      <span
                        onClick={(e) => handleClearSingleZone("banker", e)}
                        className="text-red-300 hover:text-red-100 p-0.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Chip Selector (Trung tính - Không ưu tiên gợi ý - Đồng đều & Thanh lịch) */}
          <div className="w-full flex items-center justify-center gap-2 sm:gap-3 mb-4 px-2 overflow-x-auto no-scrollbar py-1">
            {CHIP_VALUES.map((chip, idx) => {
              const isSelected = selectedChipIndex === idx;
              return (
                <button
                  key={chip.label}
                  onClick={() => {
                    initAudio();
                    setSelectedChipIndex(idx);
                  }}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-dashed flex items-center justify-center shadow-lg transition-all cursor-pointer ${chip.bgClass} ${
                    isSelected
                      ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-black scale-105 opacity-100 font-black"
                      : "opacity-80 hover:opacity-100 hover:scale-105"
                  }`}
                >
                  <span className="text-xs sm:text-sm font-bold tracking-tight">
                    {chip.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Action Buttons: Hủy cược, Nhân đôi x2, Xác nhận */}
          <div className="flex w-full gap-2 sm:gap-3">
            <button
              onClick={handleCancelBets}
              disabled={phase !== "betting" || totalPlacedBet === 0}
              className="flex-1 py-3 rounded-xl bg-gradient-to-b from-gray-700 to-gray-900 border border-gray-600 shadow-lg active:scale-95 transition-transform disabled:opacity-40 cursor-pointer"
            >
              <span className="text-white font-bold text-xs sm:text-sm uppercase tracking-wider text-shadow-strong">
                HỦY CƯỢC
              </span>
            </button>

            <button
              onClick={handleDoubleAllBets}
              disabled={phase !== "betting" || totalPlacedBet === 0}
              className="flex-1 py-3 rounded-xl bg-gradient-to-b from-blue-700 to-blue-950 border border-blue-500 shadow-lg active:scale-95 transition-transform disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
            >
              <Sparkles className="w-4 h-4 text-sky-300" />
              <span className="text-white font-bold text-xs sm:text-sm uppercase tracking-wider text-shadow-strong">
                NHÂN ĐÔI (X2)
              </span>
            </button>

            <button
              onClick={handleConfirmBets}
              disabled={phase !== "betting"}
              className="flex-[1.3] py-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f2ca50] to-[#b38822] text-[#3c2f00] font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-yellow-500/20 active:scale-95 transition-transform disabled:opacity-40 cursor-pointer"
            >
              <span>
                {phase === "waiting_timer"
                  ? "ĐÃ KHÓA CƯỢC"
                  : phase === "dealing"
                  ? "ĐANG CHIA BÀI..."
                  : `XÁC NHẬN ${activeBetZonesCount > 0 ? `(${activeBetZonesCount} Ô)` : ""}`}
              </span>
            </button>
          </div>
        </div>
        {/* END: Betting Area Bottom */}
      </main>

      {/* BET CONFIRMATION MODAL (BẢNG XÁC NHẬN CƯỢC CHUẨN NGÂN HÀNG) */}
      <BetConfirmationModal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={executeGameRound}
        gameTitle={gameTitle}
        bets={bets}
        totalPlacedBet={totalPlacedBet}
        balance={balance}
        timerSeconds={timerSeconds}
        phase={phase}
      />

      <AnimatePresence>
        {showWinModal && (
          <WinAnimationOverlay
            winAmount={winPayout}
            oldBalance={prevBalance}
            newBalance={balance}
            winSummary={winSummary}
            onClose={handleNextRound}
            title={`CHIẾN THẮNG ${gameTitle.toUpperCase()}!`}
          />
        )}

        {/* My Bets Drawer Ledger */}
        <MyBetsDrawer
          open={showMyBets}
          onClose={() => setShowMyBets(false)}
          currentTimerSeconds={timerSeconds}
          gameFilter={gameSlug}
        />

        {/* Banking Compliant Maintenance Overlay Screen */}
        {isMaintenance && (
          <BankingDowntimeScreen
            message={maintenanceMessage}
            gameTitle={gameTitle}
            onRetry={() => window.location.reload()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
