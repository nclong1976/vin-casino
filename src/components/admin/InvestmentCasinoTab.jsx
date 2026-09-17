import React, { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Dices } from "lucide-react";
import StocksTab from "@/components/admin/StocksTab";
import CasinoTab from "@/components/admin/CasinoTab";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import AnimatedTabPanel from "@/components/admin/AnimatedTabPanel";

// Gộp "Đầu tư chứng khoán" + "Quản lý Casino" vào 1 tab cấp cao nhất, 2
// subtab bên trong - cùng mẫu MemberHubTab.jsx đã dùng để gộp Hội
// viên/Tin nhắn/Giao dịch/Hợp đồng. Trước đây 2 mục này tách rời ở thanh
// tab trên cùng dù cùng thuộc nhóm "vận hành sản phẩm đầu tư/giải trí" -
// gộp lại giúp thanh tab cấp cao gọn hơn, và admin không phải rời hẳn ngữ
// cảnh khi cần xem nhanh cả 2 mảng liền nhau. StocksTab/CasinoTab giữ
// nguyên logic/component gốc, chỉ đổi chỗ mount.
export default function InvestmentCasinoTab({ initialSubTab = "stocks", onNavigateToProjects }) {
  const [subTab, setSubTab] = useState(initialSubTab); // 'stocks' | 'casino'

  return (
    <div className="space-y-3.5">
      {/* ── Sub-Navigation Switcher ── */}
      <div className="bg-white rounded-2xl p-1.5 border border-gray-200/90 shadow-xs">
        <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
          <button
            onClick={() => setSubTab("stocks")}
            className={`relative flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
              subTab === "stocks" ? "text-white" : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            {subTab === "stocks" && (
              <motion.span
                layoutId="investment-casino-subtab-active-bg"
                className="absolute inset-0 bg-[#948154] rounded-xl shadow-xs"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2">
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span className="truncate">Đầu tư chứng khoán</span>
            </span>
          </button>

          <button
            onClick={() => setSubTab("casino")}
            className={`relative flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
              subTab === "casino" ? "text-white" : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            {subTab === "casino" && (
              <motion.span
                layoutId="investment-casino-subtab-active-bg"
                className="absolute inset-0 bg-[#948154] rounded-xl shadow-xs"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2">
              <Dices className="w-4 h-4 shrink-0" />
              <span className="truncate">Quản lý Casino</span>
            </span>
          </button>
        </div>
      </div>

      {/* Cả 2 subtab đều luôn mount sẵn (AnimatedTabPanel chỉ ẩn/hiện bằng
          CSS) - đúng mẫu MemberHubTab.jsx, tránh tải lại dữ liệu mỗi lần
          quay lại subtab. */}
      <div className="overflow-hidden">
        <AnimatedTabPanel active={subTab === "stocks"}>
          <AdminErrorBoundary>
            <StocksTab onNavigateToProjects={onNavigateToProjects} />
          </AdminErrorBoundary>
        </AnimatedTabPanel>

        <AnimatedTabPanel active={subTab === "casino"}>
          <AdminErrorBoundary>
            <CasinoTab />
          </AdminErrorBoundary>
        </AnimatedTabPanel>
      </div>
    </div>
  );
}
