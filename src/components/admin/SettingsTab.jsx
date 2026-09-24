import React, { useState, useEffect } from "react";
import { ShieldAlert, Power, Settings as SettingsIcon, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getAppMaintenanceConfig,
  saveAppMaintenanceConfig,
  subscribeAppMaintenanceConfig,
} from "@/lib/supabaseDb";
import {
  isPushSupported,
  getPushUnsupportedReason,
  getCurrentPushSubscription,
  subscribeAdminPush,
  unsubscribeAdminPush,
} from "@/lib/pushNotifications";
import { useAuth } from "@/lib/AuthContext";

const DEFAULT_MESSAGE = "Hệ thống đang trong thời gian bảo trì. Vui lòng quay lại sau.";

export default function SettingsTab() {
  const { user } = useAuth();
  const [config, setConfig] = useState({ enabled: false, message: DEFAULT_MESSAGE });
  const [messageDraft, setMessageDraft] = useState(DEFAULT_MESSAGE);
  const [loading, setLoading] = useState(true);

  // Thông báo đẩy (Web Push) cho THIẾT BỊ NÀY - hoạt động kể cả khi đã đóng
  // hẳn trình duyệt/tab (xem src/lib/pushNotifications.js). "supported" ===
  // false khi trình duyệt không hỗ trợ Push API HOẶC thiếu VITE_VAPID_PUBLIC_KEY
  // (chưa cấu hình Edge Function admin-push-send).
  const [pushSupported] = useState(() => isPushSupported());
  const [pushUnsupportedReason] = useState(() => getPushUnsupportedReason());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported) return;
    getCurrentPushSubscription().then((sub) => setPushSubscribed(!!sub));
  }, [pushSupported]);

  const handleTogglePush = async () => {
    setPushBusy(true);
    try {
      if (pushSubscribed) {
        await unsubscribeAdminPush();
        setPushSubscribed(false);
        toast.success("Đã tắt thông báo đẩy trên thiết bị này");
      } else {
        await subscribeAdminPush(user?.id);
        setPushSubscribed(true);
        toast.success("Đã bật thông báo đẩy - bạn sẽ nhận được ngay cả khi không mở ứng dụng");
      }
    } catch (e) {
      toast.error(e?.message || "Không thể cập nhật thông báo đẩy");
    } finally {
      setPushBusy(false);
    }
  };

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

      <div className="p-4 rounded-2xl border-2 border-gray-200 bg-white shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                pushSubscribed ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-black">Thông báo đẩy cho quản trị viên</h3>
              <p className="text-[11px] text-gray-500 max-w-md">
                Nhận thông báo NGAY trên thiết bị này khi có yêu cầu Nạp/Rút tiền mới, hợp đồng đầu tư
                vừa được ký, tin nhắn CSKH mới, hoặc có hội viên mới đăng ký - kể cả khi đã đóng hẳn
                trình duyệt, không cần mở ứng dụng.
              </p>
              {pushUnsupportedReason === "ios_needs_install" && (
                <p className="text-[10.5px] text-amber-700 mt-1">
                  Trên iPhone/iPad: bấm nút <strong>Chia sẻ</strong> trong Safari → <strong>"Thêm vào Màn hình chính"</strong>,
                  rồi mở lại app từ biểu tượng vừa thêm (không phải từ Safari) trước khi bật thông báo.
                </p>
              )}
              {pushUnsupportedReason === "missing_vapid_key" && (
                <p className="text-[10.5px] text-amber-700 mt-1">
                  Hệ thống chưa cấu hình xong thông báo đẩy (thiếu VITE_VAPID_PUBLIC_KEY lúc build) - liên hệ kỹ thuật.
                </p>
              )}
              {pushUnsupportedReason === "unsupported_browser" && (
                <p className="text-[10.5px] text-amber-700 mt-1">
                  Trình duyệt này không hỗ trợ thông báo đẩy - hãy thử Chrome/Edge/Firefox hoặc Safari phiên bản mới.
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleTogglePush}
            disabled={!pushSupported || pushBusy}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
              pushSubscribed
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                : "bg-gradient-to-r from-[#948154] to-[#7a6c44] hover:from-[#a38e5c] hover:to-[#6a5d3a] text-white"
            }`}
          >
            {pushBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
            {pushSubscribed ? "TẮT THÔNG BÁO" : "BẬT THÔNG BÁO"}
          </button>
        </div>
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
