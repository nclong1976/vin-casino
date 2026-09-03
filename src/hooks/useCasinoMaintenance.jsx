import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Landmark, ShieldAlert, Clock, ArrowLeft, Headphones, FileText, CheckCircle2, RefreshCw } from "lucide-react";
import { getCasinoConfig, refreshCasinoConfig } from "@/lib/casinoConfig";
import { subscribeCasinoMaintenanceConfig } from "@/lib/supabaseDb";

export function useCasinoMaintenance(gameSlug = "") {
  const [config, setConfig] = useState(() => getCasinoConfig());

  const syncConfig = useCallback(() => {
    setConfig(getCasinoConfig());
  }, []);

  useEffect(() => {
    syncConfig();
    refreshCasinoConfig();

    const unsubRealtime = subscribeCasinoMaintenanceConfig(() => {
      refreshCasinoConfig();
    });

    const handleUpdate = () => syncConfig();
    window.addEventListener("vinclub:casino_config_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      if (typeof unsubRealtime === "function") unsubRealtime();
      window.removeEventListener("vinclub:casino_config_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [syncConfig]);

  const normalizedKey = (gameSlug || "").toLowerCase().replace(/^\/casino\//, "").replace(/^\//, "");
  const gameInfo = config.games[normalizedKey] || {};

  const isGlobalMaintenance = !!config.globalMaintenance;
  const isGameMaintenance = !!gameInfo.isMaintenance;
  const isMaintenance = isGlobalMaintenance || isGameMaintenance;

  return {
    isMaintenance,
    isGlobalMaintenance,
    isGameMaintenance,
    maintenanceMessage: config.maintenanceMessage || "Hệ thống đang trong thời gian bảo trì nâng cấp định kỳ.",
    gameSettings: gameInfo,
    config,
  };
}

export function BankingDowntimeScreen({ message, gameTitle = "Tiger Baccarat", onRetry }) {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-[200] bg-[#0c0f14] text-white flex items-center justify-center p-4 overflow-y-auto font-heading">
      {/* Background Banking Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-gradient-to-b from-[#181f2a] via-[#111620] to-[#0a0d13] border-2 border-[#d4af37]/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center flex flex-col items-center">
        
        {/* BANKING SEAL BADGE */}
        <div className="relative mb-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#d4af37] via-[#948154] to-[#3a301a] p-0.5 shadow-xl">
            <div className="w-full h-full rounded-[14px] bg-[#0f141c] flex items-center justify-center text-amber-400">
              <Landmark className="w-10 h-10" />
            </div>
          </div>
          <div className="absolute -bottom-2 -right-2 bg-red-600 text-white rounded-full p-1.5 shadow-lg border border-red-400">
            <ShieldAlert className="w-4 h-4 animate-pulse" />
          </div>
        </div>

        {/* BANKING DOWNTIME TITLE */}
        <div className="space-y-1 mb-4">
          <span className="text-[10px] font-black tracking-[0.25em] text-amber-400/90 uppercase bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 inline-block">
            VINCLUB BANKING SYSTEM NOTICE
          </span>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase pt-1">
            THÔNG BÁO TẠM NGƯNG DỊCH VỤ
          </h1>
          <p className="text-[11px] font-bold text-amber-200/70 tracking-wide uppercase">
            SẢNH GIAO DỊCH: {gameTitle.toUpperCase()}
          </p>
        </div>

        {/* MESSAGE BOX */}
        <div className="w-full bg-[#131a24] border border-amber-500/30 rounded-2xl p-4 text-left space-y-3.5 mb-5 shadow-inner">
          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Trạng thái bảo trì định kỳ</p>
              <p className="text-[12px] text-gray-300 leading-relaxed mt-0.5">
                {message || "Hệ thống máy chủ kiểm toán giao dịch đang tiến hành nâng cấp thuật toán an toàn bảo mật. Tất cả lệnh cược tạm thời đóng."}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10.5px] font-mono text-gray-400">
            <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-gray-500" /> Mã tra cứu:</span>
            <span className="text-amber-400 font-bold">REF-MAINT-2026-CORONA</span>
          </div>
          <div className="flex items-center justify-between text-[10.5px] font-mono text-gray-400">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> An toàn tiền vốn:</span>
            <span className="text-emerald-400 font-bold">100% Đã Khóa Bảo Vệ</span>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="w-full space-y-2.5">
          {onRetry && (
            <button
              onClick={onRetry}
              className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-amber-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Kiểm Tra Trạng Thái Lại
            </button>
          )}

          <button
            onClick={() => navigate("/casino")}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f2ca50] to-[#b38822] text-[#241a00] font-black text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Quay Về Sảnh Casino
          </button>

          <button
            onClick={() => navigate("/support")}
            className="w-full py-2.5 text-gray-400 hover:text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Headphones className="w-3.5 h-3.5" /> Liên hệ Bộ phận Hỗ trợ Kỹ thuật Ngân hàng
          </button>
        </div>

      </div>
    </div>
  );
}
