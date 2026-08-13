import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

/**
 * Synchronized Countdown Timer Component
 * Computes synchronized 4:59 (299s) countdown from Date.now() Epoch
 * to ensure exact synchronization across all client browsers/devices.
 */
export const GAME_CYCLE_SECONDS = 300; // 5 minute total cycle (299 down to 0 = 4:59)

export function getSyncedTimerSeconds() {
  const nowInSec = Math.floor(Date.now() / 1000);
  const elapsedInCycle = nowInSec % GAME_CYCLE_SECONDS;
  return 299 - elapsedInCycle;
}

export default function GameCountdownTimer({
  phase,
  onTimeZero,
  manualFastForward,
  gameTitle = "CASINO SYNC",
}) {
  const [secondsLeft, setSecondsLeft] = useState(getSyncedTimerSeconds);
  const [isManualOverride, setIsManualOverride] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isManualOverride) {
        const synced = getSyncedTimerSeconds();
        setSecondsLeft(synced);

        if (synced === 0 && onTimeZero) {
          onTimeZero();
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isManualOverride, onTimeZero]);

  // Handle manual skip for testing/instant resolution
  const handleFastForward = () => {
    setIsManualOverride(true);
    setSecondsLeft(0);
    if (manualFastForward) {
      manualFastForward();
    }
    if (onTimeZero) {
      onTimeZero();
    }
    // Resume synced clock after 8s
    setTimeout(() => {
      setIsManualOverride(false);
    }, 8000);
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  // Progress percentage (299s max)
  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / 299) * 100));

  // Color warning when time < 30s
  const isLowTime = secondsLeft <= 30;

  return (
    <div className="relative z-20 flex flex-col items-center mt-1 gap-1.5 select-none">
      {/* Visual Timer Box */}
      <div className="bg-gradient-to-b from-[#1a1813] via-[#0d0c0a] to-[#050504] border-2 border-[#d4af37]/60 rounded-xl px-5 py-2.5 flex flex-col items-center shadow-[0_0_20px_rgba(212,175,55,0.25)] relative overflow-hidden min-w-[170px]">
        {/* Synchronized Header Badge */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[9px] text-[#d4af37] font-black uppercase tracking-widest">
            {gameTitle} • LIVE 4:59
          </span>
        </div>

        {/* Digital LED Display */}
        <div className="flex items-center gap-1">
          <span
            id="countdown-timer"
            className={`text-2xl font-black font-mono tracking-tighter transition-colors duration-300 ${
              isLowTime
                ? "text-red-500 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                : "text-[#39ff14] drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]"
            }`}
          >
            {formattedTime}
          </span>
        </div>

        {/* Progress Bar Line */}
        <div className="w-full h-1 bg-gray-800 rounded-full mt-1.5 overflow-hidden border border-white/10">
          <motion.div
            className={`h-full rounded-full ${
              isLowTime
                ? "bg-gradient-to-r from-red-600 to-amber-500"
                : "bg-gradient-to-r from-[#39ff14] to-emerald-400"
            }`}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.5, ease: "linear" }}
          />
        </div>
      </div>

      {/* Locked Bet Status Overlay */}
      {phase === "waiting_timer" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-amber-950/95 border border-amber-400/80 rounded-full px-3.5 py-1 flex items-center gap-2 text-[10px] text-amber-200 font-bold shadow-xl backdrop-blur-md"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Đã khóa cược! Chờ 00:00 lật bài</span>
          <button
            onClick={handleFastForward}
            className="bg-gradient-to-r from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-black px-2 py-0.5 rounded text-[9px] font-black uppercase transition-all ml-1 shadow active:scale-95"
          >
            ⏩ Hết giờ ngay
          </button>
        </motion.div>
      )}
    </div>
  );
}
