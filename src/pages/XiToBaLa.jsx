import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { updateUserBalance } from "@/lib/balanceSync";
import { toast } from "sonner";
import WinAnimationOverlay from "@/components/casino/WinAnimationOverlay";
import { User, Minus, Plus, Ban, Coins } from "lucide-react";

// Card Definitions
const SUITS = [
  { symbol: "♠", name: "spades", isRed: false, icon: "spade" },
  { symbol: "♥", name: "hearts", isRed: true, icon: "favorite" },
  { symbol: "♦", name: "diamonds", isRed: true, icon: "diamond" },
  { symbol: "♣", name: "clubs", isRed: false, icon: "eco" },
];

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const RANK_VALUES = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
  "J": 11, "Q": 12, "K": 13, "A": 14
};

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, value: RANK_VALUES[rank] });
    }
  }
  // Fisher-Yates Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// 3-Card Poker Hand Evaluation
function evaluate3CardHand(cards) {
  if (!cards || cards.length < 3) return { rankName: "Bài Thường", score: 0, multiplier: 1 };

  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const isFlush = sorted.every((c) => c.suit.symbol === sorted[0].suit.symbol);
  
  // Check Straight
  const v0 = sorted[0].value;
  const v1 = sorted[1].value;
  const v2 = sorted[2].value;
  
  const isNormalStraight = v0 - 1 === v1 && v1 - 1 === v2;
  const isAceLowStraight = v0 === 14 && v1 === 3 && v2 === 2; // A-3-2
  const isStraight = isNormalStraight || isAceLowStraight;

  // Check 3 of a Kind
  const isThreeOfAKind = v0 === v1 && v1 === v2;

  // Check Pair
  const isPair = v0 === v1 || v1 === v2 || v0 === v2;

  if (isStraight && isFlush) {
    return { rankName: "THÙNG PHÁ SẢNH", score: 6000 + v0, multiplier: 5, type: "straight_flush" };
  }
  if (isThreeOfAKind) {
    return { rankName: "SÁM CỔ (BA CÂY)", score: 5000 + v0, multiplier: 4, type: "three_kind" };
  }
  if (isStraight) {
    const straightHigh = isAceLowStraight ? 3 : v0;
    return { rankName: "SẢNH", score: 4000 + straightHigh, multiplier: 3, type: "straight" };
  }
  if (isFlush) {
    return { rankName: "THÙNG", score: 3000 + v0 * 10 + v1, multiplier: 2, type: "flush" };
  }
  if (isPair) {
    const pairVal = v0 === v1 ? v0 : v1 === v2 ? v1 : v0;
    return { rankName: "ĐÔI", score: 2000 + pairVal * 10, multiplier: 1.5, type: "pair" };
  }

  // High card / Point calculation % 10
  const totalPoints = cards.reduce((sum, c) => {
    if (["J", "Q", "K"].includes(c.rank)) return sum + 10;
    if (c.rank === "A") return sum + 1;
    return sum + parseInt(c.rank);
  }, 0);
  const pointScore = totalPoints % 10;

  return {
    rankName: pointScore === 0 ? "10 ĐIỂM" : `${pointScore} ĐIỂM`,
    score: 1000 + pointScore * 100 + v0,
    multiplier: 1,
    type: "high_card"
  };
}

const fmt = (n) => new Intl.NumberFormat("vi-VN").format(n) + " đ";

export default function XiToBaLa() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Local balance state initialized with real user balance
  const [balance, setBalance] = useState(() => {
    if (user?.balance !== undefined) return Number(user.balance);
    const localUserStr = localStorage.getItem("base44_local_user");
    if (localUserStr) {
      try {
        const u = JSON.parse(localUserStr);
        if (u && u.balance !== undefined) return Number(u.balance);
      } catch (e) {}
    }
    const local = localStorage.getItem("vinclub_xito_balance");
    return local ? parseInt(local) : 0;
  });

  const [betAmount, setBetAmount] = useState(50000);
  const [pot, setPot] = useState(1450000);
  const [phase, setPhase] = useState("betting"); // 'betting' | 'dealt' | 'revealed'
  
  // Hands
  const [playerCards, setPlayerCards] = useState([]);
  const [dealerCards, setDealerCards] = useState([]);
  const [opponents, setOpponents] = useState([
    { id: 1, name: "ANH_TUAN", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80", status: "active", bet: 150000 },
    { id: 2, name: "THÀNH_NAM", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&q=80", status: "folded", bet: 50000 },
    { id: 3, name: "MR_LONG", avatar: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100&q=80", status: "active", bet: 210000 },
  ]);

  const [isRevealed, setIsRevealed] = useState(false);
  const [showWinOverlay, setShowWinOverlay] = useState(false);
  const [winPayout, setWinPayout] = useState(0);
  const [winHandLabel, setWinHandLabel] = useState("");
  const [prevBal, setPrevBal] = useState(0);

  // Refs for particle canvas & audio
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const balanceTargetRef = useRef(null);
  const winMessageTargetRef = useRef(null);

  // Sync user balance when auth or storage changes
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

  // Update user balance globally
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

  // Web Audio Ching sound effect
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  };

  const playChingSound = () => {
    if (!audioCtxRef.current) return;
    try {
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(2200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  // Flying Chip Animation Function
  const triggerFlyingChips = useCallback(() => {
    const winTarget = winMessageTargetRef.current;
    const balanceTarget = balanceTargetRef.current;

    if (!winTarget || !balanceTarget) return;

    const winRect = winTarget.getBoundingClientRect();
    const targetRect = balanceTarget.getBoundingClientRect();

    const startX = winRect.left + winRect.width / 2;
    const startY = winRect.top + winRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        const chip = document.createElement("div");
        chip.className = "flying-chip";
        document.body.appendChild(chip);

        const controlX = startX + (endX - startX) * 0.5 + (Math.random() - 0.5) * 300;
        const controlY = startY + (endY - startY) * 0.1 - 150;

        const duration = 900 + Math.random() * 400;
        const startTime = performance.now();

        function animate(currentTime) {
          const elapsed = currentTime - startTime;
          const t = Math.min(elapsed / duration, 1);

          const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * controlX + t * t * endX;
          const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * controlY + t * t * endY;

          chip.style.left = `${x}px`;
          chip.style.top = `${y}px`;
          chip.style.transform = `scale(${1.2 - t * 0.5}) rotate(${t * 720}deg)`;
          chip.style.opacity = t > 0.8 ? String(1 - (t - 0.8) * 5) : "1";

          if (t < 1) {
            requestAnimationFrame(animate);
          } else {
            chip.remove();
            playChingSound();
            if (balanceTargetRef.current) {
              balanceTargetRef.current.classList.remove("balance-pulse");
              void balanceTargetRef.current.offsetWidth;
              balanceTargetRef.current.classList.add("balance-pulse");
            }
          }
        }
        requestAnimationFrame(animate);
      }, 150 + i * 110);
    }
  }, []);

  // Canvas Confetti Animation Effect
  useEffect(() => {
    let animId;
    let particles = [];

    if (showWinOverlay && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      class Particle {
        constructor() {
          this.reset();
        }
        reset() {
          this.x = Math.random() * canvas.width;
          this.y = -Math.random() * 100;
          this.size = Math.random() * 8 + 4;
          this.speedX = (Math.random() - 0.5) * 3;
          this.speedY = Math.random() * 5 + 3;
          this.color = ["#f2ca50", "#d4af37", "#ffe088", "#ffffff"][Math.floor(Math.random() * 4)];
          this.rotation = Math.random() * Math.PI * 2;
          this.rotationSpeed = (Math.random() - 0.5) * 0.2;
          this.type = Math.floor(Math.random() * 3);
        }
        update() {
          this.y += this.speedY;
          this.x += this.speedX;
          this.rotation += this.rotationSpeed;
          if (this.y > canvas.height) this.reset();
        }
        draw() {
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.rotate(this.rotation);
          ctx.fillStyle = this.color;

          if (this.type === 0) {
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size / 2);
          } else if (this.type === 1) {
            ctx.beginPath();
            ctx.moveTo(0, -this.size);
            ctx.lineTo(this.size / 2, 0);
            ctx.lineTo(0, this.size);
            ctx.lineTo(-this.size / 2, 0);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
              ctx.lineTo(
                Math.cos(((18 + i * 72) * Math.PI) / 180) * this.size,
                Math.sin(((18 + i * 72) * Math.PI) / 180) * this.size
              );
              ctx.lineTo(
                Math.cos(((54 + i * 72) * Math.PI) / 180) * (this.size / 2),
                Math.sin(((54 + i * 72) * Math.PI) / 180) * (this.size / 2)
              );
            }
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      }

      for (let i = 0; i < 140; i++) {
        particles.push(new Particle());
      }

      const loop = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p) => {
          p.update();
          p.draw();
        });
        animId = requestAnimationFrame(loop);
      };
      loop();
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [showWinOverlay]);

  // Initial Deal
  const dealNewRound = useCallback(() => {
    if (user?.is_locked) {
      toast.error("Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ CSKH để được hỗ trợ.");
      return;
    }
    if (betAmount > balance) {
      toast.error("Số dư ví không đủ để đặt cược!");
      return;
    }

    const deck = buildDeck();
    const pHand = [deck.pop(), deck.pop(), deck.pop()];
    const dHand = [deck.pop(), deck.pop(), deck.pop()];

    setPlayerCards(pHand);
    setDealerCards(dHand);
    setIsRevealed(false);
    setShowWinOverlay(false);
    setPhase("dealt");

    const currentPot = betAmount * 4 + 250000;
    setPot(currentPot);

    // Deduct initial bet
    updateGlobalBalance(balance - betAmount);
  }, [betAmount, balance, updateGlobalBalance, user?.is_locked]);

  // Auto deal on first mount
  useEffect(() => {
    dealNewRound();
  }, []);

  // Handle Bet Stepper
  const handleIncreaseBet = () => {
    setBetAmount((prev) => Math.min(prev + 50000, 2000000));
  };
  const handleDecreaseBet = () => {
    setBetAmount((prev) => Math.max(prev - 25000, 25000));
  };

  // Action: Fold / Bỏ Bài
  const handleFold = () => {
    toast.info("Bạn đã bỏ bài ván này!");
    setShowWinOverlay(false);
    dealNewRound();
  };

  // Action: Bet / Tăng Cược
  const handleAddBet = () => {
    if (balance < 50000) {
      toast.error("Số dư không đủ để tăng cược!");
      return;
    }
    setBetAmount((prev) => prev + 50000);
    setPot((prev) => prev + 150000);
    updateGlobalBalance(balance - 50000);
    toast.success("Đã tăng cược thêm 50.000 VNĐ vào Pot!");
  };

  // Action: Reveal / Mở Bài
  const handleReveal = () => {
    initAudio();

    if (isRevealed) {
      // RESET / VÁN MỚI
      dealNewRound();
      return;
    }

    setIsRevealed(true);
    setPhase("revealed");

    const pEval = evaluate3CardHand(playerCards);
    const dEval = evaluate3CardHand(dealerCards);

    setTimeout(() => {
      if (pEval.score >= dEval.score) {
        // Player Wins!
        const winValue = Math.round(pot * pEval.multiplier);
        setWinPayout(winValue);
        setWinHandLabel(pEval.rankName);
        setPrevBal(balance);
        updateGlobalBalance(balance + winValue);
        setShowWinOverlay(true);
        triggerFlyingChips();

        // Create transaction history record
        if (user?.id) {
          base44.entities.WalletTransaction.create({
            user_id: user.id,
            type: "deposit",
            amount: winValue,
            note: `Thắng Xì Tố Ba Lá (${pEval.rankName})`,
            category: "Thắng Casino",
            status: "approved"
          }).catch(() => null);
        }
      } else {
        // Dealer Wins
        toast.error(`Nhà cái thắng với bài: ${dEval.rankName}`);
      }
    }, 600);
  };

  const handleDismissWin = () => {
    initAudio();
    setShowWinOverlay(false);
    setIsRevealed(false);
    dealNewRound();
  };

  return (
    <div className="relative w-full min-h-screen bg-[#131313] text-[#e5e2e1] font-heading select-none overflow-x-hidden pb-16 flex flex-col justify-between">
      {/* CSS Rules */}
      <style>{`
        .perspective { perspective: 1000px; }
        .card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          transform-style: preserve-3d;
        }
        .card-face {
          position: absolute;
          width: 100%;
          height: 100%;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          border-radius: 0.5rem;
        }
        .card-back {
          background-color: #ffffff;
          border: 1px solid rgba(242, 202, 80, 0.5);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
        }
        .card-front {
          background-color: #f8f9fa;
          transform: rotateY(180deg);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 6px;
          color: #131313;
        }
        .flipped .card-inner {
          transform: rotateY(180deg);
        }
        .glow-effect {
          box-shadow: 0 0 20px 5px rgba(242, 202, 80, 0);
          transition: box-shadow 0.6s ease-in-out;
        }
        .flipped .glow-effect {
          box-shadow: 0 0 30px 10px rgba(242, 202, 80, 0.4);
        }
        .winning-glow {
          animation: winning-pulse 1.5s infinite alternate;
        }
        @keyframes winning-pulse {
          from { box-shadow: 0 0 10px 2px rgba(242, 202, 80, 0.4); }
          to { box-shadow: 0 0 40px 15px rgba(242, 202, 80, 0.85); }
        }
        @keyframes sparkle {
          0% { transform: scale(0) rotate(0deg); opacity: 0; }
          50% { transform: scale(1.2) rotate(180deg); opacity: 1; }
          100% { transform: scale(0) rotate(360deg); opacity: 0; }
        }
        .sparkle {
          position: absolute;
          width: 10px;
          height: 10px;
          background: #f2ca50;
          border-radius: 50%;
          pointer-events: none;
          z-index: 50;
          display: none;
        }
        .flipped .sparkle {
          display: block;
          animation: sparkle 0.8s ease-out forwards;
        }
        canvas#confetti-canvas {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 100;
        }
        .victory-shine {
          mask-image: linear-gradient(60deg, black 25%, rgba(0,0,0,0.2) 50%, black 75%);
          mask-size: 400% 100%;
          mask-repeat: no-repeat;
          animation: shine-sweep 3s infinite linear;
        }
        @keyframes shine-sweep {
          0% { mask-position: 150% 0%; }
          100% { mask-position: -50% 0%; }
        }
        .flying-chip {
          position: fixed;
          width: 24px;
          height: 24px;
          background: radial-gradient(circle at center, #f2ca50 40%, #d4af37 100%);
          border: 2px dashed rgba(0,0,0,0.2);
          border-radius: 50%;
          pointer-events: none;
          z-index: 120;
          box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        .balance-pulse {
          animation: balance-pulse-anim 0.35s ease-out;
        }
        @keyframes balance-pulse-anim {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.25); filter: brightness(1.2); }
        }
        @keyframes shimmer {
          100% { transform: translateX(200%); }
        }
      `}</style>

      {/* Particle Canvas */}
      <canvas id="confetti-canvas" ref={canvasRef} />

      {/* Victory Celebration Overlay */}
      {showWinOverlay && (
        <WinAnimationOverlay
          winAmount={winPayout}
          oldBalance={prevBal}
          newBalance={balance}
          winSummary={winHandLabel ? [`Thế bài thắng: ${winHandLabel}`] : []}
          onClose={handleDismissWin}
          title="CHIẾN THẮNG XÌ TỐ!"
        />
      )}

      {/* Header Bar */}
      <header className="sticky top-0 z-50 w-full bg-[#131313]/90 backdrop-blur-xl border-b border-[#353534]">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-[14px] sm:text-base font-extrabold uppercase tracking-wider text-[#f2ca50] truncate">
            Xì Tố Ba Lá
          </h1>

          <div className="flex items-center gap-2">
            <span className="text-[#f2ca50] font-bold text-[12px] sm:text-sm font-mono">
              {fmt(balance)}
            </span>
            <div
              ref={balanceTargetRef}
              className="w-8 h-8 rounded-full bg-[#f2ca50] flex items-center justify-center ring-2 ring-[#f2ca50]/30 shadow-md transition-transform text-[#3c2f00]"
            >
              <User className="w-4 h-4" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Game Table Container */}
      <main className="relative w-full max-w-2xl mx-auto pt-2 flex flex-col items-center flex-1 justify-between">
        <div className="relative w-full aspect-[3/4] max-h-[580px] flex items-center justify-center p-3">
          {/* Emerald Felt Table */}
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 aspect-[4/5] rounded-[130px] shadow-[inset_0_0_90px_rgba(0,0,0,0.85),0_15px_40px_rgba(0,0,0,0.6)] overflow-hidden bg-[#0a4d33]">
            {/* Felt Texture Overlay */}
            <div
              className="absolute inset-0 opacity-25 mix-blend-overlay"
              style={{
                backgroundImage: `url('https://www.transparenttextures.com/patterns/felt.png')`,
              }}
            />
            {/* Table Rail */}
            <div className="absolute inset-0 border-[10px] border-[#353534] rounded-[130px] opacity-40 pointer-events-none" />
            <div className="absolute inset-[8px] border border-[#f2ca50]/20 rounded-[120px] pointer-events-none" />

            {/* Center Pot & Chips */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
              <div className="relative w-20 h-20">
                <div className="absolute bottom-1 left-3 w-9 h-9 rounded-full bg-[#f2ca50] border-2 border-[#ffe088] shadow-md flex items-center justify-center">
                  <span className="text-[8px] font-mono font-bold text-[#3c2f00]">50K</span>
                </div>
                <div className="absolute bottom-3 right-1 w-9 h-9 rounded-full bg-[#ffb4ab] border-2 border-[#ffdad6] shadow-md flex items-center justify-center">
                  <span className="text-[8px] font-mono font-bold text-[#690005]">100K</span>
                </div>
                <div className="absolute top-1 left-5 w-9 h-9 rounded-full bg-[#95d3ba] border-2 border-[#b0f0d6] shadow-md flex items-center justify-center">
                  <span className="text-[8px] font-mono font-bold text-[#003829]">200K</span>
                </div>
              </div>

              <div className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-[#f2ca50]/30 shadow-lg">
                <span className="text-[#f2ca50] font-mono text-[10px] font-bold tracking-wider">
                  POT: {fmt(pot)}
                </span>
              </div>
            </div>
          </div>

          {/* Opponent 1: Top Left */}
          <div className="absolute top-[12%] left-[10%] flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full ring-2 ring-[#99907c] p-0.5 bg-[#131313] shadow-md overflow-hidden">
              <img className="w-full h-full rounded-full object-cover" src={opponents[0].avatar} alt={opponents[0].name} />
            </div>
            <div className="bg-[#201f1f]/90 px-2 py-0.5 rounded shadow-md">
              <span className="text-[9px] font-mono text-[#e5e2e1] truncate w-14 text-center block">
                {opponents[0].name}
              </span>
            </div>
          </div>

          {/* Opponent 2: Top Right (Folded) */}
          <div className="absolute top-[12%] right-[10%] flex flex-col items-center gap-1 opacity-60">
            <div className="w-12 h-12 rounded-full ring-2 ring-[#99907c] p-0.5 bg-[#131313] overflow-hidden">
              <img className="w-full h-full rounded-full object-cover" src={opponents[1].avatar} alt={opponents[1].name} />
            </div>
            <div className="bg-[#201f1f]/90 px-2 py-0.5 rounded shadow-md">
              <span className="text-[9px] font-mono text-[#99907c] truncate w-14 text-center block italic">
                FOLDED
              </span>
            </div>
          </div>

          {/* Opponent 3 / Dealer: Middle Left */}
          <div className="absolute top-[42%] left-1 flex items-center gap-2">
            <div className={`w-12 h-12 rounded-full p-0.5 bg-[#131313] shadow-md overflow-hidden ${isRevealed ? "ring-2 ring-[#f2ca50]" : "ring-2 ring-[#f2ca50] animate-pulse"}`}>
              <div className="w-full h-full rounded-full bg-gradient-to-br from-[#d4af37] to-[#8d711a] flex items-center justify-center font-bold text-[#3c2f00] text-[11px]">
                CÁI
              </div>
            </div>
            <div className="flex flex-col">
              <div className="bg-[#f2ca50] px-2 py-0.5 rounded shadow-md">
                <span className="text-[9px] font-mono font-bold text-[#3c2f00]">
                  {isRevealed ? evaluate3CardHand(dealerCards).rankName : "NHÀ CÁI"}
                </span>
              </div>
            </div>
          </div>

          {/* Opponent 4: Middle Right */}
          <div className="absolute top-[42%] right-1 flex flex-row-reverse items-center gap-2">
            <div className="w-12 h-12 rounded-full ring-2 ring-[#99907c] p-0.5 bg-[#131313] shadow-md overflow-hidden">
              <img className="w-full h-full rounded-full object-cover" src={opponents[2].avatar} alt={opponents[2].name} />
            </div>
            <div className="flex flex-col items-end">
              <div className="bg-[#201f1f]/90 px-2 py-0.5 rounded shadow-md">
                <span className="text-[9px] font-mono text-[#e5e2e1] truncate block">
                  {opponents[2].name}
                </span>
              </div>
            </div>
          </div>

          {/* Player Cards Hand Area */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
            {/* Cards Stack */}
            <div className={`flex items-center justify-center -space-x-10 mb-4 perspective ${isRevealed ? "flipped" : ""}`}>
              {playerCards.map((card, idx) => {
                const rotations = ["rotate-[-10deg]", "translate-y-[-6px]", "rotate-[10deg]"];
                return (
                  <div
                    key={idx}
                    className={`game-card relative w-20 h-32 ${rotations[idx]} transition-all duration-300`}
                  >
                    <div className={`card-inner glow-effect ${showWinOverlay ? "winning-glow" : ""}`}>
                      {/* Back */}
                      <div className="card-face card-back flex items-center justify-center p-1.5 overflow-hidden">
                        <div className="w-full h-full rounded border border-[#f2ca50]/30 bg-white flex items-center justify-center p-1">
                          <img
                            src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR0jMW1BZoSLy3bt4Yki1ML9jert8dBdV3LEB23ITEnmg&s=10"
                            alt="VinClub Logo"
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      </div>

                      {/* Front */}
                      <div className="card-face card-front">
                        <div className={`flex flex-col items-start leading-none ${card.suit.isRed ? "text-[#c1272d]" : "text-[#131313]"}`}>
                          <span className="font-extrabold text-[15px]">{card.rank}</span>
                          <span className="text-[13px] font-bold">
                            {card.suit.symbol}
                          </span>
                        </div>

                        <div className="self-center">
                          <span className={`text-[26px] font-bold ${card.suit.isRed ? "text-[#c1272d]" : "text-[#131313]"}`}>
                            {card.suit.symbol}
                          </span>
                        </div>

                        <div className={`flex flex-col items-end leading-none rotate-180 ${card.suit.isRed ? "text-[#c1272d]" : "text-[#131313]"}`}>
                          <span className="font-extrabold text-[15px]">{card.rank}</span>
                          <span className="text-[13px] font-bold">
                            {card.suit.symbol}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="sparkle" style={{ top: "30%", left: "30%" }} />
                  </div>
                );
              })}
            </div>

            {/* Hand Rank Indicator when revealed */}
            {isRevealed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#f2ca50] text-[#3c2f00] px-3 py-0.5 rounded-full font-mono text-[10px] font-extrabold shadow-md mb-2 border border-[#ffe088]"
              >
                {evaluate3CardHand(playerCards).rankName}
              </motion.div>
            )}
          </div>
        </div>

        {/* Bottom Betting & Action Controls */}
        <div className="w-full px-4 pb-6 pt-2 bg-gradient-to-t from-[#131313] via-[#131313]/90 to-transparent">
          {/* Bet Stepper */}
          <div className="flex items-center justify-between mb-4 bg-[#1c1b1b] rounded-full p-1 border border-[#4d4635]/30 shadow-inner">
            <button
              onClick={handleDecreaseBet}
              className="w-11 h-11 flex items-center justify-center text-[#f2ca50] active:scale-90 transition-transform cursor-pointer"
            >
              <Minus className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center">
              <span className="text-[9px] font-mono text-[#d0c5af] opacity-70 tracking-widest">
                MỨC CƯỢC
              </span>
              <span className="text-[14px] font-bold text-[#f2ca50] font-mono">
                {fmt(betAmount)}
              </span>
            </div>

            <button
              onClick={handleIncreaseBet}
              className="w-11 h-11 flex items-center justify-center text-[#f2ca50] active:scale-90 transition-transform cursor-pointer"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Action Buttons Grid */}
          <div className="grid grid-cols-3 gap-2.5 h-13">
            {/* FOLD Button */}
            <button
              onClick={handleFold}
              className="flex flex-col items-center justify-center bg-[#2a2a2a] hover:bg-[#353534] rounded-xl text-[#ffb4ab] active:scale-95 transition-all shadow-md cursor-pointer"
            >
              <Ban className="w-4 h-4" />
              <span className="text-[9px] font-mono font-bold mt-0.5">BỎ BÀI</span>
            </button>

            {/* REVEAL / RESET Button */}
            <button
              onClick={handleReveal}
              className="relative flex items-center justify-center bg-gradient-to-b from-[#f2ca50] to-[#d4af37] rounded-xl text-[#554300] shadow-[0_4px_0_0_#574500] active:shadow-none active:translate-y-1 transition-all overflow-hidden cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-transparent -skew-x-12 translate-x-[-100%] animate-[shimmer_2s_infinite]" />
              <span className="text-[12px] font-extrabold uppercase tracking-wider">
                {isRevealed ? "VÁN MỚI" : "MỞ BÀI"}
              </span>
            </button>

            {/* BET / CƯỢC TĂNG Button */}
            <button
              onClick={handleAddBet}
              className="flex flex-col items-center justify-center bg-[#2a2a2a] hover:bg-[#353534] rounded-xl text-[#f2ca50] active:scale-95 transition-all shadow-md cursor-pointer"
            >
              <Coins className="w-4 h-4" />
              <span className="text-[9px] font-mono font-bold mt-0.5">TĂNG CƯỢC</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
