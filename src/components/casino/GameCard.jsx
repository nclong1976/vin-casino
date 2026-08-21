import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Wrench, Clock } from "lucide-react";
import { isGameUnderMaintenance } from "@/lib/casinoConfig";
import { toast } from "sonner";

export default function GameCard({ game, index }) {
  // Trò chơi chưa có trang riêng (chưa xây dựng) - phân biệt với "đang bảo trì"
  const isComingSoon = !game.to;
  const isMaint = !isComingSoon && isGameUnderMaintenance(game.to);

  const handleClick = (e) => {
    if (isMaint) {
      e.preventDefault();
      toast.error(`Trò chơi "${game.name}" đang bảo trì. Vui lòng quay lại sau!`);
    } else if (isComingSoon) {
      e.preventDefault();
      toast(`Trò chơi "${game.name}" sắp ra mắt, mời bạn đón chờ!`);
    }
  };

  const isDisabledLook = isMaint || isComingSoon;

  const card = (
    <motion.button
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 280, damping: 22 }}
      whileTap={{ scale: 0.96 }}
      onClick={handleClick}
      className={`group relative w-full overflow-hidden rounded-xl border shadow-lg ${
        isMaint
          ? "border-red-500/50 bg-[#1a0808]"
          : isComingSoon
          ? "border-[#caa45a]/20 bg-[#160f08]"
          : "border-[#caa45a]/40 bg-[#160f08]"
      }`}
    >
      {/* Cover image */}
      <div className="relative h-[88px] overflow-hidden">
        <img
          src={game.image}
          alt={game.name}
          loading="lazy"
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${
            isDisabledLook ? "grayscale opacity-50" : ""
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {isMaint ? (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-0.5 text-red-400">
            <Wrench className="w-4 h-4 animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-wider text-white bg-red-600 px-1.5 py-0.5 rounded shadow">
              BẢO TRÌ
            </span>
          </div>
        ) : isComingSoon ? (
          <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-0.5 text-[#e8c87a]">
            <Clock className="w-4 h-4" />
            <span className="text-[8px] font-black uppercase tracking-wider text-[#160f08] bg-[#e8c87a] px-1.5 py-0.5 rounded shadow">
              SẮP RA MẮT
            </span>
          </div>
        ) : (
          <span className="absolute top-1.5 right-2 text-[7px] font-semibold tracking-[0.2em] text-[#e8c87a]/90 drop-shadow">
            CORONA
          </span>
        )}
      </div>

      {/* Label */}
      <div className={`py-2 px-1 border-t ${
        isMaint ? "bg-[#1a0808] border-red-500/30" : "bg-[#160f08] border-[#caa45a]/30"
      }`}>
        <p className={`text-[10px] font-medium text-center leading-tight ${
          isMaint ? "text-red-300" : isComingSoon ? "text-[#e8c87a]/60" : "text-[#e8c87a]"
        }`}>
          {game.name}
        </p>
      </div>
    </motion.button>
  );

  if (game.to && !isMaint) {
    return <Link to={game.to} className="block">{card}</Link>;
  }

  return card;
}