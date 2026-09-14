import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, ShieldCheck, Phone } from "lucide-react";
import cskhIcon from "@/assets/images/regenerated_image_1786328347646.png";
import { SUPPORT_STATUS_LABELS } from "@/constants/supportStatus";

export default function SupportHeader({ status, viberUrl }) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 w-full bg-gradient-to-r from-[#948154] via-[#7d6c43] to-[#594c2e] text-white shadow-md pt-[env(safe-area-inset-top)]">
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

        {/* Status badge (chỉ hiện khi khác trạng thái mặc định "open") */}
        {status && status !== "open" && (
          <span className="shrink-0 text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded-full bg-white/20 text-white border border-white/30 whitespace-nowrap">
            {SUPPORT_STATUS_LABELS[status] || status}
          </span>
        )}

        {/* Nút Viber - thay cho thẻ "Welcome" tĩnh trước đây (trùng lặp với
            tin chào tự động đã có sẵn trong khung chat) - đưa lên header để
            luôn thấy được, không chiếm chỗ khung chat. */}
        {viberUrl && (
          <a
            href={viberUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white backdrop-blur-xs transition-all border border-white/20 shrink-0"
            title="Liên hệ trực tiếp qua Viber"
          >
            <Phone className="w-4 h-4" />
          </a>
        )}

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
