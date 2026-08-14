import React, { useState, useEffect } from "react";
import { Wrench, ShieldAlert, Sliders, Dices, Flame, RefreshCw, Power, Award, Sparkles } from "lucide-react";
import { getCasinoConfig, saveCasinoConfig } from "@/lib/casinoConfig";
import { toast } from "sonner";

export default function CasinoTab() {
  const [config, setConfig] = useState(getCasinoConfig);
  const [selectedSpecialGame, setSelectedSpecialGame] = useState("tiger-baccarat"); // 'tiger-baccarat' | 'baccarat-long-ho'

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e.detail) {
        setConfig(e.detail);
      }
    };
    window.addEventListener("vinclub:casino_config_updated", handleUpdate);
    return () => window.removeEventListener("vinclub:casino_config_updated", handleUpdate);
  }, []);

  const handleToggleGlobalMaintenance = () => {
    const nextVal = !config.globalMaintenance;
    const newCfg = { ...config, globalMaintenance: nextVal };
    setConfig(newCfg);
    saveCasinoConfig(newCfg);

    if (nextVal) {
      toast.error("ĐÃ KÍCH HOẠT BẢO TRÌ TOÀN BỘ CASINO!");
    } else {
      toast.success("ĐÃ MỞ BÌNH THƯỜNG TOÀN BỘ CASINO!");
    }
  };

  const handleUpdateMessage = (msg) => {
    const newCfg = { ...config, maintenanceMessage: msg };
    setConfig(newCfg);
    saveCasinoConfig(newCfg);
  };

  const handleToggleGameMaintenance = (gameKey) => {
    const currentGame = config.games[gameKey] || {};
    const nextVal = !currentGame.isMaintenance;
    const updatedGames = {
      ...config.games,
      [gameKey]: { ...currentGame, isMaintenance: nextVal },
    };
    const newCfg = { ...config, games: updatedGames };
    setConfig(newCfg);
    saveCasinoConfig(newCfg);

    toast.info(`Đã ${nextVal ? "TẮT (BẢO TRÌ)" : "BẬT (MỞ HOẠT ĐỘNG)"} trò chơi: ${currentGame.name || gameKey}`);
  };

  const handleUpdateSpecialGameSetting = (gameKey, field, value) => {
    const current = config.games[gameKey] || {};
    const updatedGames = {
      ...config.games,
      [gameKey]: { ...current, [field]: value },
    };
    const newCfg = { ...config, games: updatedGames };
    setConfig(newCfg);
    saveCasinoConfig(newCfg);
    toast.success(`Đã cập nhật ${field} cho trò chơi ${current.name || gameKey}`);
  };

  const handleToggleOdds205 = (gameKey) => {
    const current = config.games[gameKey] || {};
    const nextVal = !current.odds205;
    const updatedGames = {
      ...config.games,
      [gameKey]: { 
        ...current, 
        odds205: nextVal,
        forcedOutcome: nextVal ? "auto" : (current.forcedOutcome || "auto")
      },
    };
    const newCfg = { ...config, games: updatedGames };
    setConfig(newCfg);
    saveCasinoConfig(newCfg);

    if (nextVal) {
      toast.success(`ĐÃ BẬT TÍNH NĂNG: Kết quả bàn cược tự động trả về PLAYER & BANKER (1.1x) cho ${current.name || gameKey}!`);
    } else {
      toast.info(`Đã TẮT tính năng (Trở về chuẩn 50/50 & Hòa) cho ${current.name || gameKey}`);
    }
  };

  const activeSpecialGameData = config.games[selectedSpecialGame] || {};

  return (
    <div className="space-y-4 font-heading">
      {/* Banner Top Header */}
      <div className="bg-gradient-to-r from-amber-950 via-yellow-950 to-slate-900 p-4 rounded-2xl border-2 border-[#d4af37]/50 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black tracking-wide text-[#e8c87a] uppercase flex items-center gap-2">
              <Dices className="w-5 h-5 text-yellow-400" />
              QUẢN LÝ BẢO TRÌ & ĐIỀU HÀNH CASINO CORONA
            </h2>
            <p className="text-[11px] text-amber-200/80 mt-0.5">
              Hệ thống quản lý trung tâm toàn bộ 12 phòng chơi, thiết lập bảo trì và điều khiển 2 game đặc biệt
            </p>
          </div>

          {/* Quick Refresh */}
          <button
            onClick={() => setConfig(getCasinoConfig())}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-amber-200 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Đồng bộ cấu hình
          </button>
        </div>
      </div>

      {/* GLOBAL MAINTENANCE CONTROL SECTION */}
      <div className={`p-4 rounded-2xl border-2 transition-all shadow-md ${
        config.globalMaintenance
          ? "bg-red-950/20 border-red-500/80"
          : "bg-white border-gray-200"
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              config.globalMaintenance ? "bg-red-500 text-white" : "bg-emerald-100 text-emerald-700"
            }`}>
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-black flex items-center gap-2">
                BẢO TRÌ TOÀN BỘ CASINO (GLOBAL MAINTENANCE)
                {config.globalMaintenance && (
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black uppercase animate-pulse">
                    ĐANG BẢO TRÌ TOÀN MẠNG
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-gray-500">
                Khi bật công tắc này, tất cả 12 trò chơi Casino Corona sẽ ngay lập tức chuyển sang chế độ bảo trì
              </p>
            </div>
          </div>

          {/* Master Switch */}
          <button
            onClick={handleToggleGlobalMaintenance}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all cursor-pointer shrink-0 ${
              config.globalMaintenance
                ? "bg-red-600 hover:bg-red-500 text-white ring-4 ring-red-500/30"
                : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white"
            }`}
          >
            <Power className="w-4 h-4" />
            {config.globalMaintenance ? "TẮT BẢO TRÌ CASINO" : "BẬT BẢO TRÌ TOÀN CASINO"}
          </button>
        </div>

        {/* Custom Maintenance Message input */}
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
          <label className="text-[10.5px] font-bold text-gray-700 block">
            Thông báo bảo trì hiển thị cho người chơi:
          </label>
          <input
            type="text"
            value={config.maintenanceMessage}
            onChange={(e) => handleUpdateMessage(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-gray-50 text-xs text-gray-800 font-medium focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* SPECIAL MANAGEMENT AREA FOR TIGER BACCARAT & BACCARAT LONG HỔ */}
      <div className="bg-gradient-to-b from-[#1a1711] via-[#12100b] to-[#0a0906] p-4 rounded-2xl border-2 border-[#d4af37] text-white shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#d4af37]/30 pb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400 animate-bounce" />
            <div>
              <h3 className="text-sm font-black text-[#f2ca50] uppercase tracking-wider">
                QUẢN LÝ CAO CẤP: TIGER BACCARAT & BACCARAT LONG HỔ
              </h3>
              <p className="text-[10px] text-gray-400">
                Can thiệp kết quả ván cược, điều chỉnh mức cược min/max & kiểm soát tỷ lệ thắng
              </p>
            </div>
          </div>

          {/* Game Switch Buttons */}
          <div className="flex bg-black/60 p-1 rounded-xl border border-[#d4af37]/40 w-full sm:w-auto">
            <button
              onClick={() => setSelectedSpecialGame("tiger-baccarat")}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedSpecialGame === "tiger-baccarat"
                  ? "bg-[#d4af37] text-black shadow-md font-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Tiger Baccarat
            </button>
            <button
              onClick={() => setSelectedSpecialGame("baccarat-long-ho")}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedSpecialGame === "baccarat-long-ho"
                  ? "bg-[#d4af37] text-black shadow-md font-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Baccarat Long Hổ
            </button>
          </div>
        </div>

        {/* Selected Game Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Column: Forced Outcome & Game Status */}
          <div className="bg-black/40 p-3.5 rounded-xl border border-[#d4af37]/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#e8c87a] uppercase flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-amber-400" /> Trạng Thái & Điều Khiển Kết Quả
              </span>
              <button
                onClick={() => handleToggleGameMaintenance(selectedSpecialGame)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                  activeSpecialGameData.isMaintenance
                    ? "bg-red-600 text-white"
                    : "bg-emerald-600 text-white"
                }`}
              >
                {activeSpecialGameData.isMaintenance ? "ĐANG BẢO TRÌ" : "HOẠT ĐỘNG"}
              </button>
            </div>

            {/* Forced Outcome Selector */}
            <div>
              <label className="text-[11px] text-gray-300 font-bold flex items-center gap-1 mb-1">
                <Sliders className="w-3.5 h-3.5 text-amber-400" /> Can thiệp kết quả ván tiếp theo (Forced Result):
              </label>
              <select
                value={activeSpecialGameData.forcedOutcome || "auto"}
                onChange={(e) =>
                  handleUpdateSpecialGameSetting(selectedSpecialGame, "forcedOutcome", e.target.value)
                }
                className="w-full bg-[#1c1913] border border-[#d4af37]/60 rounded-xl px-3 py-2 text-xs font-bold text-amber-300 focus:outline-none focus:border-amber-400"
              >
                <option value="auto">Tự động (Ngẫu nhiên chuẩn 50/50)</option>
                <option value="player">Ép PLAYER Thắng (Thẻ xanh điểm cao hơn)</option>
                <option value="banker">Ép BANKER Thắng (Thẻ đỏ điểm cao hơn)</option>
                <option value="tie">Ép HÒA (Tie - Lợi nhuận 8:1)</option>
                <option value="tiger">Ép TIGER Thắng (Thần Hổ 40:1)</option>
              </select>
              <p className="text-[9.5px] text-gray-400 mt-1 italic">
                * Khi chọn ép kết quả, ván bài tiếp theo lật ra sẽ chắc chắn trả về kết quả đã định sẵn cho phòng chơi.
              </p>
            </div>

            {/* 2.05 PAYOUT ODDS TOGGLE CONTROL */}
            <div className="pt-2 border-t border-[#d4af37]/20">
              <div className="flex items-center justify-between bg-gradient-to-r from-amber-950/80 via-yellow-950/50 to-black p-3 rounded-xl border border-amber-500/60 shadow-md">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span className="text-xs font-black text-amber-300 uppercase tracking-wide">
                      Kết quả Player & Banker (Trả thưởng 1.1x — Không Hòa)
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-300 mt-0.5">
                    Tự động đưa kết quả về <strong className="text-yellow-400 font-extrabold">PLAYER hoặc BANKER</strong>, tỷ lệ trả thưởng <strong className="text-yellow-400 font-extrabold">1.1x</strong> (cược 1,000 → lời 1,100). Kết quả Hòa sẽ không xuất hiện.
                  </p>
                </div>

                <button
                  onClick={() => handleToggleOdds205(selectedSpecialGame)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-lg ${
                    activeSpecialGameData.odds205
                      ? "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black ring-2 ring-yellow-300 shadow-amber-500/50 scale-105"
                      : "bg-gray-800 text-gray-400 border border-gray-600 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {activeSpecialGameData.odds205 ? "BẬT (1.1x — Không Hòa)" : "TẮT (Chuẩn)"}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Bet Limits & Revenue Stats */}
          <div className="bg-black/40 p-3.5 rounded-xl border border-[#d4af37]/30 space-y-3">
            <span className="text-xs font-bold text-[#e8c87a] uppercase flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" /> Hạn Mức Cược & Thống Kê Phòng
            </span>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-0.5">Cược tối thiểu (₫):</label>
                <input
                  type="number"
                  value={activeSpecialGameData.minBet || 10000}
                  onChange={(e) =>
                    handleUpdateSpecialGameSetting(selectedSpecialGame, "minBet", parseInt(e.target.value))
                  }
                  className="w-full bg-[#1c1913] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-0.5">Cược tối đa (₫):</label>
                <input
                  type="number"
                  value={activeSpecialGameData.maxBet || 500000000}
                  onChange={(e) =>
                    handleUpdateSpecialGameSetting(selectedSpecialGame, "maxBet", parseInt(e.target.value))
                  }
                  className="w-full bg-[#1c1913] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold"
                />
              </div>
            </div>

            {/* Revenue Statistics Box */}
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/10 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Tổng tiền cược tiếp nhận:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {new Intl.NumberFormat("vi-VN").format(activeSpecialGameData.totalBets || 0)} ₫
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Tổng tiền đã trả thưởng:</span>
                <span className="font-mono text-amber-400 font-bold">
                  {new Intl.NumberFormat("vi-VN").format(activeSpecialGameData.totalPayout || 0)} ₫
                </span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1 font-bold">
                <span className="text-amber-200">Lợi nhuận Casino:</span>
                <span className="font-mono text-yellow-400">
                  {new Intl.NumberFormat("vi-VN").format(
                    (activeSpecialGameData.totalBets || 0) - (activeSpecialGameData.totalPayout || 0)
                  )}{" "}
                  ₫
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PER-GAME MAINTENANCE TOGGLE LIST (ALL 12 GAMES) */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-black uppercase tracking-wider flex items-center gap-1.5">
            <Wrench className="w-4 h-4 text-[#948154]" /> Quản Lý Trạng Thái Bảo Trì Từng Trò Chơi (12 Phòng)
          </h3>
          <span className="text-[10px] text-gray-400 font-semibold">Công tắc bật/tắt độc lập</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {Object.entries(config.games).map(([key, game]) => {
            const isMaint = config.globalMaintenance || game.isMaintenance;

            return (
              <div
                key={key}
                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                  isMaint ? "bg-red-50/70 border-red-200" : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-black truncate">{game.name || key}</h4>
                  <p className={`text-[9.5px] font-bold ${isMaint ? "text-red-600" : "text-emerald-600"}`}>
                    {config.globalMaintenance
                      ? "Bảo trì (Toàn casino)"
                      : game.isMaintenance
                      ? "Đang bảo trì"
                      : "Hoạt động"}
                  </p>
                </div>

                <button
                  disabled={config.globalMaintenance}
                  onClick={() => handleToggleGameMaintenance(key)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                    isMaint ? "bg-red-600" : "bg-emerald-600"
                  } ${config.globalMaintenance ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isMaint ? "translate-x-1" : "translate-x-6"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
