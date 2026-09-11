import React from "react";
import { ShieldAlert, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

/**
 * Màn hình chặn TOÀN BỘ trang chủ khi Admin bật cờ bảo trì app-wide
 * (public.app_maintenance_config). Chỉ render ở nhánh người dùng thường
 * trong App.jsx - Admin không bao giờ thấy màn hình này.
 */
export default function AppMaintenanceScreen({ message }) {
  const { logout } = useAuth();

  return (
    <div className="fixed inset-0 z-[99999] bg-[#0c0a09] text-white flex items-center justify-center p-4 overflow-y-auto font-heading">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-gradient-to-b from-[#181f2a] via-[#111620] to-[#0a0d13] border-2 border-[#d4af37]/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center flex flex-col items-center">
        <div className="relative mb-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#d4af37] via-[#948154] to-[#3a301a] p-0.5 shadow-xl">
            <div className="w-full h-full rounded-[14px] bg-[#0f141c] flex items-center justify-center text-amber-400">
              <img
                src="/logo.png"
                alt="VinClub"
                className="w-10 h-10 rounded-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </div>
          </div>
          <div className="absolute -bottom-2 -right-2 bg-red-600 text-white rounded-full p-1.5 shadow-lg border border-red-400">
            <ShieldAlert className="w-4 h-4 animate-pulse" />
          </div>
        </div>

        <div className="space-y-1 mb-4">
          <span className="text-[10px] font-black tracking-[0.25em] text-amber-400/90 uppercase bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 inline-block">
            VINCLUB SYSTEM NOTICE
          </span>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase pt-1">
            HỆ THỐNG ĐANG BẢO TRÌ
          </h1>
        </div>

        <div className="w-full bg-[#131a24] border border-amber-500/30 rounded-2xl p-4 text-left mb-5 shadow-inner">
          <p className="text-[12px] text-gray-300 leading-relaxed">
            {message}
          </p>
        </div>

        <button
          onClick={() => logout()}
          className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-amber-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <LogOut className="w-4 h-4" /> Đăng xuất
        </button>
      </div>
    </div>
  );
}
