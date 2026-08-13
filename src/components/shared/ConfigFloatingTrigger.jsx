import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useConfig } from "@/lib/ConfigContext";
import { Sliders, X, Palette, Globe, Volume2, Check, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ConfigFloatingTrigger() {
  const { config, updateConfig, triggerSound, t, resetConfig, locales } = useConfig();
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Hide floating button on /settings page itself to avoid duplication
  if (location.pathname === "/settings") {
    return null;
  }

  const toggleModal = () => {
    triggerSound("click");
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        type="button"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleModal}
        className="fixed top-4 right-4 z-50 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#1e2022]/90 backdrop-blur-xl border border-[#c5a070]/40 text-[#c5a070] shadow-[0_8px_24px_rgba(0,0,0,0.35)] flex items-center justify-center transition-all hover:border-[#c5a070] group"
        title="Cấu hình hệ thống (Settings)"
        aria-label="Cấu hình hệ thống"
      >
        <Sliders className="w-5 h-5 transition-transform group-hover:rotate-45" style={{ color: config.primaryColor }} />
        <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#121414]" />
      </motion.button>

      {/* Quick Config Slide-out Drawer / Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-end sm:justify-center p-3 sm:p-6">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleModal}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
            />

            {/* Config Quick Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="relative z-10 bg-[#16181a]/95 text-white border border-white/15 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto scrollbar-none flex flex-col gap-5 my-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" style={{ color: config.primaryColor }} />
                  <h3 className="font-bold text-base text-white">{t("settings")}</h3>
                </div>
                <button
                  type="button"
                  onClick={toggleModal}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 1. Quick Language Switcher */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  {t("languageConfig")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(locales).map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => updateConfig({ locale: item.code })}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                        config.locale === item.code
                          ? "bg-amber-500/20 border-amber-400 text-white"
                          : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{item.flag}</span>
                        <span>{item.name}</span>
                      </span>
                      {config.locale === item.code && <Check className="w-3.5 h-3.5 text-amber-400" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Primary Color Theme */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-amber-400" />
                  {t("primaryColor")}
                </label>
                <div className="flex items-center gap-2">
                  {["#c5a070", "#2e7d32", "#c62828", "#1565c0", "#6a1b9a"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateConfig({ primaryColor: c })}
                      className={`w-8 h-8 rounded-full border border-white/20 transition-transform ${
                        config.primaryColor === c ? "scale-110 ring-2 ring-white" : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* 3. Audio & FX */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-medium text-white">{t("soundEnabled")}</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.soundEnabled}
                  onChange={(e) => updateConfig({ soundEnabled: e.target.checked })}
                  className="w-5 h-5 rounded border-white/30 text-amber-500 focus:ring-amber-400 accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <Link
                  to="/settings"
                  onClick={toggleModal}
                  className="flex-1 py-2.5 rounded-xl text-center text-xs font-bold text-white shadow-md transition-all hover:brightness-110"
                  style={{ backgroundColor: config.primaryColor }}
                >
                  Mở Toàn Bộ Trang Cấu Hình →
                </Link>
                <button
                  type="button"
                  onClick={resetConfig}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
                  title={t("resetDefaults")}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
