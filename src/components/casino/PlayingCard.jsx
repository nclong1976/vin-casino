import React from "react";
import { motion } from "framer-motion";

const SUIT_COLOR = { "♠": "#1a1a1a", "♣": "#1a1a1a", "♥": "#c1272d", "♦": "#c1272d" };

export default function PlayingCard({ card, revealed, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 220, damping: 20 }}
      className="relative w-[56px] h-[80px] shrink-0"
      style={{ perspective: 800 }}
    >
      <motion.div
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ duration: 0.45, delay: revealed ? delay : 0, type: "spring", stiffness: 180, damping: 22 }}
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Back */}
        <div
          className="absolute inset-0 rounded-lg border border-[#caa45a]/50 bg-white shadow-md flex items-center justify-center p-1 overflow-hidden"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <div className="w-full h-full rounded-md border border-[#f2ca50]/30 bg-white flex items-center justify-center p-1">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR0jMW1BZoSLy3bt4Yki1ML9jert8dBdV3LEB23ITEnmg&s=10"
              alt="Logo"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
        {/* Front */}
        <div
          className="absolute inset-0 rounded-lg bg-gradient-to-b from-white to-[#f7f3ea] shadow-md flex flex-col justify-between p-1"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="flex items-start justify-between leading-none">
            <span className="text-[12px] font-bold" style={{ color: SUIT_COLOR[card?.suit] || "#1a1a1a" }}>
              {card?.rank}
            </span>
            <span className="text-[10px]" style={{ color: SUIT_COLOR[card?.suit] || "#1a1a1a" }}>
              {card?.suit}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[26px]" style={{ color: SUIT_COLOR[card?.suit] || "#1a1a1a" }}>
              {card?.suit}
            </span>
          </div>
          <div className="flex items-end justify-between leading-none rotate-180">
            <span className="text-[12px] font-bold" style={{ color: SUIT_COLOR[card?.suit] || "#1a1a1a" }}>
              {card?.rank}
            </span>
            <span className="text-[10px]" style={{ color: SUIT_COLOR[card?.suit] || "#1a1a1a" }}>
              {card?.suit}
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}