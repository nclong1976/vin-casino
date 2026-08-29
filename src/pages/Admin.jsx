import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  ArrowLeft,
  Bell,
  TrendingUp,
  Dices,
  LogOut,
  Newspaper
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import OverviewTab from "@/components/admin/OverviewTab";
import MemberHubTab from "@/components/admin/MemberHubTab";
import ProjectsTab from "@/components/admin/ProjectsTab";
import NotificationsTab from "@/components/admin/NotificationsTab";
import StocksTab from "@/components/admin/StocksTab";
import CasinoTab from "@/components/admin/CasinoTab";
import NewsTab from "@/components/admin/NewsTab";

// "Hợp đồng" đã gộp vào subtab thứ 4 của "Quản lý Hội viên & Giao dịch"
// (MemberHubTab) - cùng bản chất "hàng chờ duyệt" như subtab Phê duyệt
// Giao dịch, tách tab riêng chỉ gây phân mảnh điều hướng không cần thiết.
const TABS = [
  { id: "member_hub", label: "Quản lý Hội viên & Giao dịch", icon: Users },
  { id: "stocks", label: "Đầu tư chứng khoán", icon: TrendingUp },
  { id: "casino", label: "Quản lý Casino", icon: Dices },
  { id: "projects", label: "Dự án", icon: FolderOpen },
  { id: "news", label: "Tin tức", icon: Newspaper },
  { id: "notifications", label: "Thông báo", icon: Bell },
];

export default function Admin() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [tab, setTab] = useState("member_hub");
  const [stats, setStats] = useState({});
  // "Tổng quan" không còn là tab riêng - gộp thành dải số liệu gọn có thể
  // thu/mở phía trên thanh tab, mặc định thu gọn để không chiếm chỗ trên
  // mọi tab.
  const [showOverview, setShowOverview] = useState(false);
  // "Đi tới Dự án" từ tab Chứng khoán mở đúng luôn bộ lọc STOCKS thay vì
  // bắt admin tự bấm lại - reset về "ALL" mỗi lần set để lần bấm sau (từ
  // 1 nơi khác, nếu có) không vô tình kẹt lại filter cũ.
  const [projectsInitialFilter, setProjectsInitialFilter] = useState("ALL");

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
      const pendingContractsCount = signedTxs.filter((t) => (t.contract_status || "pending") === "pending").length;
      // "Hợp đồng" giờ là subtab của "Quản lý Hội viên & Giao dịch" - gộp
      // luôn vào tổng badge của tab đó thay vì có badge riêng ở 1 tab đã
      // không còn tồn tại.
      const totalPendingHub = pendingWithdrawalsCount + pendingDepositsCount + unreadMessagesCount + pendingContractsCount;

      setStats({
        users: users.length,
        pendingContracts: pendingContractsCount,
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
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                tab === t.id ? "text-white font-bold" : "text-gray-500 hover:bg-gray-100 hover:text-black"
              }`}
            >
              {/* Pill nền trượt mượt sang tab đang chọn thay vì đổi màu tức
                  thời - layoutId dùng chung giữa các nút khiến framer-motion
                  tự animate vị trí/kích thước khi phần tử có layoutId này
                  chuyển sang nút khác. */}
              {tab === t.id && (
                <motion.span
                  layoutId="admin-tab-active-bg"
                  className="absolute inset-0 bg-[#948154] rounded-lg shadow-xs"
                  transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                />
              )}
              {/* Bọc nội dung trong span "relative z-10" thay vì ép pill
                  z-index âm - pill có transform animation (layoutId) kết hợp
                  z-index âm từng khiến chữ/icon bị che khuất phía sau pill
                  ngay khi tab đó đang active. */}
              <span className="relative z-10 flex items-center gap-1.5">
                <t.icon className="w-4 h-4" />
                {t.label}
                {t.id === "member_hub" && stats.totalPendingHub > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[8px] font-bold animate-pulse">
                    {stats.totalPendingHub}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        {/* "Tổng quan" không còn là tab riêng - dải số liệu này thu/mở
            được, hiện ở mọi tab thay vì phải bấm sang 1 tab tách biệt chỉ
            để xem số liệu (tab đó vốn không có thao tác quản trị nào). */}
        <div className="max-w-4xl mx-auto px-4 pb-2">
          <button
            onClick={() => setShowOverview((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 text-[11px] font-medium transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <LayoutDashboard className="w-3.5 h-3.5" /> Tổng quan hệ thống
            </span>
            <span className="text-[10px]">{showOverview ? "Thu gọn ▴" : "Xem số liệu ▾"}</span>
          </button>
          <AnimatePresence>
            {showOverview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="pt-2 max-h-[70vh] overflow-y-auto">
                  <OverviewTab stats={stats} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4 overflow-hidden">
        <AdminErrorBoundary resetKey={tab}>
          {/* mode="wait" đợi tab cũ fade-out xong mới fade-in tab mới, tránh
              2 tab chồng lên nhau lúc chuyển tiếp. key={tab} là thứ báo cho
              AnimatePresence biết "đây là nội dung mới" để chạy exit/enter. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              {tab === "member_hub" && <MemberHubTab />}
              {tab === "stocks" && (
                <StocksTab
                  onNavigateToProjects={() => {
                    setProjectsInitialFilter("STOCKS");
                    setTab("projects");
                  }}
                />
              )}
              {tab === "casino" && <CasinoTab />}
              {tab === "projects" && <ProjectsTab initialCategoryFilter={projectsInitialFilter} />}
              {tab === "news" && <NewsTab />}
              {tab === "notifications" && <NotificationsTab />}
            </motion.div>
          </AnimatePresence>
        </AdminErrorBoundary>
      </div>
    </div>
  );
}