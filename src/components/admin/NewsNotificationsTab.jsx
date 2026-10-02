import React, { useState } from "react";
import { Bell, Newspaper } from "lucide-react";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import NotificationsTab from "@/components/admin/NotificationsTab";
import NewsTab from "@/components/admin/NewsTab";

const VIEWS = [
  { id: "notifications", label: "Thông báo", icon: Bell },
  { id: "news", label: "Tin tức", icon: Newspaper },
];

/**
 * Tab "Tin tức & Thông báo" của Admin - gộp 2 tab cũ "Thông báo" và "Tin
 * tức" thành 1 mục. Cả 2 phần luôn được mount (chỉ ẩn/hiện) để giữ nguyên
 * trạng thái đang soạn và kết nối realtime khi chuyển qua lại.
 */
export default function NewsNotificationsTab() {
  const [view, setView] = useState("notifications");

  return (
    <div className="space-y-3">
      <div className="inline-flex gap-1 bg-white rounded-xl border border-gray-200 p-1" role="tablist" aria-label="Tin tức & Thông báo">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors ${
              view === v.id ? "bg-[#948154] text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <v.icon className="w-3.5 h-3.5" /> {v.label}
          </button>
        ))}
      </div>

      <div className={view === "notifications" ? "" : "hidden"}>
        <AdminErrorBoundary><NotificationsTab /></AdminErrorBoundary>
      </div>
      <div className={view === "news" ? "" : "hidden"}>
        <AdminErrorBoundary><NewsTab /></AdminErrorBoundary>
      </div>
    </div>
  );
}
