import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  FileCheck,
  FolderOpen,
  ArrowLeft,
  Bell,
  TrendingUp,
  Dices,
  LogOut,
  Sparkles,
  Newspaper
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import OverviewTab from "@/components/admin/OverviewTab";
import MemberHubTab from "@/components/admin/MemberHubTab";
import ContractsTab from "@/components/admin/ContractsTab";
import ProjectsTab from "@/components/admin/ProjectsTab";
import NotificationsTab from "@/components/admin/NotificationsTab";
import StocksTab from "@/components/admin/StocksTab";
import CasinoTab from "@/components/admin/CasinoTab";
import NewsTab from "@/components/admin/NewsTab";

const TABS = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "member_hub", label: "Quản lý Hội viên & Giao dịch", icon: Users },
  { id: "stocks", label: "Đầu tư chứng khoán", icon: TrendingUp },
  { id: "casino", label: "Quản lý Casino", icon: Dices },
  { id: "contracts", label: "Hợp đồng", icon: FileCheck },
  { id: "projects", label: "Dự án", icon: FolderOpen },
  { id: "news", label: "Tin tức", icon: Newspaper },
  { id: "notifications", label: "Thông báo", icon: Bell },
];

export default function Admin() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState({});

  const fetchStats = () => {
    Promise.all([
      base44.entities.User.list().catch(() => []),
      base44.entities.Transaction.filter({ signature_content: { $exists: true } }, "-created_date", 100).catch(() => []),
      base44.entities.Message.list("-created_date", 100).catch(() => []),
      base44.entities.Project.list().catch(() => []),
      base44.entities.Transaction.list("-created_date", 100).catch(() => []),
      base44.entities.WalletTransaction.filter({ type: "withdraw" }, "-created_date", 200).catch(() => []),
      base44.entities.WalletTransaction.filter({ type: "deposit" }, "-created_date", 200).catch(() => []),
    ]).then(([users, signedTxs, messages, projects, allTxs, wTxs, dTxs]) => {
      const totalInvested = allTxs.reduce((s, t) => s + (t.amount || 0), 0);
      const totalProfit = allTxs.reduce((s, t) => s + (t.profit || 0), 0);
      const pendingWithdrawalsCount = wTxs.filter((t) => (t.status || "pending") === "pending").length;
      const pendingDepositsCount = dTxs.filter((t) => (t.status || "pending") === "pending").length;
      const unreadMessagesCount = messages.filter((m) => m.sender === "user" && !m.is_read).length;
      const totalPendingHub = pendingWithdrawalsCount + pendingDepositsCount + unreadMessagesCount;

      setStats({
        users: users.length,
        pendingContracts: signedTxs.filter((t) => (t.contract_status || "pending") === "pending").length,
        pendingWithdrawals: pendingWithdrawalsCount,
        pendingDeposits: pendingDepositsCount,
        pendingTransactions: pendingWithdrawalsCount + pendingDepositsCount,
        totalPendingHub,
        approvedContracts: signedTxs.filter((t) => t.contract_status === "approved").length,
        messages: messages.length,
        unreadMessages: unreadMessagesCount,
        totalProjects: projects.length,
        activeProjects: projects.filter((p) => p.is_active).length,
        totalTransactions: allTxs.length,
        totalInvested,
        totalProfit,
      });
    });
  };

  useEffect(() => {
    fetchStats();

    let unsubs = [];
    import("@/lib/rtdbSync").then((rtdb) => {
      if (rtdb.subscribeAllUsersFromRTDB) unsubs.push(rtdb.subscribeAllUsersFromRTDB(() => fetchStats()));
      if (rtdb.subscribeWalletTransactionsFromRTDB) unsubs.push(rtdb.subscribeWalletTransactionsFromRTDB(() => fetchStats()));
      if (rtdb.subscribeMessagesFromRTDB) unsubs.push(rtdb.subscribeMessagesFromRTDB(() => fetchStats()));
      if (rtdb.subscribeSignaturesFromRTDB) unsubs.push(rtdb.subscribeSignaturesFromRTDB(() => fetchStats()));
      if (rtdb.subscribeNotificationsFromRTDB) unsubs.push(rtdb.subscribeNotificationsFromRTDB(() => fetchStats()));
      if (rtdb.subscribeTransactionsFromRTDB) unsubs.push(rtdb.subscribeTransactionsFromRTDB(() => fetchStats()));
    }).catch(() => null);

    return () => {
      unsubs.forEach((u) => typeof u === "function" && u());
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 font-heading">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 transition-colors shrink-0 cursor-pointer"
              title="Quay lại"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-[15px] font-bold text-black">Bảng quản trị</h1>
              <p className="text-[10px] text-gray-400">VinClub Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold px-2 py-1 rounded-full bg-[#948154]/10 text-[#948154]">
              ADMIN
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 hover:bg-red-100 text-red-600 text-[10.5px] font-bold transition-all border border-red-200 cursor-pointer"
              title="Đăng xuất"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                tab === t.id
                  ? "bg-[#948154] text-white shadow-xs font-bold"
                  : "text-gray-500 hover:bg-gray-100 hover:text-black"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.id === "member_hub" && stats.totalPendingHub > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[8px] font-bold animate-pulse">
                  {stats.totalPendingHub}
                </span>
              )}
              {t.id === "contracts" && stats.pendingContracts > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[8px] font-bold">
                  {stats.pendingContracts}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        <AdminErrorBoundary resetKey={tab}>
          {tab === "overview" && <OverviewTab stats={stats} />}
          {tab === "member_hub" && <MemberHubTab />}
          {tab === "stocks" && <StocksTab />}
          {tab === "casino" && <CasinoTab />}
          {tab === "contracts" && <ContractsTab />}
          {tab === "projects" && <ProjectsTab />}
          {tab === "news" && <NewsTab />}
          {tab === "notifications" && <NotificationsTab />}
        </AdminErrorBoundary>
      </div>
    </div>
  );
}