import React, { useState, useEffect } from "react";
import { Users, ArrowRightLeft, FileSignature } from "lucide-react";
import { motion } from "framer-motion";
import UsersTab from "@/components/admin/UsersTab";
import TransactionsTab from "@/components/admin/TransactionsTab";
import ContractsTab from "@/components/admin/ContractsTab";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import AnimatedTabPanel from "@/components/admin/AnimatedTabPanel";
import { base44 } from "@/api/base44Client";
import { countSupabaseUsers } from "@/lib/supabaseDb";

// "Tin nhắn CSKH" đã tách thành tab cấp cao nhất riêng ở Admin.jsx (xem ghi
// chú ở TABS trong file đó) - onNavigateToChat giờ truyền TỪ Admin.jsx
// xuống đây (thay vì tự quản lý subtab "messages" cục bộ như trước), chỉ
// còn việc CHUYỂN TIẾP prop này cho UsersTab/TransactionsTab, không còn giữ
// state/khung chat gì ở component này nữa.
export default function MemberHubTab({ initialSubTab = "users", onNavigateToChat = null }) {
  const [subTab, setSubTab] = useState(initialSubTab); // 'users' | 'transactions' | 'contracts'

  // Cross-navigation states
  const [txSearchQuery, setTxSearchQuery] = useState("");

  // Live badge counts
  const [pendingTxCount, setPendingTxCount] = useState(0);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [pendingContractsCount, setPendingContractsCount] = useState(0);

  const fetchHubStats = () => {
    Promise.all([
      base44.entities.WalletTransaction.filter({ status: "pending" }, "-created_date", 200).catch(() => []),
      // Chỉ cần ĐẾM (badge "Tổng hội viên"), không cần dữ liệu từng người -
      // countSupabaseUsers() dùng count:'exact', head:true nên Postgres chỉ
      // trả về 1 con số. Trước đây dùng base44.entities.User.list() (SELECT
      // * FROM users KHÔNG giới hạn) chỉ để lấy .length rồi vứt hết dữ liệu
      // - hàm này bị gọi lại mỗi khi có 1 giao dịch/hội viên mới ở BẤT KỲ
      // đâu (2 subscribe bên dưới), nên đây là 1 trong những nguồn tốn kém
      // nhất trong toàn app.
      countSupabaseUsers().catch(() => 0),
      // "Hợp đồng" trước đây là tab riêng ở Admin.jsx (đọc Transaction có
      // chữ ký) - giờ gộp làm subtab thứ 3 tại đây, cần đếm số hợp đồng
      // đang chờ duyệt để hiện badge y hệt cách subtab kia đang làm.
      base44.entities.Transaction.filter({ signature_content: { $exists: true } }, "-created_date", 100).catch(() => []),
    ]).then(([pendingTxs, usersCount, signedTxs]) => {
      setPendingTxCount((pendingTxs || []).length);
      setTotalUsersCount(usersCount);
      setPendingContractsCount((signedTxs || []).filter((t) => (t.contract_status || "pending") === "pending").length);
    });
  };

  useEffect(() => {
    fetchHubStats();

    // Listen to real-time sync events
    const unsubTx = base44.entities.WalletTransaction.subscribe(() => fetchHubStats());
    // Trước đây "Tổng hội viên" chỉ được tính lại như 1 tác dụng phụ mỗi khi
    // CÓ giao dịch mới - hội viên vừa đăng ký xong (chưa nạp/rút gì) sẽ
    // không làm badge này tăng cho tới khi có 1 sự kiện khác xảy ra.
    // Subscribe thẳng vào bảng users để đếm đúng ngay khi có người đăng ký
    // mới.
    const unsubUsers = base44.entities.User.subscribe(() => fetchHubStats());

    const handleBalUpdate = () => fetchHubStats();
    window.addEventListener("vinclub:balance_updated", handleBalUpdate);

    return () => {
      if (typeof unsubTx === "function") unsubTx();
      if (typeof unsubUsers === "function") unsubUsers();
      window.removeEventListener("vinclub:balance_updated", handleBalUpdate);
    };
  }, []);

  const handleNavigateToTransactions = (query) => {
    setTxSearchQuery(query || "");
    setSubTab("transactions");
  };

  return (
    <div className="space-y-3.5">
      {/* ── Sub-Navigation Master Hub Switcher ── */}
      <div className="bg-white rounded-2xl p-1.5 border border-gray-200/90 shadow-xs">
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
          {/* SubTab 1: Hội viên */}
          <button
            onClick={() => { setSubTab("users"); }}
            className={`relative flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
              subTab === "users" ? "text-white" : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            {subTab === "users" && (
              <motion.span
                layoutId="member-hub-subtab-active-bg"
                className="absolute inset-0 bg-[#948154] rounded-xl shadow-xs"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            {/* Bọc riêng nội dung trong span "relative z-10" thay vì ép pill
                z-index âm - pill với transform animation (layoutId) + z-index
                âm từng khiến chữ/icon bị che khuất phía sau pill lúc chuyển
                tab (xem ghi chú tương tự ở Admin.jsx). */}
            <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2">
              <Users className="w-4 h-4 shrink-0" />
              <span className="truncate">Hội viên</span>
              {totalUsersCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[8.5px] font-black shrink-0 ${
                    subTab === "users" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {totalUsersCount}
                </span>
              )}
            </span>
          </button>

          {/* SubTab 2: Phê duyệt Giao dịch */}
          <button
            onClick={() => { setSubTab("transactions"); }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer relative ${
              subTab === "transactions" ? "text-white" : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            {subTab === "transactions" && (
              <motion.span
                layoutId="member-hub-subtab-active-bg"
                className="absolute inset-0 bg-[#948154] rounded-xl shadow-xs"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2">
              <ArrowRightLeft className="w-4 h-4 shrink-0" />
              <span className="truncate">Phê duyệt Giao dịch</span>
              {pendingTxCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[8px] font-black flex items-center justify-center shrink-0">
                  {pendingTxCount}
                </span>
              )}
            </span>
          </button>

          {/* SubTab 3: Hợp đồng - gộp từ tab "Hợp đồng" cấp cao nhất cũ vì
              cùng bản chất "hàng chờ duyệt" như Phê duyệt Giao dịch, chỉ
              khác đối tượng (Transaction có chữ ký, không phải WalletTransaction). */}
          <button
            onClick={() => { setSubTab("contracts"); }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer relative ${
              subTab === "contracts" ? "text-white" : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            {subTab === "contracts" && (
              <motion.span
                layoutId="member-hub-subtab-active-bg"
                className="absolute inset-0 bg-[#948154] rounded-xl shadow-xs"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2">
              <FileSignature className="w-4 h-4 shrink-0" />
              <span className="truncate">Hợp đồng</span>
              {pendingContractsCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[8px] font-black flex items-center justify-center shrink-0">
                  {pendingContractsCount}
                </span>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* ── SubTab Content Rendering ──
          Cả 3 subtab đều luôn mount sẵn (AnimatedTabPanel chỉ ẩn/hiện bằng
          CSS) thay vì unmount/remount như trước - tránh mỗi lần quay lại 1
          subtab phải tải lại dữ liệu từ đầu, vẫn giữ nguyên hiệu ứng fade +
          trượt nhẹ khi chuyển subtab như thiết kế gốc (xem ghi chú tương tự
          ở Admin.jsx / AnimatedTabPanel.jsx). TransactionsTab đã tự có
          useEffect phản ứng theo initialSearchQuery nên vẫn nhận đúng giá
          trị mới mỗi lần điều hướng chéo dù không còn remount. */}
      <div className="overflow-hidden">
        <AnimatedTabPanel active={subTab === "users"}>
          <AdminErrorBoundary>
            <UsersTab
              onNavigateToChat={onNavigateToChat}
              onNavigateToTransactions={handleNavigateToTransactions}
            />
          </AdminErrorBoundary>
        </AnimatedTabPanel>

        <AnimatedTabPanel active={subTab === "transactions"}>
          <AdminErrorBoundary>
            <TransactionsTab
              initialSearchQuery={txSearchQuery}
              onNavigateToChat={onNavigateToChat}
            />
          </AdminErrorBoundary>
        </AnimatedTabPanel>

        <AnimatedTabPanel active={subTab === "contracts"}>
          <AdminErrorBoundary><ContractsTab /></AdminErrorBoundary>
        </AnimatedTabPanel>
      </div>
    </div>
  );
}
