import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useConfig } from "@/lib/ConfigContext";
import { 
  Sliders, 
  Palette, 
  Globe, 
  Volume2, 
  ShieldCheck, 
  Smartphone, 
  Tablet, 
  Monitor, 
  Check, 
  Copy, 
  RotateCcw, 
  Download, 
  Upload, 
  ArrowLeft, 
  Sparkles,
  Server,
  Key
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/components/ui/use-toast";

export default function Settings() {
  const { config, updateConfig, resetConfig, triggerSound, t, exportConfigJson, importConfigJson, locales } = useConfig();
  const [activeTab, setActiveTab] = useState("env"); // "env" | "theme" | "i18n" | "audio" | "security"
  const [copiedKey, setCopiedKey] = useState(null);
  const fileInputRef = useRef(null);

  const handleCopy = (text, keyName) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    triggerSound("click");
    toast({
      title: "Đã sao chép",
      description: `${keyName}: ${text}`,
    });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        importConfigJson(event.target.result);
      }
    };
    reader.readAsText(file);
  };

  const presetColors = [
    { name: "Kháng Kim (Gold Bronze)", value: "#c5a070" },
    { name: "Ngọc Bích (Emerald Green)", value: "#2e7d32" },
    { name: "Thần Tài (Ruby Red)", value: "#c62828" },
    { name: "Hoàng Gia (Royal Blue)", value: "#1565c0" },
    { name: "Tuyền Thạch (Deep Amethyst)", value: "#6a1b9a" },
  ];

  return (
    <div className="bg-[#0f1113] text-[#e2e2e2] min-h-screen w-full flex flex-col relative overflow-x-hidden">
      {/* Background ambient lighting */}
      <div 
        className="fixed top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none opacity-15 transition-all duration-700"
        style={{ backgroundColor: config.primaryColor }}
      />
      <div className="fixed bottom-0 right-1/4 w-[400px] h-[400px] bg-amber-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header bar */}
      <header className="sticky top-0 z-40 bg-[#16181a]/90 backdrop-blur-xl border-b border-white/10 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link 
            to="/" 
            onClick={() => triggerSound("click")}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white/80" />
          </Link>
          <div>
            <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-white">
              <Sliders className="w-5 h-5 text-[#c5a070]" style={{ color: config.primaryColor }} />
              {t("settings")}
            </h1>
            <p className="text-xs text-white/60 hidden sm:block">
              {t("settingsDesc")}
            </p>
          </div>
        </div>

        {/* Device indicator & Quick action buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1 text-xs text-white/70">
            <button
              type="button"
              onClick={() => { updateConfig({ devicePreviewMode: "mobile" }); }}
              className={`p-1.5 rounded-lg transition-all ${config.devicePreviewMode === "mobile" ? "bg-white/20 text-white font-semibold" : "hover:text-white"}`}
              title="Điện thoại (Mobile)"
            >
              <Smartphone className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { updateConfig({ devicePreviewMode: "tablet" }); }}
              className={`p-1.5 rounded-lg transition-all ${config.devicePreviewMode === "tablet" ? "bg-white/20 text-white font-semibold" : "hover:text-white"}`}
              title="Máy tính bảng (Tablet)"
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { updateConfig({ devicePreviewMode: "desktop" }); }}
              className={`p-1.5 rounded-lg transition-all ${config.devicePreviewMode === "desktop" ? "bg-white/20 text-white font-semibold" : "hover:text-white"}`}
              title="Máy tính (Desktop)"
            >
              <Monitor className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={resetConfig}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 flex items-center gap-1.5 transition-all"
            title={t("resetDefaults")}
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">{t("resetDefaults")}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10 flex flex-col md:flex-row gap-6 relative z-10">
        {/* Navigation Tabs Bar (Desktop sidebar, Mobile top pills) */}
        <div className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none border-b md:border-b-0 border-white/10">
          {[
            { id: "env", label: t("environmentConfig"), icon: Server },
            { id: "theme", label: t("themeConfig"), icon: Palette },
            { id: "i18n", label: t("languageConfig"), icon: Globe },
            { id: "audio", label: t("audioGameConfig"), icon: Volume2 },
            { id: "security", label: t("securityConfig"), icon: ShieldCheck },
          ].map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  triggerSound("click");
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap text-left ${
                  isActive
                    ? "bg-gradient-to-r from-white/15 to-white/5 border border-white/20 text-white shadow-lg"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <IconComponent 
                  className="w-4 h-4 shrink-0 transition-colors" 
                  style={{ color: isActive ? config.primaryColor : "currentColor" }}
                />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Tab Panel Content */}
        <div className="flex-1 bg-[#181a1d]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-8 shadow-2xl min-h-[480px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              {/* TAB 1: ENVIRONMENT VARIABLES (.env) */}
              {activeTab === "env" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Server className="w-5 h-5 text-amber-400" />
                      1. Cấu hình Biến môi trường (.env)
                    </h2>
                    <p className="text-xs text-white/60 mt-1">
                      Khai báo và tùy chỉnh các tham số cấu hình chính từ file <code className="bg-white/10 px-1.5 py-0.5 rounded text-amber-300">.env</code>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* VITE_BASE44_APP_ID */}
                    <div className="space-y-1.5 col-span-1 sm:col-span-2">
                      <label className="text-xs font-semibold text-white/80 flex items-center justify-between">
                        <span>{t("appId")}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(config.appId, "VITE_BASE44_APP_ID")}
                          className="text-amber-400 hover:underline flex items-center gap-1 text-[11px]"
                        >
                          {copiedKey === "VITE_BASE44_APP_ID" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          Sao chép
                        </button>
                      </label>
                      <input
                        type="text"
                        value={config.appId}
                        onChange={(e) => updateConfig({ appId: e.target.value })}
                        className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 transition-all font-mono"
                      />
                    </div>

                    {/* VITE_BASE44_APP_BASE_URL */}
                    <div className="space-y-1.5 col-span-1 sm:col-span-2">
                      <label className="text-xs font-semibold text-white/80 flex items-center justify-between">
                        <span>{t("baseUrl")}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(config.appBaseUrl, "VITE_BASE44_APP_BASE_URL")}
                          className="text-amber-400 hover:underline flex items-center gap-1 text-[11px]"
                        >
                          {copiedKey === "VITE_BASE44_APP_BASE_URL" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          Sao chép
                        </button>
                      </label>
                      <input
                        type="text"
                        value={config.appBaseUrl}
                        onChange={(e) => updateConfig({ appBaseUrl: e.target.value })}
                        className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 transition-all font-mono"
                      />
                    </div>

                    {/* VITE_BASE44_FUNCTIONS_VERSION */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-white/80">{t("functionsVer")}</label>
                      <select
                        value={config.functionsVersion}
                        onChange={(e) => updateConfig({ functionsVersion: e.target.value })}
                        className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 transition-all"
                      >
                        <option value="v1">v1 (Mặc định Stable)</option>
                        <option value="v2">v2 (Beta Multi-thread)</option>
                      </select>
                    </div>

                    {/* PORT */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-white/80">Cổng Máy Chủ (PORT)</label>
                      <input
                        type="text"
                        value={config.port}
                        disabled
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/50 font-mono cursor-not-allowed"
                      />
                    </div>

                    {/* JWT_SECRET */}
                    <div className="space-y-1.5 col-span-1 sm:col-span-2">
                      <label className="text-xs font-semibold text-white/80 flex items-center gap-1">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        {t("jwtSecret")}
                      </label>
                      <input
                        type="password"
                        value={config.jwtSecret}
                        onChange={(e) => updateConfig({ jwtSecret: e.target.value })}
                        className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: THEME & TAILWIND STYLING */}
              {activeTab === "theme" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Palette className="w-5 h-5 text-amber-400" />
                      2. Tùy chỉnh Giao diện & Theme (Tailwind CSS)
                    </h2>
                    <p className="text-xs text-white/60 mt-1">
                      Cấu hình bảng màu chủ đạo (Primary Colors), chủ đề và phông chữ toàn ứng dụng.
                    </p>
                  </div>

                  {/* Primary Accent Color Selection */}
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-white/80">{t("primaryColor")}</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {presetColors.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => updateConfig({ primaryColor: color.value })}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                            config.primaryColor === color.value
                              ? "border-white bg-white/10 shadow-md ring-1 ring-white"
                              : "border-white/10 bg-white/5 hover:bg-white/10"
                          }`}
                        >
                          <span 
                            className="w-5 h-5 rounded-full shrink-0 shadow-sm border border-white/20" 
                            style={{ backgroundColor: color.value }} 
                          />
                          <span className="text-xs font-medium text-white truncate">{color.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Family Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/80">{t("fontFamily")}</label>
                    <select
                      value={config.fontFamily}
                      onChange={(e) => updateConfig({ fontFamily: e.target.value })}
                      className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 transition-all"
                    >
                      <option value="Hanken Grotesk">Hanken Grotesk (Modern Luxury)</option>
                      <option value="Manrope">Manrope (Clean Tech)</option>
                      <option value="Inter">Inter (Standard Sans)</option>
                      <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                    </select>
                  </div>

                  {/* Theme Mode */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/80">Phong cách không gian (Theme Atmosphere)</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: "dark", name: "Vinclub Obsidian (Tối sang trọng)" },
                        { id: "black", name: "Midnight OLED (Đen tuyệt đối)" },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => updateConfig({ themeMode: mode.id })}
                          className={`p-3 rounded-xl border text-xs font-medium transition-all ${
                            config.themeMode === mode.id
                              ? "bg-amber-500/20 border-amber-400 text-amber-200"
                              : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          {mode.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live Color Preview Card */}
                  <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: config.primaryColor }}
                      >
                        A
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Xem trước nút Primary</p>
                        <p className="text-xs text-white/50">Màu được áp dụng toàn hệ thống</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-xl font-medium text-xs text-white shadow-md transition-all hover:brightness-110"
                      style={{ backgroundColor: config.primaryColor }}
                    >
                      Xác nhận mẫu
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: I18N & MULTI-LANGUAGE */}
              {activeTab === "i18n" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Globe className="w-5 h-5 text-amber-400" />
                      3. Quản lý Đa ngôn ngữ (i18n)
                    </h2>
                    <p className="text-xs text-white/60 mt-1">
                      Thư mục ngôn ngữ: <code className="bg-white/10 px-1.5 py-0.5 rounded text-amber-300">src/locales/</code>. Hỗ trợ thay đổi ngôn ngữ ngay lập tức.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.values(locales).map((item) => {
                      const isSelected = config.locale === item.code;
                      return (
                        <button
                          key={item.code}
                          type="button"
                          onClick={() => updateConfig({ locale: item.code })}
                          className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                            isSelected
                              ? "bg-amber-500/15 border-amber-400 text-white shadow-lg"
                              : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{item.flag}</span>
                            <div>
                              <p className="text-sm font-semibold text-white">{item.name}</p>
                              <p className="text-xs text-white/50">Mã: {item.code}.json</p>
                            </div>
                          </div>
                          {isSelected && <Check className="w-5 h-5 text-amber-400" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Sample translation dictionary preview */}
                  <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Xem trước bản dịch hiện tại ({config.locale})</p>
                    <div className="text-xs text-white/80 space-y-1 font-mono">
                      <p><span className="text-white/40">settings:</span> "{t("settings")}"</p>
                      <p><span className="text-white/40">saveChanges:</span> "{t("saveChanges")}"</p>
                      <p><span className="text-white/40">allDevicesResponsive:</span> "{t("allDevicesResponsive")}"</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: AUDIO & GAME SETTINGS */}
              {activeTab === "audio" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Volume2 className="w-5 h-5 text-amber-400" />
                      4. Cấu hình Âm thanh & Game
                    </h2>
                    <p className="text-xs text-white/60 mt-1">
                      Quản lý file âm thanh hệ thống (<code className="bg-white/10 px-1.5 py-0.5 rounded text-amber-300">src/assets/sounds/</code>) và quy tắc Game.
                    </p>
                  </div>

                  {/* Toggle System Sound */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <p className="text-sm font-semibold text-white">{t("soundEnabled")}</p>
                      <p className="text-xs text-white/50">Phát hiệu ứng khi tương tác nút bấm, nhận thông báo & thắng game</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.soundEnabled}
                      onChange={(e) => updateConfig({ soundEnabled: e.target.checked })}
                      className="w-6 h-6 rounded border-white/30 text-amber-500 focus:ring-amber-400 accent-amber-500 cursor-pointer"
                    />
                  </div>

                  {/* Volume Slider & Test Button */}
                  {config.soundEnabled && (
                    <div className="space-y-2 p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between text-xs text-white/80 font-semibold">
                        <span>{t("soundVolume")}: {config.soundVolume}%</span>
                        <button
                          type="button"
                          onClick={() => triggerSound("win")}
                          className="text-amber-400 hover:underline flex items-center gap-1 text-xs"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> {t("testSound")}
                        </button>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={config.soundVolume}
                        onChange={(e) => updateConfig({ soundVolume: Number(e.target.value) })}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Push OTP Delay Settings */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/80">{t("pushOtpDelay")}</label>
                    <select
                      value={config.pushNotificationDelay}
                      onChange={(e) => updateConfig({ pushNotificationDelay: Number(e.target.value) })}
                      className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 transition-all"
                    >
                      <option value={300}>300 ms (Nhanh tức thì)</option>
                      <option value={600}>600 ms (Tiêu chuẩn thực tế)</option>
                      <option value={1200}>1200 ms (1.2 giây)</option>
                    </select>
                  </div>

                  {/* Game Win Multiplier Rate */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/80">{t("gameWinRate")}</label>
                    <input
                      type="number"
                      step="0.05"
                      min="1.0"
                      max="10.0"
                      value={config.gameWinMultiplier}
                      onChange={(e) => updateConfig({ gameWinMultiplier: Number(e.target.value) })}
                      className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 transition-all font-mono"
                    />
                  </div>
                </div>
              )}

              {/* TAB 5: SECURITY & AUTH FLOW */}
              {activeTab === "security" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-amber-400" />
                      5. Cấu hình Luồng Đăng ký & Bảo mật
                    </h2>
                    <p className="text-xs text-white/60 mt-1">
                      Thiết lập các bước xác thực người dùng và hiển thị thông báo pháp lý.
                    </p>
                  </div>

                  {/* Terms & Privacy Popup Modal Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <p className="text-sm font-semibold text-white">{t("termsModalOnRegister")}</p>
                      <p className="text-xs text-white/50">Hiển thị hộp thoại Điều khoản & Điều kiện trước khi tạo tài khoản</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.termsModalOnRegister}
                      onChange={(e) => updateConfig({ termsModalOnRegister: e.target.checked })}
                      className="w-6 h-6 rounded border-white/30 text-amber-500 focus:ring-amber-400 accent-amber-500 cursor-pointer"
                    />
                  </div>

                  {/* OTP Push Notification Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <p className="text-sm font-semibold text-white">{t("pushOtpNotification")}</p>
                      <p className="text-xs text-white/50">Tự động thả Banner thông báo OTP iOS style ở đỉnh màn hình</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.pushNotificationOtp}
                      onChange={(e) => updateConfig({ pushNotificationOtp: e.target.checked })}
                      className="w-6 h-6 rounded border-white/30 text-amber-500 focus:ring-amber-400 accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Save / Export / Import Action Bar */}
          <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportConfigJson}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 transition-all"
              >
                <Download className="w-4 h-4 text-amber-400" />
                {t("exportJson")}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 transition-all"
              >
                <Upload className="w-4 h-4 text-amber-400" />
                {t("importJson")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                triggerSound("win");
                toast({
                  title: t("savedSuccess"),
                  description: "Cấu hình đã áp dụng ngay trên thiết bị của bạn.",
                });
              }}
              className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: config.primaryColor }}
            >
              {t("saveChanges")}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
