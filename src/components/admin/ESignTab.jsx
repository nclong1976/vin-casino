import React, { useState } from "react";
import { motion } from "framer-motion";
import { FileBadge, FileText, Users, Send, BarChart3 } from "lucide-react";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import LetterheadLibrary from "@/components/admin/esign/LetterheadLibrary";
import TemplateLibrary from "@/components/admin/esign/TemplateLibrary";
import UserGroupsManager from "@/components/admin/esign/UserGroupsManager";
import DispatchWizard from "@/components/admin/esign/DispatchWizard";
import CampaignDashboard from "@/components/admin/esign/CampaignDashboard";

const SUBTABS = [
  { id: "letterheads", label: "Khung văn bản", icon: FileBadge },
  { id: "templates", label: "Mẫu", icon: FileText },
  { id: "groups", label: "Nhóm người dùng", icon: Users },
  { id: "dispatch", label: "Phát hành", icon: Send },
  { id: "campaigns", label: "Theo dõi", icon: BarChart3 },
];

/**
 * Tab "Văn bản" - Quản lý & ký văn bản điện tử Giai đoạn 2 (xem
 * docs/design/e-sign-letterhead-spec.md mục 6). Luồng soạn/duyệt văn bản
 * tuỳ ý Giai đoạn 1 vẫn nằm ở "Quản lý Hội viên & Giao dịch" → "Soạn giấy tờ".
 */
export default function ESignTab() {
  const [sub, setSub] = useState("letterheads");
  // Mẫu được chọn sẵn khi bấm "Phát hành" từ màn Mẫu.
  const [dispatchTemplateId, setDispatchTemplateId] = useState(null);

  const startDispatch = (templateId) => {
    setDispatchTemplateId(templateId);
    setSub("dispatch");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto scrollbar-none bg-white rounded-xl border border-gray-200 p-1">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium whitespace-nowrap cursor-pointer ${
              sub === t.id ? "text-white font-bold" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {sub === t.id && (
              <motion.span layoutId="esign-subtab-active-bg" className="absolute inset-0 bg-[#948154] rounded-lg" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </span>
          </button>
        ))}
      </div>

      <AdminErrorBoundary>
        {sub === "letterheads" && <LetterheadLibrary />}
        {sub === "templates" && <TemplateLibrary onDispatch={startDispatch} />}
        {sub === "groups" && <UserGroupsManager />}
        {sub === "dispatch" && (
          <DispatchWizard
            initialTemplateId={dispatchTemplateId}
            onDispatched={() => {
              setDispatchTemplateId(null);
              setSub("campaigns");
            }}
          />
        )}
        {sub === "campaigns" && <CampaignDashboard />}
      </AdminErrorBoundary>
    </div>
  );
}
