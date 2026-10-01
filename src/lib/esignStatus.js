/**
 * Trạng thái hiển thị của văn bản đã phát hành (spec hợp đồng mục 1.4, 2.5).
 * Suy ra từ cột sẵn có - khớp hàm SQL esign_display_status():
 * pending + đã xem → "viewed"; pending + đã nhận → "delivered"; pending còn
 * lại → "sent"; pending quá hạn → "expired".
 */

export const DOC_STATUS = {
  sent: { label: "Đã gửi", icon: "➤", className: "bg-sky-50 text-sky-700 border-sky-200" },
  delivered: { label: "Đã nhận", icon: "⇣", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  viewed: { label: "Đã xem", icon: "👁", className: "bg-blue-50 text-blue-700 border-blue-200" },
  signed: { label: "Đã ký", icon: "✔", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  approved: { label: "Đã duyệt", icon: "✔✔", className: "bg-emerald-600 text-white border-emerald-600" },
  rejected: { label: "Từ chối", icon: "✕", className: "bg-rose-50 text-rose-700 border-rose-200" },
  expired: { label: "Hết hạn", icon: "⏱", className: "bg-amber-50 text-amber-800 border-amber-200" },
  revoked: { label: "Thu hồi", icon: "⊘", className: "bg-gray-200 text-gray-700 border-gray-300 line-through" },
};

export const STATUS_ORDER = ["sent", "delivered", "viewed", "signed", "approved", "rejected", "expired", "revoked"];

/** Trạng thái gốc trong DB ứng với từng trạng thái hiển thị (để lọc trên server). */
export const OPEN_STATUSES = ["sent", "delivered", "viewed"];

export function displayStatus(doc, now = new Date()) {
  if (!doc) return "sent";
  if (doc.status === "pending") {
    if (doc.due_at && new Date(doc.due_at) < now) return "expired";
    if (doc.first_viewed_at) return "viewed";
    if (doc.delivered_at) return "delivered";
    return "sent";
  }
  return DOC_STATUS[doc.status] ? doc.status : "sent";
}

/** Văn bản còn mở để ký / nhắc / gia hạn / thu hồi. */
export const isOpen = (doc) => ["sent", "delivered", "viewed", "expired"].includes(displayStatus(doc)) && !doc.locked_at;
export const canRemind = (doc) => OPEN_STATUSES.includes(displayStatus(doc));
export const canExtend = (doc) => isOpen(doc);
export const canRevoke = (doc) => isOpen(doc);
export const canApprove = (doc) => doc.status === "signed";

export const EVENT_LABELS = {
  dispatched: "Đã gửi",
  delivered: "Đã nhận",
  viewed: "Đã xem",
  read_completed: "Đọc hết văn bản",
  signed: "Đã ký",
  pdf_ready: "PDF sẵn sàng",
  pdf_failed: "Tạo PDF lỗi",
  downloaded: "Tải PDF",
  reminded: "Nhắc ký",
  extended: "Gia hạn ký",
  revoked: "Thu hồi",
  expired: "Hết hạn",
  approved: "Duyệt",
  rejected: "Từ chối",
  pdf_purged: "Xoá PDF hết hạn lưu trữ",
  legal_hold_set: "Bật giữ pháp lý",
  legal_hold_released: "Tắt giữ pháp lý",
};

/** Thông tin thiết bị gọn để ghi nhật ký "đã nhận". */
export function deviceInfo() {
  if (typeof window === "undefined") return null;
  try {
    return {
      screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lang: navigator.language,
      ua: navigator.userAgent?.slice(0, 200),
    };
  } catch {
    return null;
  }
}
