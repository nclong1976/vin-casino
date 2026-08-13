import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Sparkles, TrendingUp, ArrowRight, CheckCircle2, Landmark, BadgeDollarSign, ShieldCheck, Coins } from "lucide-react";

// Helper to format currency
const fmt = (num) => new Intl.NumberFormat("vi-VN").format(Math.max(0, Math.floor(num))) + " ₫";

// Web Audio API Victory Chime
function playVictoryAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.value = freq;

      const startTime = ctx.currentTime + index * 0.12;
      const duration = 0.4;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });

    // Coin jingle overlay
    setTimeout(() => {
      [1200, 1600, 2000, 2400].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.06 + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.06);
        osc.stop(ctx.currentTime + idx * 0.06 + 0.1);
      });
    }, 450);
  } catch (e) {
    console.log("Audio not allowed without user interaction yet");
  }
}

export default function WinAnimationOverlay({
  winAmount = 0,
  oldBalance = 0,
  newBalance = 0,
  winSummary = [],
  onClose,
  title = "CHIẾN THẮNG TRONG VÁN!",
}) {
  const [displayWin, setDisplayWin] = useState(0);
  const [displayBalance, setDisplayBalance] = useState(oldBalance || Math.max(0, newBalance - winAmount));
  const [isCounterFinished, setIsCounterFinished] = useState(false);
  const animRef = useRef(null);

  // Generate random particles for coin explosion animation
  const particles = useRef(
    Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 360,
      y: (Math.random() - 0.8) * 450,
      rotate: Math.random() * 720,
      scale: 0.6 + Math.random() * 0.8,
      delay: Math.random() * 0.3,
      duration: 1.8 + Math.random() * 1.2,
      type: i % 4,
    }))
  ).current;

  useEffect(() => {
    playVictoryAudio();

    const startWin = 0;
    const endWin = winAmount;
    const startBal = oldBalance || Math.max(0, newBalance - winAmount);
    const endBal = newBalance;

    const duration = 1800; // ms
    const startTime = performance.now();

    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

    const updateCounters = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(progress);

      setDisplayWin(Math.floor(startWin + (endWin - startWin) * eased));
      setDisplayBalance(Math.floor(startBal + (endBal - startBal) * eased));

      if (progress < 1) {
        animRef.current = requestAnimationFrame(updateCounters);
      } else {
        setDisplayWin(endWin);
        setDisplayBalance(endBal);
        setIsCounterFinished(true);
      }
    };

    animRef.current = requestAnimationFrame(updateCounters);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [winAmount, oldBalance, newBalance]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-hidden font-heading"
      >
        {/* ROTATING GOLDEN RAYS BACKGROUND */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
          className="absolute w-[600px] h-[600px] rounded-full opacity-20 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-400 via-yellow-600/40 to-transparent blur-xl"
        />

        {/* EXPLODING BANKING PARTICLES */}
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0, rotate: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: p.x,
              y: p.y,
              scale: [0, p.scale, p.scale, 0.2],
              rotate: p.rotate,
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: "easeOut",
              repeat: Infinity,
              repeatDelay: 1,
            }}
            className="absolute pointer-events-none drop-shadow-[0_0_10px_rgba(242,202,80,0.8)]"
          >
            {p.type === 0 && <Coins className="w-6 h-6 text-amber-400" />}
            {p.type === 1 && <BadgeDollarSign className="w-6 h-6 text-[#ffd700]" />}
            {p.type === 2 && <Landmark className="w-5 h-5 text-amber-300" />}
            {p.type === 3 && <ShieldCheck className="w-5 h-5 text-emerald-400" />}
          </motion.div>
        ))}

        {/* MAIN WINNER MODAL BOX */}
        <motion.div
          initial={{ scale: 0.7, y: 40 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.7, y: 40 }}
          transition={{ type: "spring", damping: 18, stiffness: 220 }}
          className="relative w-full max-w-sm bg-gradient-to-b from-[#1a1711] via-[#12100a] to-[#0a0905] border-2 border-[#f2ca50] rounded-3xl p-6 flex flex-col items-center text-center shadow-[0_0_60px_rgba(242,202,80,0.35)]"
        >
          {/* TOP EMBLEM / TROPHY ICON */}
          <div className="relative mb-3">
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -inset-3 bg-[#f2ca50]/30 rounded-full blur-md"
            />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-b from-[#f2ca50] to-[#b38822] p-0.5 shadow-xl">
              <div className="w-full h-full rounded-full bg-[#181308] flex items-center justify-center text-[#f2ca50]">
                <Trophy className="w-8 h-8 animate-bounce" />
              </div>
            </div>
          </div>

          <motion.h2
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xl sm:text-2xl font-black italic tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#ffe885] via-[#f2ca50] to-[#d4af37] uppercase drop-shadow"
          >
            {title}
          </motion.h2>

          <p className="text-[10.5px] text-amber-200/80 font-bold uppercase tracking-widest mt-0.5 mb-3 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> THƯỞNG THẮNG TRỰC TIẾP <Sparkles className="w-3 h-3 text-amber-400" />
          </p>

          {/* DYNAMIC ROLLING WIN AMOUNT DISPLAY */}
          <motion.div
            animate={isCounterFinished ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 0.3 }}
            className="w-full bg-gradient-to-r from-emerald-950/90 via-emerald-900/90 to-emerald-950/90 border-2 border-emerald-500/60 rounded-2xl p-3.5 mb-3 shadow-[0_0_20px_rgba(16,185,129,0.3)] flex flex-col items-center"
          >
            <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-widest mb-0.5">
              TỔNG TIỀN THẮNG
            </span>
            <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]">
              + {fmt(displayWin)}
            </span>
          </motion.div>

          {/* DYNAMIC BALANCE UPDATE TICKER */}
          <div className="w-full bg-black/60 rounded-xl p-2.5 border border-[#f2ca50]/30 mb-3 text-xs font-mono space-y-1">
            <div className="flex justify-between items-center text-gray-400">
              <span className="text-[10px] font-sans font-bold">Số dư cũ:</span>
              <span className="line-through opacity-70">{fmt(oldBalance)}</span>
            </div>
            <div className="flex justify-between items-center text-amber-300 font-bold border-t border-white/10 pt-1">
              <span className="text-[10px] font-sans font-bold flex items-center gap-1 text-emerald-400">
                <TrendingUp className="w-3 h-3 text-emerald-400" /> Số dư ví mới:
              </span>
              <motion.span
                animate={isCounterFinished ? { scale: [1, 1.1, 1], color: ["#f2ca50", "#34d399", "#f2ca50"] } : {}}
                className="text-sm text-yellow-300 font-black"
              >
                {fmt(displayBalance)}
              </motion.span>
            </div>
          </div>

          {/* WIN SUMMARY BREAKDOWN LIST */}
          {winSummary && winSummary.length > 0 && (
            <div className="w-full text-left space-y-1 mb-4 bg-white/5 p-2.5 rounded-xl border border-white/10 text-[11px] font-mono text-gray-200 max-h-28 overflow-y-auto">
              {winSummary.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-amber-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{item}</span>
                </div>
              ))}
            </div>
          )}

          {/* CONTINUE BUTTON */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#f2ca50] via-[#ffd966] to-[#d4af37] text-[#3c2f00] font-black text-xs uppercase tracking-widest shadow-xl shadow-yellow-500/20 active:scale-95 transition-transform flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>TIẾP TỤC BÀI CƯỢC</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
