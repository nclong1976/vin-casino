import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Calculator, TrendingUp, LineChart, Search, ShieldCheck, Calendar, ArrowRight, Lock, Map as MapIcon } from "lucide-react";
import PanZoomImage from "@/components/shared/PanZoomImage";
import {
  getCycleDays,
  formatDailyRatePercent,
  calculateExpectedInterest,
  isDailyAccrualCategory,
  getMaturityDate,
  TERM_PAYOUT_COPY,
} from "@/lib/investmentTerms";

/** Tách 2 số từ chuỗi diện tích hiển thị kiểu "80-120m²" để làm khoảng min/max
 * cho thanh trượt - dự án nào không đúng định dạng này (thiếu dấu gạch ngang,
 * chỉ 1 số...) thì lùi về khoảng mặc định 60-150m² (đúng khoảng công cụ định
 * giá chung ở tab TOOLS đã dùng từ trước). */
function parseAreaRange(areaStr) {
  const nums = String(areaStr || "").match(/\d+/g)?.map(Number) || [];
  if (nums.length >= 2) return { min: Math.min(...nums), max: Math.max(...nums) };
  if (nums.length === 1) return { min: nums[0], max: nums[0] + 40 };
  return { min: 60, max: 150 };
}

/**
 * Màn hình "Định giá thử" cho ĐÚNG 1 dự án khách vừa bấm ở thẻ dự án
 * (LandInvestment.jsx) - tách riêng khỏi công cụ định giá chung ở tab TOOLS
 * (cho phép chọn bất kỳ dự án nào) để mở nhanh, đúng ngữ cảnh dự án đang xem,
 * không phải tự chọn lại từ đầu. Dùng lại NGUYÊN các hàm tính trong
 * investmentTerms.js (calculateExpectedInterest, getCycleDays,...) - nguồn
 * công thức DUY NHẤT khớp với DepositModal.jsx và trigger tính lãi thật phía
 * Postgres, không tự viết lại công thức riêng ở đây.
 */
export default function ValuationModal({ project, onClose, onInvest }) {
  const range = parseAreaRange(project?.area);
  const [area, setArea] = useState(Math.round((range.min + range.max) / 2));

  if (!project) return null;

  const isActive = project.is_active ?? true;
  const pricePerM2 = Number(project.pricePerM2 || project.price_per_m2) || 0;
  const totalTermRate = Number(project.total_term_interest_rate) || 0;
  const cycleDays = getCycleDays(project);
  const totalPrice = area * pricePerM2;
  const projectedReturn = calculateExpectedInterest(totalPrice, totalTermRate);
  const maturityDate = getMaturityDate(new Date(), project.term_duration_minutes);
  const dailyAccrual = isDailyAccrualCategory(project.category);

  return (
    <AnimatePresence>
      {project && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col font-heading"
          >
            {/* Header - ảnh dự án + tên + nút đóng */}
            <div className="relative w-full h-[130px] shrink-0 overflow-hidden">
              <img src={project.image} alt={project.name || project.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              <button
                onClick={onClose}
                className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white hover:bg-black/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-[#948154] text-white text-[8.5px] font-bold flex items-center gap-1 shadow">
                <Calculator className="w-2.5 h-2.5" /> Định giá thử
              </span>
              <div className="absolute bottom-2.5 left-3 right-3 text-white">
                <h3 className="text-[14px] font-bold leading-tight drop-shadow">{project.name || project.title}</h3>
                <p className="text-[10px] text-white/85 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-2.5 h-2.5" /> {project.location}
                </p>
              </div>
            </div>

            {/* Nội dung cuộn */}
            <div className="p-4 space-y-3 overflow-y-auto">
              {/* Bản đồ / phối cảnh dự án - kéo để di chuyển, chụm/lăn chuột
                  để phóng to xem chi tiết. Dùng thẳng ảnh dự án đã có (chưa
                  có cột ảnh quy hoạch riêng trong investment_projects) - admin
                  có thể thay bằng ảnh sơ đồ phân lô/phối cảnh tổng thể thật
                  bằng cách sửa ảnh dự án ở ProjectsTab.jsx. */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-700 flex items-center gap-1">
                  <MapIcon className="w-3 h-3 text-[#948154]" /> Bản đồ & phối cảnh dự án
                </p>
                <PanZoomImage
                  src={project.image}
                  alt={`Bản đồ dự án ${project.name || project.title}`}
                  className="w-full h-[190px] rounded-xl border border-gray-200"
                />
              </div>

              {/* Thanh trượt diện tích */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="text-gray-700">Diện tích nền đất muốn định giá:</span>
                  <span className="text-[#948154] font-extrabold text-[12px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {area} m²
                  </span>
                </div>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step="5"
                  value={area}
                  onChange={(e) => setArea(Number(e.target.value))}
                  className="w-full accent-[#948154] cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-gray-400">
                  <span>{range.min} m²</span>
                  <span>{range.max} m²</span>
                </div>
              </div>

              {/* Kết quả định giá */}
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-900/5 via-amber-50/50 to-amber-100/30 border border-[#948154]/20 space-y-1.5">
                <p className="text-[9px] font-extrabold uppercase text-[#948154] tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Kết quả định giá & Lợi nhuận dự tính
                </p>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Đơn giá áp dụng:</span>
                    <span className="font-bold text-black">{project.priceStr}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tổng giá trị định giá:</span>
                    <span className="font-extrabold text-[#948154] text-[13px]">
                      {new Intl.NumberFormat("vi-VN").format(totalPrice)} ₫
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200/60 pt-1">
                    <span className="text-gray-600">
                      Lãi suất toàn kỳ ({totalTermRate}% · ~{formatDailyRatePercent(totalTermRate, cycleDays)}):
                    </span>
                    <span className="font-bold text-red-600">+{new Intl.NumberFormat("vi-VN").format(projectedReturn)} ₫</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" /> Dự kiến đáo hạn:
                    </span>
                    <span className="font-bold text-black">
                      {maturityDate.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                  </div>
                </div>
                <p className="text-[8.5px] text-gray-500 leading-snug pt-0.5 border-t border-gray-200/60">
                  {dailyAccrual
                    ? "Lãi được cộng vào ví mỗi ngày trong suốt kỳ hạn, không cần chờ đến ngày đáo hạn."
                    : TERM_PAYOUT_COPY}
                </p>
              </div>

              {/* Thông tin thị trường tham khảo */}
              <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-gray-700 flex items-center gap-1">
                    <LineChart className="w-3.5 h-3.5 text-green-600" /> Biên độ tăng trưởng lịch sử:
                  </span>
                  <span className="font-bold text-green-600 bg-green-50 px-1.5 py-0.2 rounded border border-green-200">
                    {project.growthHistory}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-gray-700 flex items-center gap-1">
                    <Search className="w-3.5 h-3.5 text-blue-600" /> Thanh khoản thị trường:
                  </span>
                  <span className="font-medium text-gray-600">{project.monthlyTransactions}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-gray-700 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Pháp lý:
                  </span>
                  <span className="font-medium text-gray-600 text-right">{project.legalStatus}</span>
                </div>
              </div>

              <p className="text-[8.5px] text-gray-400 text-center leading-snug">
                Kết quả chỉ mang tính chất tham khảo dựa trên đơn giá và lãi suất hiện tại của dự án, không phải cam kết lợi nhuận.
              </p>
            </div>

            {/* Nút hành động */}
            <div className="p-4 pt-2 border-t border-gray-100 shrink-0">
              <button
                disabled={!isActive}
                onClick={() => {
                  if (!isActive) return;
                  onInvest?.(project);
                }}
                className={`w-full py-2.5 rounded-xl text-[11px] font-bold shadow-md transition-all flex items-center justify-center gap-1.5 ${
                  isActive ? "bg-[#948154] hover:bg-[#837046] text-white" : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                {isActive ? (
                  <>Đầu tư ngay với mức định giá này <ArrowRight className="w-3.5 h-3.5" /></>
                ) : (
                  <><Lock className="w-3.5 h-3.5" /> Dự án tạm đóng nhận vốn</>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
