import React, { useEffect, useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { getPushUnsupportedReason, isUserPushEnabled, subscribeUserPush } from "@/lib/pushNotifications";

const DISMISS_KEY = "vinclub_doc_push_dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Mời người dùng bật thông báo đẩy để nhận văn bản cần ký / nhắc hạn ngay cả
 * khi không mở ứng dụng (spec hợp đồng mục 0.2 Q2, 3.1). Ẩn khi đã bật, đã
 * tắt lời mời, hoặc trình duyệt không hỗ trợ (iPhone chưa thêm vào Màn hình
 * chính thì hiện hướng dẫn).
 */
export default function DocumentPushOptIn({ hasPending }) {
  const [state, setState] = useState("checking"); // checking | offer | ios | hidden
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (readDismissed()) {
      setState("hidden");
      return undefined;
    }
    const reason = getPushUnsupportedReason();
    if (reason === "ios_needs_install") {
      setState("ios");
      return undefined;
    }
    if (reason) {
      setState("hidden");
      return undefined;
    }
    isUserPushEnabled()
      .then((on) => alive && setState(on ? "hidden" : "offer"))
      .catch(() => alive && setState("offer"));
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // trình duyệt chặn lưu trữ - chỉ ẩn trong lần mở này
    }
    setState("hidden");
  };

  const enable = async () => {
    setBusy(true);
    try {
      await subscribeUserPush();
      toast.success("Đã bật thông báo văn bản trên thiết bị này");
      setState("hidden");
    } catch (e) {
      toast.error(e.message || "Không bật được thông báo");
    } finally {
      setBusy(false);
    }
  };

  if (state === "checking" || state === "hidden") return null;

  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#948154]/30 bg-[#948154]/10 p-2.5">
      <BellRing className="w-4 h-4 text-[#948154] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-gray-900">Nhận thông báo khi có văn bản cần ký</p>
        {state === "ios" ? (
          <p className="text-[10px] text-gray-600 mt-0.5">
            Trên iPhone/iPad: bấm nút Chia sẻ trong Safari → "Thêm vào Màn hình chính", mở app từ biểu tượng đó rồi bật thông báo tại đây.
          </p>
        ) : (
          <>
            <p className="text-[10px] text-gray-600 mt-0.5">
              {hasPending ? "Bạn đang có văn bản chờ ký. " : ""}Nhận nhắc hạn ký ngay cả khi không mở ứng dụng.
            </p>
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="mt-1.5 inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-[#948154] text-white text-[10.5px] font-semibold disabled:opacity-60"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />} Bật thông báo
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Ẩn" className="text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
