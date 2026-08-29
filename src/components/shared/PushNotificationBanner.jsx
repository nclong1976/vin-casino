import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  TrendingUp,
  FileText,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { playSound } from "@/lib/soundFx";
import { useConfig } from "@/lib/ConfigContext";
import { useAuth } from "@/lib/AuthContext";

const TYPE_STYLES = {
  deposit: {
    icon: ArrowDownToLine,
    iconBg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    label: "Nạp tiền vào ví",
  },
  withdraw: {
    icon: ArrowUpFromLine,
    iconBg: "bg-orange-500/20 text-orange-400 border-orange-500/40",
    badge: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    label: "Rút tiền về ngân hàng",
  },
  contract: {
    icon: FileText,
    iconBg: "bg-amber-500/20 text-[#e8c87a] border-amber-500/40",
    badge: "bg-amber-500/20 text-amber-200 border-amber-500/30",
    label: "Hợp đồng đầu tư",
  },
  profit: {
    icon: TrendingUp,
    iconBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    label: "Lợi nhuận đầu tư",
  },
  wallet: {
    icon: Wallet,
    iconBg: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    label: "Biến động ví",
  },
  default: {
    icon: Bell,
    iconBg: "bg-[#948154]/20 text-[#e8c87a] border-[#948154]/40",
    badge: "bg-[#948154]/20 text-amber-200 border-[#948154]/30",
    label: "Thông báo VinClub",
  },
};

export default function PushNotificationBanner() {
  const { user } = useAuth();
  const [currentPush, setCurrentPush] = useState(null);
  const seenIdsRef = useRef(new Set());
  const initialFetchDone = useRef(false);
  const timerRef = useRef(null);
  const { config } = useConfig();

  // Request browser notification permission silently if requested
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      // Available for user toggle
    }
  }, []);

  // Trigger push alert
  const triggerPushAlert = (data) => {
    // Clear previous timer
    if (timerRef.current) clearTimeout(timerRef.current);

    setCurrentPush(data);

    // Play sound if enabled
    if (config?.soundEnabled !== false) {
      playSound("notification", config?.soundVolume || 80);
    }

    // Trigger HTML5 Web Browser Notification if permitted
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(data.title || "VinClub Thông Báo", {
          body: data.content || "",
          icon: "https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/dfe1d99ce_63395f89e_94bc0a06ce8c2d0050dd667426523002cd25fb3c.png",
        });
      } catch (err) {
        // ignore
      }
    }

    // Trigger global balance update event so active views re-fetch live data
    window.dispatchEvent(new CustomEvent("vinclub:balance_updated", { detail: data }));

    // Auto dismiss after 6 seconds
    timerRef.current = setTimeout(() => {
      setCurrentPush(null);
    }, 6000);
  };

  // Real-time listener for database Notifications entity
  useEffect(() => {
    if (!user) return;

    // First load: populate seen IDs without alerting for old past notifications
    base44.entities.Notification.list("-created_date", 20)
      .then((list) => {
        list.forEach((n) => seenIdsRef.current.add(n.id));
        initialFetchDone.current = true;
      })
      .catch(() => {
        initialFetchDone.current = true;
      });

    // Real-time subscribe
    const unsub = base44.entities.Notification.subscribe(() => {
      if (!initialFetchDone.current) return;

      // Re-fetch notifications list
      base44.entities.Notification.list("-created_date", 10).then((list) => {
        for (const n of list) {
          if (!seenIdsRef.current.has(n.id)) {
            seenIdsRef.current.add(n.id);
            // Check if notification is for this user, global, hoặc broadcast
            // riêng cho admin (khớp đúng bộ lọc NotificationBell.jsx đang
            // dùng - trước đây thiếu nhánh "admin" nên toast không bao giờ
            // nổ cho thông báo admin-only, dù chuông vẫn hiện đúng).
            if (!n.user_id || n.user_id === user.id || (n.user_id === "admin" && user.role === "admin")) {
              triggerPushAlert({
                id: n.id,
                title: n.title,
                content: n.content,
                type: n.type || "wallet",
                time: "bây giờ",
              });
              break; // Alert the most recent new notification
            }
          }
        }
      });
    });

    return () => unsub();
  }, [user, config]);

  // Listen for local custom push events from inside app
  useEffect(() => {
    const handleCustomPush = (e) => {
      if (e.detail) {
        triggerPushAlert({
          id: Date.now().toString(),
          title: e.detail.title || "Thông báo biến động",
          content: e.detail.content || "",
          type: e.detail.type || "wallet",
          time: "bây giờ",
        });
      }
    };

    window.addEventListener("vinclub:push_notification", handleCustomPush);
    return () => window.removeEventListener("vinclub:push_notification", handleCustomPush);
  }, [config]);

  if (!currentPush) return null;

  const styleConfig = TYPE_STYLES[currentPush.type] || TYPE_STYLES.default;
  const IconComponent = styleConfig.icon;

  return (
    <div className="fixed top-2.5 inset-x-0 z-[100] flex justify-center px-3 pointer-events-none">
      <AnimatePresence>
        <motion.div
          key={currentPush.id || "push-banner"}
          initial={{ y: -90, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -90, opacity: 0, scale: 0.92 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          drag="y"
          dragConstraints={{ top: -100, bottom: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.y < -30) {
              setCurrentPush(null);
            }
          }}
          className="pointer-events-auto w-full max-w-[360px] bg-[#1a1714]/92 backdrop-blur-2xl border border-[#948154]/40 rounded-[22px] p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)] text-white overflow-hidden relative cursor-grab active:cursor-grabbing select-none"
        >
          {/* Subtle Ambient Gold Glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#948154]/15 rounded-full blur-2xl pointer-events-none" />

          {/* iOS Header Bar */}
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#d4af37] to-[#8a7228] p-0.5 shadow-sm flex items-center justify-center shrink-0">
                <img
                  src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/dfe1d99ce_63395f89e_94bc0a06ce8c2d0050dd667426523002cd25fb3c.png"
                  alt="VinClub Logo"
                  className="w-full h-full object-contain rounded-xs"
                />
              </div>
              <span className="text-[10px] font-extrabold tracking-wider text-[#e8c87a] uppercase">
                VINCLUB · TÀI CHÍNH
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[9px] font-medium text-amber-100/70">
                {currentPush.time || "bây giờ"}
              </span>
              <button
                onClick={() => setCurrentPush(null)}
                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center shrink-0 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Main Content Body */}
          <div className="flex items-start gap-3">
            {/* Type Icon Badge */}
            <div
              className={`w-9 h-9 rounded-2xl border flex items-center justify-center shrink-0 shadow-md ${styleConfig.iconBg}`}
            >
              <IconComponent className="w-4.5 h-4.5 stroke-[2.2]" />
            </div>

            {/* Notification Title & Body */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className={`text-[8px] font-black px-1.5 py-0.2 rounded-md border uppercase tracking-wide ${styleConfig.badge}`}
                >
                  {styleConfig.label}
                </span>
              </div>

              <h4 className="text-[12.5px] font-black text-[#f3d38c] leading-snug truncate">
                {currentPush.title}
              </h4>

              <p className="text-[10.5px] text-gray-200 font-medium leading-relaxed line-clamp-2 mt-0.5">
                {currentPush.content}
              </p>
            </div>
          </div>

          {/* iOS Swipe Bar & Footer */}
          <div className="mt-2.5 pt-1.5 border-t border-white/10 flex items-center justify-between text-[9px] text-amber-200/80 font-medium">
            <span className="flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-amber-400" /> Vừa cập nhật ví
            </span>
            <span className="flex items-center gap-0.5 font-bold text-[#e8c87a]">
              Vuốt lên để ẩn <ChevronRight className="w-2.5 h-2.5 rotate-[-90deg]" />
            </span>
          </div>

          {/* Drag Pill Handle */}
          <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-1.5" />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
