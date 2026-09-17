import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  ArrowLeft,
  Bell,
  TrendingUp,
  LogOut,
  Newspaper,
  Settings as SettingsIcon
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { countSupabaseUsers } from "@/lib/supabaseDb";
import { useAuth } from "@/lib/AuthContext";
import { useConfig } from "@/lib/ConfigContext";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import AnimatedTabPanel from "@/components/admin/AnimatedTabPanel";
import OverviewTab from "@/components/admin/OverviewTab";
import MemberHubTab from "@/components/admin/MemberHubTab";
import ProjectsTab from "@/components/admin/ProjectsTab";
import NotificationsTab from "@/components/admin/NotificationsTab";
import InvestmentCasinoTab from "@/components/admin/InvestmentCasinoTab";
import NewsTab from "@/components/admin/NewsTab";
import SettingsTab from "@/components/admin/SettingsTab";

// "Hợp đồng" đã gộp vào subtab thứ 4 của "Quản lý Hội viên & Giao dịch"
// (MemberHubTab) - cùng bản chất "hàng chờ duyệt" như subtab Phê duyệt
// Giao dịch, tách tab riêng chỉ gây phân mảnh điều hướng không cần thiết.
// "Đầu tư chứng khoán" + "Quản lý Casino" gộp tương tự thành 2 subtab của
// 1 tab "Đầu tư CK & Casino" (InvestmentCasinoTab.jsx) - cùng nhóm vận
// hành sản phẩm đầu tư/giải trí, tách riêng chỉ chiếm thêm chỗ trên thanh
// tab cấp cao nhất mà không có lý do nghiệp vụ nào bắt buộc phải tách.
const TABS = [
  { id: "member_hub", label: "Quản lý Hội viên & Giao dịch", icon: Users },
  { id: "investment_casino", label: "Đầu tư CK & Casino", icon: TrendingUp },
  { id: "projects", label: "Dự án", icon: FolderOpen },
  { id: "news", label: "Tin tức", icon: Newspaper },
  { id: "notifications", label: "Thông báo", icon: Bell },
  { id: "settings", label: "Cài đặt hệ thống", icon: SettingsIcon },
];

export default function Admin() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { triggerSound } = useConfig();
  const [tab, setTab] = useState("member_hub");
  const [stats, setStats] = useState({});
  // Id tin nhắn đã biết - dùng để phát hiện "tin khách MỚI thật sự" (không
  // phải admin tự gửi/sửa/đánh dấu đã đọc) từ callback Message.subscribe()
  // bên dưới, để phát âm thanh báo động ngay cả khi Admin đang ở tab con
  // khác (Casino, Dự án...), không chỉ khi đang mở đúng khung chat CSKH.
  // null = chưa seed (lượt callback đầu tiên lúc mount, dữ liệu cũ có sẵn -
  // không phát âm thanh cho những tin đã tồn tại từ trước).
  const knownMessageIdsRef = useRef(null);
  // "Tổng quan" không còn là tab riêng - gộp thành dải số liệu gọn có thể
  // thu/mở phía trên thanh tab, mặc định thu gọn để không chiếm chỗ trên
  // mọi tab.
  const [showOverview, setShowOverview] = useState(false);
  // "Đi tới Dự án" từ tab Chứng khoán mở đúng luôn bộ lọc STOCKS thay vì
  // bắt admin tự bấm lại. Dùng "nonce" tăng dần mỗi lần bấm (không chỉ set
  // giá trị filter) vì ProjectsTab giờ luôn được mount sẵn (xem bên dưới -
  // không còn unmount/remount mỗi lần đổi tab để tránh tải lại dữ liệu) -
  // nếu chỉ set lại đúng chuỗi "STOCKS" y hệt lần trước, useEffect phía
  // ProjectsTab sẽ không thấy giá trị đổi nên không áp dụng lại, khiến bấm
  // lần 2 liên tiếp vô tác dụng nếu admin đã tự đổi filter khác ở giữa.
  const [projectsFilterRequest, setProjectsFilterRequest] = useState({ filter: "ALL", nonce: 0 });
  const requestProjectsFilter = (filter) =>
    setProjectsFilterRequest((r) => ({ filter, nonce: r.nonce + 1 }));

  const fetchStats = () => {
    Promise.all([
      // Chỉ cần ĐẾM (badge "Tổng hội viên"), không cần dữ liệu từng người -
      // countSupabaseUsers() dùng count:'exact', head:true nên Postgres chỉ
      // trả về 1 con số, không kéo theo toàn bộ bảng users như
      // base44.entities.User.list() (đã sửa lỗi này ở supabaseDb.js).
      countSupabaseUsers().catch(() => 0),
      base44.entities.Transaction.filter({ signature_content: { $exists: true } }, "-created_date", 100).catch(() => []),
      base44.entities.Message.list("-created_date", 100).catch(() => []),
      base44.entities.Project.list().catch(() => []),
      base44.entities.Transaction.list("-created_date", 100).catch(() => []),
      base44.entities.WalletTransaction.filter({ type: "withdraw" }, "-created_date", 200).catch(() => []),
      base44.entities.WalletTransaction.filter({ type: "deposit" }, "-created_date", 200).catch(() => []),
    ]).then(([usersCount, signedTxs, messages, projects, allTxs, wTxs, dTxs]) => {
      const totalInvested = allTxs.reduce((s, t) => s + (t.amount || 0), 0);
      const totalProfit = allTxs.reduce((s, t) => s + (t.profit || 0), 0);
      const pendingWithdrawalsCount = wTxs.filter((t) => (t.status || "pending") === "pending").length;
      const pendingDepositsCount = dTxs.filter((t) => (t.status || "pending") === "pending").length;
      const unreadMessagesCount = messages.filter((m) => m.sender === "user" && !m.read_at).length;
      const pendingContractsCount = signedTxs.filter((t) => (t.contract_status || "pending") === "pending").length;
      // "Hợp đồng" giờ là subtab của "Quản lý Hội viên & Giao dịch" - gộp
      // luôn vào tổng badge của tab đó thay vì có badge riêng ở 1 tab đã
      // không còn tồn tại.
      const totalPendingHub = pendingWithdrawalsCount + pendingDepositsCount + unreadMessagesCount + pendingContractsCount;

      setStats({
        users: usersCount,
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

  // Báo động (âm thanh) khi có tin nhắn KHÁCH mới thật sự - diff id nhận
  // được từ callback với Set id đã biết, chỉ tính sender:"user" (bỏ qua tin
  // admin tự gửi và các UPDATE như đánh dấu đã đọc/sửa tin). fetchStats() ở
  // trên đã tự refetch số liệu (kể cả unreadMessages) - hàm này CHỈ lo phần
  // báo động, không lặp lại logic đếm.
  const handleMessageUpdate = (msgList) => {
    fetchStats();
    if (!Array.isArray(msgList)) return;
    if (knownMessageIdsRef.current === null) {
      knownMessageIdsRef.current = new Set(msgList.map((m) => m.id));
      return;
    }
    const hasNewUserMessage = msgList.some(
      (m) => m.sender === "user" && !knownMessageIdsRef.current.has(m.id)
    );
    msgList.forEach((m) => knownMessageIdsRef.current.add(m.id));
    if (hasNewUserMessage) triggerSound("notification");
  };

  useEffect(() => {
    fetchStats();

    const unsubs = [
      base44.entities.User.subscribe(() => fetchStats()),
      base44.entities.WalletTransaction.subscribe(() => fetchStats()),
      base44.entities.Message.subscribe(handleMessageUpdate),
      base44.entities.Signature.subscribe(() => fetchStats()),
      base44.entities.Notification.subscribe(() => fetchStats()),
      base44.entities.Transaction.subscribe(() => fetchStats()),
    ];

    return () => {
      unsubs.forEach((u) => typeof u === "function" && u());
    };
  }, []);

  // Tiêu đề tab hiện số tin CSKH chưa đọc (kiểu Gmail/Messenger) - để Admin
  // biết ngay có tin mới dù đang mở tab trình duyệt khác, không chỉ badge
  // trong app. Khôi phục tiêu đề gốc khi rời trang Admin.
  useEffect(() => {
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = stats.unreadMessages > 0 ? `(${stats.unreadMessages}) ${baseTitle}` : baseTitle;
    return () => {
      document.title = baseTitle;
    };
  }, [stats.unreadMessages]);

  return (
    <div className="min-h-screen bg-gray-50 font-heading">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 pt-[env(safe-area-inset-top)]">
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

      {/* Mọi tab đều luôn mount sẵn (AnimatedTabPanel chỉ ẩn/hiện bằng class
          "hidden" - CSS - thay vì gỡ hẳn khỏi DOM như trước) nên tab cũ
          không còn bị mất dữ liệu/phải tải lại mỗi lần quay lại. Hiệu ứng
          fade + trượt nhẹ khi chuyển tab vẫn giữ nguyên như thiết kế gốc -
          AnimatedTabPanel tự chạy lại animation đó mỗi lần "active" bật lên
          mà không cần unmount (xem AnimatedTabPanel.jsx). Mỗi tab có
          AdminErrorBoundary RIÊNG (không dùng chung 1 boundary + resetKey
          như trước) vì nội dung mỗi khối giờ cố định, không còn đổi qua đổi
          lại giữa các tab để cần tín hiệu "nội dung mới, xoá lỗi cũ" nữa. */}
      <div className="max-w-4xl mx-auto px-4 py-4 overflow-hidden">
        <AnimatedTabPanel active={tab === "member_hub"}>
          <AdminErrorBoundary><MemberHubTab /></AdminErrorBoundary>
        </AnimatedTabPanel>
        <AnimatedTabPanel active={tab === "investment_casino"}>
          <AdminErrorBoundary>
            <InvestmentCasinoTab
              onNavigateToProjects={() => {
                requestProjectsFilter("STOCKS");
                setTab("projects");
              }}
            />
          </AdminErrorBoundary>
        </AnimatedTabPanel>
        <AnimatedTabPanel active={tab === "projects"}>
          <AdminErrorBoundary><ProjectsTab filterRequest={projectsFilterRequest} /></AdminErrorBoundary>
        </AnimatedTabPanel>
        <AnimatedTabPanel active={tab === "news"}>
          <AdminErrorBoundary><NewsTab /></AdminErrorBoundary>
        </AnimatedTabPanel>
        <AnimatedTabPanel active={tab === "notifications"}>
          <AdminErrorBoundary><NotificationsTab /></AdminErrorBoundary>
        </AnimatedTabPanel>
        <AnimatedTabPanel active={tab === "settings"}>
          <AdminErrorBoundary><SettingsTab /></AdminErrorBoundary>
        </AnimatedTabPanel>
      </div>
    </div>
  );
}