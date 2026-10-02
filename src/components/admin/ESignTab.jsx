import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, FileText, Inbox, LayoutDashboard, Send, Settings } from "lucide-react";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import LetterheadLibrary from "@/components/admin/esign/LetterheadLibrary";
import TemplateLibrary from "@/components/admin/esign/TemplateLibrary";
import UserGroupsManager from "@/components/admin/esign/UserGroupsManager";
import DispatchWizard from "@/components/admin/esign/DispatchWizard";
import CampaignDashboard from "@/components/admin/esign/CampaignDashboard";
import EsignOverview from "@/components/admin/esign/EsignOverview";
import DocumentsBoard from "@/components/admin/esign/DocumentsBoard";
import { Button, Segmented } from "@/components/admin/esign/ui";

// 4 mục chính; việc gửi văn bản là nút riêng luôn hiện ở góc phải.
const SUBTABS = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "sent", label: "Văn bản đã gửi", icon: Inbox },
  { id: "templates", label: "Mẫu văn bản", icon: FileText },
  { id: "settings", label: "Cài đặt", icon: Settings },
];

/**
 * Tab "Văn bản" - ký văn bản điện tử. Tối giản cho Admin: Tổng quan → Gửi
 * văn bản (nút chính) → theo dõi ở "Văn bản đã gửi"; Khung văn bản + Nhóm
 * người nhận gom vào "Cài đặt" vì chỉ cần thiết lập một lần.
 */
export default function ESignTab() {
  const [sub, setSub] = useState("overview");
  const [sentView, setSentView] = useState("documents"); // documents | campaigns
  const [settingsView, setSettingsView] = useState("letterheads"); // letterheads | groups
  const [boardFilter, setBoardFilter] = useState(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchTemplateId, setDispatchTemplateId] = useState(null);

  const openBoard = (filter) => {
    setBoardFilter({ ...filter });
    setSentView("documents");
    setSub("sent");
    setDispatching(false);
  };

  const startDispatch = (templateId = null) => {
    setDispatchTemplateId(templateId);
    setDispatching(true);
  };

  // Điều hướng từ Tổng quan (tên cũ vẫn được nhận).
  const navigate = (target) => {
    if (target === "dispatch") return startDispatch();
    if (target === "campaigns") {
      setSentView("campaigns");
      setSub("sent");
    } else if (target === "letterheads" || target === "groups") {
      setSettingsView(target);
      setSub("settings");
    } else setSub(target);
    setDispatching(false);
  };

  if (dispatching) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setDispatching(false)}>
            <ArrowLeft className="w-3.5 h-3.5" /> Quay lại
          </Button>
          <h2 className="text-[13px] font-bold text-gray-900">Gửi văn bản</h2>
        </div>
        <AdminErrorBoundary>
          <DispatchWizard
            initialTemplateId={dispatchTemplateId}
            onDispatched={() => {
              setDispatchTemplateId(null);
              setDispatching(false);
              setSentView("campaigns");
              setSub("sent");
            }}
          />
        </AdminErrorBoundary>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex gap-1 overflow-x-auto scrollbar-none bg-white rounded-xl border border-gray-200 p-1">
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
        <Button onClick={() => startDispatch()} className="shrink-0 h-10">
          <Send className="w-3.5 h-3.5" /> Gửi văn bản
        </Button>
      </div>

      <AdminErrorBoundary>
        {sub === "overview" && <EsignOverview onOpenBoard={openBoard} onNavigate={navigate} />}
        {sub === "sent" && (
          <div className="space-y-3">
            <Segmented
              value={sentView}
              onChange={setSentView}
              options={[
                ["documents", "Từng văn bản"],
                ["campaigns", "Theo đợt gửi"],
              ]}
            />
            {sentView === "documents" ? <DocumentsBoard initialFilter={boardFilter} /> : <CampaignDashboard />}
          </div>
        )}
        {sub === "templates" && <TemplateLibrary onDispatch={startDispatch} />}
        {sub === "settings" && (
          <div className="space-y-3">
            <Segmented
              value={settingsView}
              onChange={setSettingsView}
              options={[
                ["letterheads", "Khung văn bản (logo, con dấu, chữ ký)"],
                ["groups", "Nhóm người nhận"],
              ]}
            />
            {settingsView === "letterheads" ? <LetterheadLibrary /> : <UserGroupsManager />}
          </div>
        )}
      </AdminErrorBoundary>
    </div>
  );
}
