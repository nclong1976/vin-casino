import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  Calculator,
  UserCheck,
  Phone,
  Calendar,
  Building2,
  Scale,
  LineChart,
  CheckCircle2,
  Search,
  X,
  Clock,
  ChevronRight,
  Lock
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import BottomNav from "@/components/BottomNav";
import DepositModal from "@/components/projects/DepositModal";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { getCycleDays, formatDailyRatePercent } from "@/lib/investmentTerms";

// Fallback Vinhomes Land Projects Data
const DEFAULT_PROPERTIES = [
  {
    id: "ocean-park",
    name: "Vinhomes Ocean Park",
    title: "Vinhomes Ocean Park",
    location: "Gia Lâm, Hà Nội",
    image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&h=400&fit=crop",
    pricePerM2: 35000000,
    priceStr: "35 triệu/m²",
    rate: "0.5%/ngày",
    rateNum: 12,
    total_term_interest_rate: 12,
    area: "80-120m²",
    progress: 88,
    minAmount: "2800000000",
    duration: "30 ngày",
    is_active: true,
    legalStatus: "Sổ hồng chính chủ - Sang tên ngay",
    growthHistory: "+18.5% (3 năm qua)",
    monthlyTransactions: "142 giao dịch/tháng"
  },
  {
    id: "grand-park",
    name: "Vinhomes Grand Park",
    title: "Vinhomes Grand Park",
    location: "TP. Thủ Đức, TP.HCM",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&h=400&fit=crop",
    pricePerM2: 42000000,
    priceStr: "42 triệu/m²",
    rate: "0.6%/ngày",
    rateNum: 14,
    total_term_interest_rate: 14,
    area: "60-100m²",
    progress: 92,
    minAmount: "2520000000",
    duration: "45 ngày",
    is_active: true,
    legalStatus: "Sổ hồng chính chủ - Bảo lãnh 100%",
    growthHistory: "+22.4% (3 năm qua)",
    monthlyTransactions: "198 giao dịch/tháng"
  },
  {
    id: "smart-city",
    name: "Vinhomes Smart City",
    title: "Vinhomes Smart City",
    location: "Nam Từ Liêm, Hà Nội",
    image: "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=600&h=400&fit=crop",
    pricePerM2: 38000000,
    priceStr: "38 triệu/m²",
    rate: "0.4%/ngày",
    rateNum: 11,
    total_term_interest_rate: 11,
    area: "70-110m²",
    progress: 85,
    minAmount: "2660000000",
    duration: "30 ngày",
    is_active: true,
    legalStatus: "Sổ hồng chính chủ - Hỗ trợ vay 70%",
    growthHistory: "+16.2% (3 năm qua)",
    monthlyTransactions: "115 giao dịch/tháng"
  },
  {
    id: "cozon-city",
    name: "Vinhomes Cozon City",
    title: "Vinhomes Cozon City",
    location: "Long Biên, Hà Nội",
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&h=400&fit=crop",
    pricePerM2: 40000000,
    priceStr: "40 triệu/m²",
    rate: "0.5%/ngày",
    rateNum: 13,
    total_term_interest_rate: 13,
    area: "75-105m²",
    progress: 90,
    minAmount: "3000000000",
    duration: "60 ngày",
    is_active: true,
    legalStatus: "Sổ hồng chính chủ - Suất ngoại giao",
    growthHistory: "+19.8% (3 năm qua)",
    monthlyTransactions: "160 giao dịch/tháng"
  }
];

// Legal & Valuation Experts List
const LEGAL_EXPERTS = [
  {
    id: "exp1",
    name: "Luật sư Nguyễn Minh Châu",
    role: "Trưởng ban Thẩm định Pháp lý BĐS VinGroup",
    exp: "18 năm kinh nghiệm",
    rating: 5.0,
    phone: "0901888999",
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=80",
    specialty: "Thẩm định Sổ hồng & Hợp đồng mua bán"
  },
  {
    id: "exp2",
    name: "ThS. Trần Quốc Bảo",
    role: "Viện trưởng Thẩm định giá Tài sản & Đất nền",
    exp: "15 năm kinh nghiệm",
    rating: 4.9,
    phone: "0902777888",
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
    specialty: "Định giá quy hoạch & Biên độ tăng trưởng"
  }
];

export default function LandInvestment() {
  const [properties, setProperties] = useState(DEFAULT_PROPERTIES);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState("PROJECTS"); // "PROJECTS" | "REASONS" | "TOOLS"
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [highlightActive, setHighlightActive] = useState(!!highlightId);

  // Load & subscribe real-time projects from base44 entity
  useEffect(() => {
    const processItems = (all) => {
      if (!Array.isArray(all)) return;
      // Lọc CHỈ theo category (không dò theo tiêu đề chứa "vinhomes" nữa -
      // trước đây khiến cổ phiếu "Quỹ Cổ Phiếu Vinhomes (VHM)" bị lọt vào
      // danh sách bất động sản chỉ vì tên công ty trùng chữ "Vinhomes").
      const landList = all.filter((p) => (p.category || "").trim() === "VinHomes");
      if (landList.length > 0) {
        setProperties(
          landList.map((p) => ({
            ...p,
            name: p.title || p.name,
            // DepositModal đọc "minAmount" (camelCase) trong khi cột Postgres
            // là "min_amount" - thiếu alias này khiến số tiền tối thiểu luôn
            // đọc ra 0, vô hiệu hoá validate + làm nút 1x/2x/5x ra 0 VNĐ.
            minAmount: p.minAmount ?? p.min_amount,
            pricePerM2: p.price_per_m2 || 35000000,
            priceStr: p.priceStr || p.price_str || (p.price_per_m2 ? `${new Intl.NumberFormat("vi-VN").format(p.price_per_m2)} ₫/m²` : "35 triệu/m²"),
            // Trước đây tự tách số từ field "rate" (nhãn hiển thị dạng chuỗi
            // tự do, admin ghi "chỉ để tham khảo" - xem ProjectsTab.jsx) bằng
            // regex xoá ký tự không phải số, dễ ra số sai (vd "90%/45 ngày"
            // -> "90.45"). Dùng thẳng total_term_interest_rate - đúng con số
            // DUY NHẤT admin cấu hình và cũng là số thật dùng để tính lãi
            // (trigger compute_transaction_interest), để "lãi toàn kỳ" hiển
            // thị ở đây luôn khớp với admin.
            rateNum: Number(p.total_term_interest_rate) || 0,
            // Đọc đúng dữ liệu riêng của từng dự án (admin sửa qua ProjectsTab) -
            // trước đây 3 trường này bị gán cứng 1 chuỗi tĩnh cho MỌI dự án.
            legalStatus: p.legal_status || "Đang cập nhật pháp lý",
            growthHistory: p.growth_history || "Đang cập nhật",
            monthlyTransactions: p.monthly_transactions || "Đang cập nhật"
          }))
        );
      }
    };

    base44.entities.Project
      .list("-created_date", 100)
      .then(processItems)
      .catch(() => {});

    const unsubscribe = base44.entities.Project.subscribe((updated) => {
      processItems(updated);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Tới đây từ 1 thông báo "dự án mới mở" (NotificationBell.jsx) - cuộn tới
  // đúng thẻ dự án đó và nổi bật tạm thời vài giây rồi tự tắt.
  useEffect(() => {
    if (!highlightId || properties.length === 0) return;
    const el = document.getElementById(`project-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightActive(false), 3000);
    return () => clearTimeout(timer);
  }, [highlightId, properties]);

  // Valuation Tool State
  const [valProjectIndex, setValProjectIndex] = useState(0);
  const [valArea, setValArea] = useState(85); // m²

  // Legal Booking Modal State
  const [bookingExpert, setBookingExpert] = useState(null);
  const [bookingDate, setBookingDate] = useState("TODAY");
  const [bookingTime, setBookingTime] = useState("10:30 - 11:30");
  const [bookingNote, setBookingNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Khoảng "Lãi suất toàn kỳ" hiển thị ở banner/lý do đầu tư - tính động
  // từ total_term_interest_rate thật của từng dự án (đồng bộ với admin),
  // thay vì con số tĩnh "11% - 14%/năm" ghi cứng trước đây không đổi theo
  // dữ liệu thật.
  const termRateValues = properties
    .map((p) => Number(p.total_term_interest_rate) || 0)
    .filter((v) => v > 0);
  const minTermRate = termRateValues.length ? Math.min(...termRateValues) : 0;
  const maxTermRate = termRateValues.length ? Math.max(...termRateValues) : 0;
  const termRateRangeLabel = !termRateValues.length
    ? "—"
    : minTermRate === maxTermRate
    ? `${minTermRate}%`
    : `${minTermRate}% - ${maxTermRate}%`;

  // Quy đổi tương đương lãi suất/ngày (chia đều toàn kỳ theo số ngày kỳ hạn
  // thật của TỪNG dự án) - chỉ mang tính tham khảo, số tiền thật giải ngân
  // mỗi ngày do disburse_daily_investment_payouts() (Postgres) tính.
  const dailyRateValues = properties
    .map((p) => Number(p.total_term_interest_rate) / getCycleDays(p))
    .filter((v) => v > 0);
  const minDailyRate = dailyRateValues.length ? Math.min(...dailyRateValues) : 0;
  const maxDailyRate = dailyRateValues.length ? Math.max(...dailyRateValues) : 0;
  const dailyRateRangeLabel = !dailyRateValues.length
    ? "—"
    : minDailyRate === maxDailyRate
    ? `${parseFloat(minDailyRate.toFixed(3))}%/ngày`
    : `${parseFloat(minDailyRate.toFixed(3))}% - ${parseFloat(maxDailyRate.toFixed(3))}%/ngày`;

  // Calculations for Valuation Tool
  const currentValProject = properties[valProjectIndex] || properties[0] || DEFAULT_PROPERTIES[0];
  const calculatedTotalPrice = valArea * (currentValProject?.pricePerM2 || 35000000);
  // Lãi TOÀN KỲ (không phải lãi năm) - khớp đúng bản chất total_term_interest_rate
  // (xem TERM_RATE_LABEL trong lib/investmentTerms.js).
  const projectedReturn = calculatedTotalPrice * ((currentValProject?.rateNum || 0) / 100);

  const handleConfirmLegalBooking = () => {
    if (!bookingExpert) return;
    setSubmitting(true);
    setTimeout(() => {
      toast.success(`Đặt lịch thẩm định pháp lý thành công với ${bookingExpert.name}!`, {
        description: `Thời gian: ${bookingTime} (${bookingDate === "TODAY" ? "Hôm nay" : "Ngày mai"})`
      });
      setSubmitting(false);
      setBookingExpert(null);
      setBookingNote("");
    }, 600);
  };

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <PageHeader title="VinHomes" />

      <div className="max-w-5xl mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Banner Title Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#948154] via-[#7d6c43] to-[#594c2e] p-3.5 text-white shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shrink-0">
              <Scale className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <span className="text-[8px] font-extrabold uppercase tracking-widest text-amber-200 bg-black/20 px-1.5 py-0.5 rounded">
                Tư vấn Định giá & Pháp lý
              </span>
              <h1 className="text-[13px] font-bold text-white mt-0.5">
                Đầu tư Bất động sản VinHomes
              </h1>
            </div>
          </div>
          <p className="text-[9.5px] text-white/80 mt-2 leading-relaxed">
            Hệ thống dự án bất động sản & đất nền VinHomes trọng điểm kèm công cụ thẩm định giá và bảo lãnh pháp lý Sổ hồng 100%.
          </p>
        </div>

        {/* Section Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-gray-200/70 rounded-xl">
          <button
            onClick={() => setActiveTab("PROJECTS")}
            className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center flex items-center justify-center gap-1 ${
              activeTab === "PROJECTS"
                ? "bg-white text-black shadow-xs font-extrabold"
                : "text-gray-500 hover:text-black"
            }`}
          >
            <Building2 className="w-3 h-3 text-[#948154]" /> Dự án đầu tư
          </button>
          <button
            onClick={() => setActiveTab("REASONS")}
            className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center flex items-center justify-center gap-1 ${
              activeTab === "REASONS"
                ? "bg-white text-black shadow-xs font-extrabold"
                : "text-gray-500 hover:text-black"
            }`}
          >
            <ShieldCheck className="w-3 h-3 text-[#948154]" /> Lý do nên chọn
          </button>
          <button
            onClick={() => setActiveTab("TOOLS")}
            className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center flex items-center justify-center gap-1 ${
              activeTab === "TOOLS"
                ? "bg-white text-black shadow-xs font-extrabold"
                : "text-gray-500 hover:text-black"
            }`}
          >
            <Calculator className="w-3 h-3 text-[#948154]" /> Định giá & Cố vấn
          </button>
        </div>

        {/* 1. TAB: DỰ ÁN ĐẤT NỀN VINHOMES TRỌNG ĐIỂM */}
        {activeTab === "PROJECTS" && (
          <div className="space-y-3">
            {/* Value Highlights Bar */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-white rounded-xl p-2 shadow-2xs border border-gray-100 text-center">
                <FileCheck2 className="w-3.5 h-3.5 mx-auto text-green-600 mb-0.5" />
                <p className="text-[8px] text-gray-400">Pháp lý</p>
                <p className="text-[10px] font-bold text-black">Sổ hồng chính chủ</p>
              </div>
              <div className="bg-white rounded-xl p-2 shadow-2xs border border-gray-100 text-center">
                <TrendingUp className="w-3.5 h-3.5 mx-auto text-[#948154] mb-0.5" />
                <p className="text-[8px] text-gray-400">Lãi suất toàn kỳ</p>
                <p className="text-[10px] font-bold text-[#D32F2F]">{termRateRangeLabel}</p>
                <p className="text-[7.5px] text-gray-400">~{dailyRateRangeLabel}</p>
              </div>
              <div className="bg-white rounded-xl p-2 shadow-2xs border border-gray-100 text-center">
                <ShieldCheck className="w-3.5 h-3.5 mx-auto text-blue-600 mb-0.5" />
                <p className="text-[8px] text-gray-400">Bảo lãnh</p>
                <p className="text-[10px] font-bold text-black">100% dòng vốn</p>
              </div>
            </div>

            {/* Properties List */}
            {properties.map((p, i) => {
              const isActive = p.is_active ?? true;
              return (
                <motion.div
                  key={p.id}
                  id={p.id ? `project-${p.id}` : undefined}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`bg-white rounded-2xl overflow-hidden shadow-xs border transition-all ${
                    isActive ? "border-gray-100" : "border-amber-300 opacity-90 bg-amber-50/20"
                  } ${highlightActive && highlightId === String(p.id) ? "ring-2 ring-amber-400" : ""}`}
                >
                  <div className="relative w-full h-[120px] overflow-hidden">
                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-xs text-white text-[8px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border border-white/20">
                      <ShieldCheck className="w-2.5 h-2.5 text-green-400" /> {p.legalStatus}
                    </div>
                    {!isActive && (
                      <div className="absolute top-2 right-2 bg-amber-600 text-white text-[8.5px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                        <Lock className="w-2.5 h-2.5" /> Tạm khóa đầu tư
                      </div>
                    )}
                  </div>

                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-[13px] font-bold text-black leading-tight">{p.name || p.title}</h3>
                        <p className="text-[9.5px] text-gray-500 flex items-center gap-0.5 mt-0.5">
                          <MapPin className="w-2.5 h-2.5 text-red-500" /> {p.location}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-gray-50 border border-gray-100/80 text-center">
                      <div>
                        <p className="text-[8px] text-gray-400 font-medium">Giá đất/m²</p>
                        <p className="text-[10.5px] font-extrabold text-[#948154]">{p.priceStr}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-gray-400 font-medium">Lãi suất toàn kỳ</p>
                        <p className="text-[10.5px] font-extrabold text-[#D32F2F]">{p.total_term_interest_rate ?? 0}%</p>
                        <p className="text-[8px] text-gray-400">~{formatDailyRatePercent(p.total_term_interest_rate, getCycleDays(p))}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-gray-400 font-medium">Diện tích</p>
                        <p className="text-[10.5px] font-extrabold text-black">{p.area}</p>
                      </div>
                    </div>

                    {p.description && (
                      <p className="text-[10.5px] text-gray-500 leading-tight">{p.description}</p>
                    )}

                    {/* Completion Progress */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-[9.5px] text-gray-500 shrink-0 font-medium">Tiến độ hoàn thiện:</span>
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-[#948154] rounded-full" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="text-[9.5px] font-bold text-black">{p.progress}%</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          setValProjectIndex(i);
                          setActiveTab("VALUATION");
                        }}
                        className="flex-1 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-all border border-gray-200"
                      >
                        <Calculator className="w-3 h-3 text-[#948154]" /> Định giá thử
                      </button>
                      <button
                        disabled={!isActive}
                        onClick={() => {
                          if (!isActive) {
                            toast.error("Dự án hiện đang tạm đóng nhận vốn đầu tư");
                            return;
                          }
                          setSelectedProject({ ...p, title: p.name || p.title });
                        }}
                        className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition-all shadow-xs ${
                          isActive
                            ? "bg-[#948154] hover:bg-[#837046] text-white"
                            : "bg-gray-200 text-gray-500 cursor-not-allowed"
                        }`}
                      >
                        {isActive ? (
                          <>
                            Đầu tư ngay <ArrowRight className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" /> Đóng đầu tư
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* 2. TAB: LÝ DO NÊN ĐẦU TƯ ĐẤT NỀN VINHOMES */}
        {activeTab === "REASONS" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3.5"
          >
            {/* Thẻ Tiêu điểm */}
            <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-amber-200 bg-gradient-to-br from-amber-50/20 to-white">
              <h3 className="text-[11px] font-extrabold uppercase text-[#948154] tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[#948154]" /> Tiềm năng Đất nền VinClub
              </h3>
              <p className="text-[10px] text-gray-700 leading-relaxed font-medium">
                Đất nền Vinhomes không chỉ là tài sản tích lũy truyền thống bền vững mà còn là kênh sinh lời đột phá nhờ quy hoạch đô thị đồng bộ, vị trí tâm điểm giao thương và pháp lý minh bạch tuyệt đối.
              </p>
            </div>

            {/* Danh sách Lý do cốt lõi */}
            <div className="space-y-2.5">
              <div className="bg-white rounded-xl p-3 shadow-2xs border border-gray-100 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0 border border-green-100">
                  <FileCheck2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-black">Pháp lý Sổ hồng vĩnh viễn</h4>
                  <p className="text-[9.5px] text-gray-500 mt-0.5 leading-relaxed">
                    Sở hữu lâu dài, có Sổ hồng riêng từng nền đất sạch, hoàn toàn không có rủi ro tranh chấp hay quy hoạch chồng lấn. Sẵn sàng sang tên và công chứng nhanh chóng.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-3 shadow-2xs border border-gray-100 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-black">Biên độ sinh lời toàn kỳ {termRateRangeLabel} (~{dailyRateRangeLabel})</h4>
                  <p className="text-[9.5px] text-gray-500 mt-0.5 leading-relaxed">
                    Hiệu suất lợi nhuận vượt trội so với các kênh gửi tiết kiệm hoặc tích trữ vàng. Biên độ tăng giá đất nền tại các khu vực đô thị vệ tinh Vinhomes đạt mức tối ưu.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-3 shadow-2xs border border-gray-100 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-black">Bảo lãnh dòng vốn 100%</h4>
                  <p className="text-[9.5px] text-gray-500 mt-0.5 leading-relaxed">
                    Được bảo lãnh toàn diện từ Chủ đầu tư và các định chế tài chính/ngân hàng liên kết hàng đầu Việt Nam. Hỗ trợ mua lại hoặc cam kết thanh khoản bền vững.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-3 shadow-2xs border border-gray-100 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-100">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-black">Hạ tầng đồng bộ & Đại đô thị thông minh</h4>
                  <p className="text-[9.5px] text-gray-500 mt-0.5 leading-relaxed">
                    Đất nền nằm trọn trong lòng các đại đô thị Vinhomes đã hoàn thiện cảnh quan, hồ nước mặn, công viên sinh thái, hệ thống giao thông huyết mạch kết nối đa chiều.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-3 shadow-2xs border border-gray-100 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-black">Đặc quyền Cố vấn Thẩm định chuyên sâu</h4>
                  <p className="text-[9.5px] text-gray-500 mt-0.5 leading-relaxed">
                    Hội viên VinClub được đặc quyền làm việc trực tiếp, tư vấn kiểm tra quy hoạch và rà soát pháp lý 1:1 với Ban Thẩm định Pháp lý và Cố vấn giàu kinh nghiệm.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
 
        {/* 3. TAB: ĐỊNH GIÁ & CỐ VẤN THẨM ĐỊNH */}
        {activeTab === "TOOLS" && (
          <div className="space-y-4">
            {/* A. Công cụ mô phỏng định giá */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#948154]/10 text-[#948154] flex items-center justify-center">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-[12px] font-bold text-black">Mô phỏng Định giá & Lãi suất</h3>
                      <p className="text-[8.5px] text-gray-400">Tra cứu biến động & tính toán tổng giá trị</p>
                    </div>
                  </div>
                </div>
 
                {/* Select Project Dropdown / Cards */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-700">Chọn dự án đất nền:</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {properties.map((p, idx) => (
                      <button
                        key={p.id}
                        onClick={() => setValProjectIndex(idx)}
                        className={`p-2 rounded-xl text-left border transition-all ${
                          valProjectIndex === idx
                            ? "bg-[#948154]/10 border-[#948154] text-black font-bold"
                            : "bg-gray-50 border-gray-200 text-gray-600"
                        }`}
                      >
                        <p className="text-[10px] truncate">{p.name || p.title}</p>
                        <p className="text-[8.5px] text-[#948154] font-bold">{p.priceStr}</p>
                      </button>
                    ))}
                  </div>
                </div>
 
                {/* Area Slider / Input */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-gray-700">Diện tích nền đất (m²):</span>
                    <span className="text-[#948154] font-extrabold text-[12px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {valArea} m²
                    </span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="150"
                    step="5"
                    value={valArea}
                    onChange={(e) => setValArea(Number(e.target.value))}
                    className="w-full accent-[#948154] cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] text-gray-400">
                    <span>60 m² (Tối thiểu)</span>
                    <span>100 m²</span>
                    <span>150 m² (Mặt tiền rộng)</span>
                  </div>
                </div>
 
                {/* Valuation Result Box */}
                <div className="p-3 rounded-xl bg-gradient-to-br from-amber-900/5 via-amber-50/50 to-amber-100/30 border border-[#948154]/20 space-y-2">
                  <p className="text-[9px] font-extrabold uppercase text-[#948154] tracking-wider">
                    Kết quả định giá & Lợi nhuận dự tính
                  </p>
 
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Đơn giá áp dụng:</span>
                      <span className="font-bold text-black">{currentValProject.priceStr}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tổng giá trị định giá:</span>
                      <span className="font-extrabold text-[#948154] text-[13px]">
                        {new Intl.NumberFormat("vi-VN").format(calculatedTotalPrice)} ₫
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200/60 pt-1">
                      <span className="text-gray-600">
                        Lãi suất toàn kỳ ({currentValProject.total_term_interest_rate ?? 0}% · ~
                        {formatDailyRatePercent(currentValProject.total_term_interest_rate, getCycleDays(currentValProject))}):
                      </span>
                      <span className="font-bold text-red-600">
                        +{new Intl.NumberFormat("vi-VN").format(projectedReturn)} ₫
                      </span>
                    </div>
                  </div>
                </div>
 
                {/* Historical Trend & Market Data */}
                <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-gray-700 flex items-center gap-1">
                      <LineChart className="w-3.5 h-3.5 text-green-600" /> Biên độ tăng trưởng lịch sử:
                    </span>
                    <span className="font-bold text-green-600 bg-green-50 px-1.5 py-0.2 rounded border border-green-200">
                      {currentValProject.growthHistory}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-gray-700 flex items-center gap-1">
                      <Search className="w-3.5 h-3.5 text-blue-600" /> Thanh khoản thị trường:
                    </span>
                    <span className="font-medium text-gray-600">{currentValProject.monthlyTransactions}</span>
                  </div>
                </div>
 
                <button
                  disabled={!(currentValProject.is_active ?? true)}
                  onClick={() => {
                    if (!(currentValProject.is_active ?? true)) {
                      toast.error("Dự án này hiện đang đóng nhận vốn đầu tư");
                      return;
                    }
                    setSelectedProject({ ...currentValProject, title: currentValProject.name || currentValProject.title });
                  }}
                  className={`w-full py-2.5 rounded-xl text-[11px] font-bold shadow-md transition-all flex items-center justify-center gap-1.5 ${
                    (currentValProject.is_active ?? true)
                      ? "bg-[#948154] hover:bg-[#837046] text-white"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {(currentValProject.is_active ?? true) ? (
                    <>Đăng ký nhận suất đầu tư định giá này <ChevronRight className="w-3.5 h-3.5" /></>
                  ) : (
                    <>Dự án tạm đóng nhận vốn <Lock className="w-3.5 h-3.5" /></>
                  )}
                </button>
              </div>
            </motion.div>
 
            {/* B. Pháp lý & Đội ngũ cố vấn */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {/* Legal Transparency Commitment Card */}
              <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 space-y-2.5">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <h3 className="text-[12px] font-bold text-black">Cam kết Minh bạch Pháp lý 100%</h3>
                    <p className="text-[8.5px] text-gray-400">Quyền sở hữu lâu dài & Bảo vệ dòng vốn</p>
                  </div>
                </div>
 
                <div className="space-y-2 text-[10px] text-gray-600 leading-relaxed">
                  <div className="p-2.5 rounded-xl bg-green-50/60 border border-green-200/60 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    <p>
                      <span className="font-bold text-black">Sổ hồng chính chủ từng nền:</span> Toàn bộ các quỹ đất trong danh mục VinClub đều sở hữu pháp lý chuẩn chỉnh, có Sổ hồng chính chủ sẵn sàng sang tên.
                    </p>
                  </div>
 
                  <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-200/60 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <p>
                      <span className="font-bold text-black">Bảo lãnh dòng vốn 100%:</span> Ngân hàng và tập đoàn bảo lãnh hoàn vốn và bảo mật pháp lý tuyệt đối cho mọi khoản đầu tư đất nền.
                    </p>
                  </div>
                </div>
              </div>
 
              {/* Legal Experts 1:1 Advisory */}
              <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 space-y-2.5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <h3 className="text-[12px] font-bold text-black flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-[#948154]" />
                    Đội ngũ Cố vấn Pháp lý & Định giá 1:1
                  </h3>
                  <span className="text-[8px] bg-amber-100 text-amber-800 px-1.5 py-0.3 rounded font-bold">
                    Thẩm định riêng
                  </span>
                </div>
 
                <div className="space-y-2.5">
                  {LEGAL_EXPERTS.map((exp) => (
                    <div
                      key={exp.id}
                      className="p-2.5 rounded-xl bg-gray-50 border border-gray-100/90 space-y-2"
                    >
                      <div className="flex items-start gap-2.5">
                        <img
                          src={exp.avatar}
                          alt={exp.name}
                          className="w-11 h-11 rounded-full object-cover border border-amber-900/10 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11.5px] font-bold text-black truncate">{exp.name}</p>
                          <p className="text-[9px] text-gray-500 truncate">{exp.role}</p>
                          <p className="text-[8.5px] font-semibold text-[#948154] mt-0.5">{exp.specialty}</p>
                        </div>
                      </div>
 
                      <div className="flex gap-2 pt-1 border-t border-gray-200/60">
                        <a
                          href={`tel:${exp.phone}`}
                          className="flex-1 py-1.5 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 text-[9.5px] font-bold flex items-center justify-center gap-1 transition-all border border-green-200/60"
                        >
                          <Phone className="w-3 h-3" /> Gọi trực tiếp
                        </a>
                        <button
                          onClick={() => setBookingExpert(exp)}
                          className="flex-1 py-1.5 rounded-xl bg-[#948154] text-white hover:bg-[#837046] text-[9.5px] font-bold flex items-center justify-center gap-1 transition-all shadow-xs"
                        >
                          <Calendar className="w-3 h-3" /> Đặt lịch thẩm định
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* MODAL: Đặt lịch Thẩm định Pháp lý 1:1 */}
      <AnimatePresence>
        {bookingExpert && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="w-full max-w-[325px] bg-white rounded-2xl p-4 shadow-2xl border border-gray-200 space-y-3.5 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between border-b border-gray-100 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <img
                    src={bookingExpert.avatar}
                    alt={bookingExpert.name}
                    className="w-10 h-10 rounded-full object-cover border border-amber-900/10"
                  />
                  <div>
                    <h4 className="text-[12px] font-bold text-black">Thẩm định với {bookingExpert.name}</h4>
                    <p className="text-[9px] text-gray-500">{bookingExpert.role}</p>
                  </div>
                </div>
                <button
                  onClick={() => setBookingExpert(null)}
                  className="p-1 text-gray-400 hover:text-black rounded-full hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Date Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-700 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#948154]" /> Lựa chọn ngày hẹn
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setBookingDate("TODAY")}
                    className={`py-1.5 rounded-xl text-[10px] font-bold border transition-all ${
                      bookingDate === "TODAY"
                        ? "bg-[#948154] text-white border-[#948154]"
                        : "bg-gray-50 text-gray-600 border-gray-200"
                    }`}
                  >
                    Hôm nay (24/7)
                  </button>
                  <button
                    onClick={() => setBookingDate("TOMORROW")}
                    className={`py-1.5 rounded-xl text-[10px] font-bold border transition-all ${
                      bookingDate === "TOMORROW"
                        ? "bg-[#948154] text-white border-[#948154]"
                        : "bg-gray-50 text-gray-600 border-gray-200"
                    }`}
                  >
                    Ngày mai
                  </button>
                </div>
              </div>

              {/* Time Slots */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-700 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#948154]" /> Khung giờ họp
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {["09:00 - 10:00", "10:30 - 11:30", "14:00 - 15:00", "15:30 - 16:30"].map((slot) => (
                    <button
                      key={slot}
                      onClick={() => setBookingTime(slot)}
                      className={`py-1 rounded-lg text-[9px] font-semibold border transition-all ${
                        bookingTime === slot
                          ? "bg-amber-100/80 text-[#948154] border-[#948154] font-bold"
                          : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              {/* Details note */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-700">Yêu cầu hồ sơ cần thẩm định:</label>
                <textarea
                  value={bookingNote}
                  onChange={(e) => setBookingNote(e.target.value)}
                  placeholder="Ví dụ: Cần kiểm tra quy hoạch phân khu, quy trình sang tên Sổ hồng Vinhomes..."
                  rows={2}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 text-[10px] focus:outline-none focus:border-[#948154] resize-none"
                />
              </div>

              <button
                onClick={handleConfirmLegalBooking}
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[11px] font-bold shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                {submitting ? "Đang xử lý..." : "Xác nhận đặt lịch thẩm định pháp lý"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Investment Deposit Modal */}
      {selectedProject && (
        <DepositModal project={selectedProject} onClose={() => setSelectedProject(null)} />
      )}

      <BottomNav />
    </main>
  );
}

