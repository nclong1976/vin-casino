import React, { createContext, useContext, useState, useEffect } from "react";
import { locales } from "@/locales/localesData";
import { playSound } from "@/lib/soundFx";
import { toast } from "@/components/ui/use-toast";

const defaultConfig = {
  appId: "vinclub_prestige_v1",
  appBaseUrl: "https://your-app.base44.app",
  functionsVersion: "v1",
  port: "3000",
  nodeEnv: "production",
  jwtSecret: "your_jwt_secret_key_2026",
  primaryColor: "#c5a070",
  themeMode: "dark", // "dark" | "obsidian" | "light"
  fontFamily: "Hanken Grotesk",
  locale: "vi",
  soundEnabled: true,
  soundVolume: 80,
  pushNotificationOtp: true,
  pushNotificationDelay: 600,
  otpOnRegister: false,
  termsModalOnRegister: true,
  gameWinMultiplier: 1.95,
  devicePreviewMode: "auto", // "auto" | "mobile" | "tablet" | "desktop"
};

const ConfigContext = createContext(null);

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("vinclub_app_config");
      if (saved) {
        return { ...defaultConfig, ...JSON.parse(saved) };
      }
    } catch (err) {
      console.warn("Could not load config from localStorage", err);
    }
    return defaultConfig;
  });

  // Apply theme root CSS variables dynamically
  useEffect(() => {
    try {
      const root = document.documentElement;
      root.style.setProperty("--primary-color", config.primaryColor);
      root.style.setProperty("--font-family", config.fontFamily);
      
      // Store in localStorage
      localStorage.setItem("vinclub_app_config", JSON.stringify(config));
    } catch (e) {
      console.warn("Error updating CSS vars", e);
    }
  }, [config]);

  const updateConfig = (newSettings) => {
    setConfig((prev) => {
      const updated = { ...prev, ...newSettings };
      if (updated.soundEnabled) {
        playSound("click", updated.soundVolume);
      }
      return updated;
    });
  };

  const resetConfig = () => {
    setConfig(defaultConfig);
    localStorage.removeItem("vinclub_app_config");
    toast({
      title: "Đã khôi phục cài đặt mặc định",
      description: "Tất cả thông số đã được đưa về cấu hình ban đầu.",
    });
    if (defaultConfig.soundEnabled) {
      playSound("notification", defaultConfig.soundVolume);
    }
  };

  const triggerSound = (type = "click") => {
    if (config.soundEnabled) {
      playSound(type, config.soundVolume);
    }
  };

  // Translation helper function t("key")
  const t = (key) => {
    const currentDict = locales[config.locale]?.translations || locales.vi.translations;
    return currentDict[key] || locales.vi.translations[key] || key;
  };

  const exportConfigJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `vinclub_config_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast({
      title: "Đã xuất tập tin cấu hình",
      description: "File JSON đã được tải về thiết bị của bạn.",
    });
  };

  const importConfigJson = (jsonString) => {
    try {
      const parsed = JSON.parse(jsonString);
      setConfig((prev) => ({ ...prev, ...parsed }));
      toast({
        title: "Nhập cấu hình thành công",
        description: "Các thông số đã được cập nhật.",
      });
      triggerSound("win");
    } catch (err) {
      toast({
        title: "Lỗi định dạng JSON",
        description: "Tập tin không hợp lệ, vui lòng kiểm tra lại.",
        variant: "destructive"
      });
    }
  };

  return (
    <ConfigContext.Provider
      value={{
        config,
        updateConfig,
        resetConfig,
        triggerSound,
        t,
        exportConfigJson,
        importConfigJson,
        locales,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
};
