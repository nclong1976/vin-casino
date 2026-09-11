import React, { useState, useEffect } from "react";
import { ShieldAlert, Power, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import {
  getAppMaintenanceConfig,
  saveAppMaintenanceConfig,
  subscribeAppMaintenanceConfig,
} from "@/lib/supabaseDb";

const DEFAULT_MESSAGE = "Hệ thống đang trong thời gian bảo trì. Vui lòng quay lại sau.";

export default function SettingsTab() {
  const [config, setConfig] = useState({ enabled: false, message: DEFAULT_MESSAGE });
  const [messageDraft, setMessageDraft] = useState(DEFAULT_MESSAGE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const remote = await getAppMaintenanceConfig();
      if (cancelled) return;
      const next = { enabled: !!remote?.enabled, message: remote?.message || DEFAULT_MESSAGE };
      setConfig(next);
      setMessageDraft(next.message);
      setLoading(false);
    })();

    // Đồng bộ nếu có tab/thiết bị admin khác cũng đang mở và vừa đổi.
    const unsubRealtime = subscribeAppMaintenanceConfig((remote) => {
      if (cancelled || !remote) return;
      const next = { enabled: !!remote.enabled, message: remote.message || DEFAULT_MESSAGE };
      setConfig(next);
      setMessageDraft(next.message);
    });

    return () => {
      cancelled = true;
      if (typeof unsubRealtime === "function") unsubRealtime();
    };
  }, []);

  const handleToggle = async () => {
    const nextVal = !config.enabled;
    const newCfg = { ...config, enabled: nextVal };
    setConfig(newCfg);
    const ok = await saveAppMaintenanceConfig(newCfg);
    if (!ok) {
      toast.error("Lỗi khi lưu, vui lòng thử lại");
      setConfig((c) => ({ ...c, enabled: !nextVal }));
      return;
    }
    toast[nextVal ? "error" : "success"](
      nextVal ? "ĐÃ BẬT BẢO TRÌ TOÀN BỘ TRANG CHỦ!" : "ĐÃ TẮT BẢO TRÌ - TRANG CHỦ HOẠT ĐỘNG BÌNH THƯỜNG"
    );
  };

  const handleMessageBlur = async () => {
    const trimmed = messageDraft.trim() || DEFAULT_MESSAGE;
    if (trimmed === config.message) return;
    const newCfg = { ...config, message: trimmed };
    setConfig(newCfg);
    setMessageDraft(trimmed);
    const ok = await saveAppMaintenanceConfig(newCfg);
    if (ok) toast.success("Đã lưu thông báo bảo trì");
    else toast.error("Lỗi khi lưu thông báo");
  };

  if (loading) {
    return <div className="p-6 text-center text-sm text-gray-400">Đang tải...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-4 h-4 text-[#948154]" />
        <h2 className="text-sm font-bold text-black uppercase tracking-wider">Cài đặt hệ thống</h2>
      </div>

      <div
        className={`p-4 rounded-2xl border-2 transition-all shadow-md ${
          config.enabled ? "bg-red-950/20 border-red-500/80" : "bg-white border-gray-200"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                config.enabled ? "bg-red-500 text-white" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-black flex items-center gap-2">
                BẢO TRÌ TOÀN BỘ TRANG CHỦ
                {config.enabled && (
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black uppercase animate-pulse">
                    ĐANG BẢO TRÌ
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-gray-500">
                Khi bật công tắc này, TOÀN BỘ người dùng thường (không phải Admin) sẽ ngay lập tức bị
                chặn khỏi trang chủ và mọi mục bên trong, hiện màn hình bảo trì thay thế.
              </p>
            </div>
          </div>

          <button
            onClick={handleToggle}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all cursor-pointer shrink-0 ${
              config.enabled
                ? "bg-red-600 hover:bg-red-500 text-white ring-4 ring-red-500/30"
                : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white"
            }`}
          >
            <Power className="w-4 h-4" />
            {config.enabled ? "TẮT BẢO TRÌ" : "BẬT BẢO TRÌ"}
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
          <label className="text-[10.5px] font-bold text-gray-700 block">
            Thông báo hiển thị cho người dùng:
          </label>
          <textarea
            value={messageDraft}
            onChange={(e) => setMessageDraft(e.target.value)}
            onBlur={handleMessageBlur}
            rows={2}
            className="w-full text-xs p-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            placeholder={DEFAULT_MESSAGE}
          />
        </div>
      </div>
    </div>
  );
}
