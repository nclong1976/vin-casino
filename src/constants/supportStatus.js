// Nhãn/màu dùng chung cho trạng thái hội thoại CSKH (Support.jsx phía
// khách hàng + MessagesTab.jsx phía admin) - tách riêng ra đây để 2 nơi
// luôn hiển thị đúng cùng 1 nhãn/màu cho cùng 1 trạng thái.
export const SUPPORT_STATUS_LABELS = {
  open: "Đang mở",
  pending: "Chờ phản hồi",
  closed: "Đã đóng",
};

export const SUPPORT_STATUS_BADGE_CLASSES = {
  open: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  closed: "bg-gray-200 text-gray-500",
};

export const DEFAULT_SUPPORT_STATUS = "open";
