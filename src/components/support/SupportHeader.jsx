import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, ShieldCheck } from "lucide-react";
import cskhIcon from "@/assets/images/regenerated_image_1786328347646.png";

export default function SupportHeader() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 w-full bg-gradient-to-r from-[#948154] via-[#7d6c43] to-[#594c2e] text-white shadow-md">
      <div className="w-full max-w-4xl mx-auto px-3.5 py-2.5 flex items-center justify-between gap-2">
        {/* Back Button */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white backdrop-blur-xs transition-all border border-white/20 shrink-0 cursor-pointer"
          title="Quay lại"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* CSKH Info */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-center">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 border border-white/40 flex items-center justify-center p-1 shadow-inner">
              <img src={cskhIcon} alt="VinClub" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 ring-2 ring-[#7d6c43] animate-pulse" />
          </div>
          <div className="text-center truncate">
            <div className="flex items-center justify-center gap-1.5">
              <h1 className="text-[13px] sm:text-sm font-bold text-white leading-tight truncate">
                CSKH TRỰC TUYẾN VINCLUB
              </h1>
              <ShieldCheck className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            </div>
            <span className="text-[9px] sm:text-[10px] text-amber-100/90 flex items-center justify-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Đang trực tuyến • Sẵn sàng hỗ trợ 24/7
            </span>
          </div>
        </div>

        {/* Home Button */}
        <Link
          to="/"
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white backdrop-blur-xs transition-all border border-white/20 shrink-0"
          title="Trang chủ"
        >
          <Home className="w-4 h-4" />
        </Link>
      </div>
    </header>
  );
}
