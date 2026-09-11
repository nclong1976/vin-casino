import React from "react";
import { ShieldAlert, LogOut, User, Headphones } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import NotificationBell from "@/components/home/NotificationBell";

/**
 * Màn hình chặn phần lớn trang chủ khi Admin bật cờ bảo trì app-wide
 * (public.app_maintenance_config). Chỉ render ở nhánh người dùng thường
 * trong App.jsx - Admin không bao giờ thấy màn hình này. Theo yêu cầu,
 * bảo trì KHÔNG khoá hẳn: /profile và /support vẫn có route riêng render
 * bình thường trong App.jsx (không đi qua màn hình này) - ở đây chỉ cần
 * chuông thông báo (Home.jsx bị chặn nên chuông không còn chỗ hiển thị)
 * và 2 nút điều hướng nhanh tới 2 trang vẫn còn mở.
 */
export default function AppMaintenanceScreen({ message }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-[99999] bg-[#0c0a09] text-white flex items-center justify-center p-4 overflow-y-auto font-heading">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-gradient-to-b from-[#181f2a] via-[#111620] to-[#0a0d13] border-2 border-[#d4af37]/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center flex flex-col items-center">
        <div className="w-full flex justify-end mb-2">
          <NotificationBell />
        </div>

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

        <div className="w-full grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={() => navigate("/profile")}
            className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <User className="w-3.5 h-3.5" /> Trang cá nhân
          </button>
          <button
            onClick={() => navigate("/support")}
            className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Headphones className="w-3.5 h-3.5" /> CSKH
          </button>
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
