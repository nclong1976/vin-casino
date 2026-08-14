import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Home } from "lucide-react";
import cskhIcon from "@/assets/images/regenerated_image_1786328347646.png";

export default function SupportHeader() {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-[#948154] via-[#7d6c43] to-[#594c2e] text-white shadow-md">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-xs transition-all border border-white/20"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", width: "100%", overflow: "hidden" }}>
        <div className="relative shrink-0">
          <div className="w-7 h-7 rounded-full bg-white/20 border border-white/30 flex items-center justify-center p-1">
            <img src={cskhIcon} alt="VinClub" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 ring-2 ring-[#7d6c43]" />
        </div>
        <div className="text-center">
          <h1 className="text-[13px] font-bold text-white leading-tight">CSKH VinClub</h1>
          <span className="text-[8.5px] text-amber-100/90 flex items-center justify-center gap-1 font-medium">
            Hỗ trợ trực tuyến 24/7
          </span>
        </div>
      </div>
      <Link
        to="/"
        className="w-7 h-7 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-xs transition-all border border-white/20"
      >
        <Home className="w-3.5 h-3.5" />
      </Link>
    </header>
  );
}
