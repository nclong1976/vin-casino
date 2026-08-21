import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  Phone,
  Calendar,
  Award,
  TrendingUp,
  ShieldCheck,
  Crown,
  Building2,
  Hotel,
  CheckCircle2,
  UserCheck,
  Clock,
  Video,
  MessageSquare,
  X,
  ChevronRight,
  Headphones,
  Landmark,
  BadgePercent,
  Briefcase
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import BottomNav from "@/components/BottomNav";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getCardTierInfo } from "@/lib/membershipUtils";
import { resolveTransactionKind, resolveTransactionStatus, TRANSACTION_KINDS } from "@/lib/transactionHistory";
import { toast } from "sonner";

// Tier privileges data according to specification
const TIER_PRIVILEGES = {
  MEMBER: {
    tierKey: "MEMBER",
    name: "Thẻ Member",
    fullName: "Thành viên Member (0 - Dưới 1 Tỷ ₫)",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-300",
    interestRate: "0.2% / ngày",
    interestDescription: "Lãi suất 0.2% / ngày trên tổng số dư tài khoản VinClub (sinh lời cộng dồn hằng ngày).",
    bgGradient: "from-amber-900/10 via-amber-800/5 to-transparent",
    image: "https://statics.vinpearl.com/vinclub-member_1723049424.png",
    privileges: [
      {
        icon: BadgePercent,
        title: "Lãi suất đặc quyền VinClub",
        value: "0.2% / ngày",
        desc: "Sinh lời 0.2% mỗi ngày trên tổng số dư tài khoản trong ứng dụng VinClub."
      },
      {
        icon: TrendingUp,
        title: "Hỗ trợ Quản lý Tài sản",
        value: "Bản tin thị trường",
        desc: "Cập nhật báo cáo xu hướng dòng tiền & tham gia cộng đồng thảo luận đầu tư VinClub."
      },
      {
        icon: Hotel,
        title: "Đặc quyền Đặt phòng Vinpearl",
        value: "Chiết khấu 10%",
        desc: "Ưu đãi 10% các gói nghỉ dưỡng, tích điểm VinClub 1x cho mọi giao dịch."
      },
      {
        icon: Building2,
        title: "Hạn mức Tín dụng & Đầu tư",
        value: "Đòn bẩy cơ bản",
        desc: "Tiếp cận các suất đầu tư tiêu chuẩn & hỗ trợ mở tài khoản chứng khoán nhanh."
      }
    ]
  },
  GOLD: {
    tierKey: "GOLD",
    name: "Thẻ Gold",
    fullName: "Thành viên Vàng (1 Tỷ - Dưới 5 Tỷ ₫)",
    badgeColor: "bg-yellow-100 text-yellow-800 border-yellow-400",
    interestRate: "0.4% / ngày",
    interestDescription: "Lãi suất 0.4% / ngày trên tổng số dư tài khoản VinClub (sinh lời cộng dồn hằng ngày).",
    bgGradient: "from-yellow-900/15 via-amber-700/5 to-transparent",
    image: "https://loyalty-cdn.cloudcpo.net/240807164237_previous_photo_card_24fedc53-f059-407e-ac30-e3f7baf0fca7.jpg",
    privileges: [
      {
        icon: BadgePercent,
        title: "Lãi suất đặc quyền VinClub",
        value: "0.4% / ngày",
        desc: "Sinh lời 0.4% mỗi ngày trên tổng số dư tài khoản trong ứng dụng VinClub."
      },
      {
        icon: TrendingUp,
        title: "Hỗ trợ Quản lý Tài sản",
        value: "Báo cáo chuyên sâu 1:1",
        desc: "Bản tin phân tích danh mục đầu tư tuần & tư vấn tái cấu trúc tài sản từ chuyên gia."
      },
      {
        icon: Hotel,
        title: "Đặc quyền Đặt phòng Vinpearl",
        value: "Chiết khấu 30%",
        desc: "Voucher buffet 2-for-1 hằng tháng, vé vào cửa tự do Casino Corona Phú Quốc."
      },
      {
        icon: Building2,
        title: "Hạn mức Tín dụng & Đầu tư",
        value: "Ưu đãi Lãi suất -1.5%",
        desc: "Giảm lãi suất margin, ưu tiên giữ chỗ BĐS Vinhomes giai đoạn mở bán đầu tiên."
      }
    ]
  },
  PLATINUM: {
    tierKey: "PLATINUM",
    name: "Thẻ Platinum",
    fullName: "Thành viên Bạch Kim (5 Tỷ - Dưới 10 Tỷ ₫)",
    badgeColor: "bg-slate-100 text-slate-800 border-slate-300",
    interestRate: "0.8% / ngày",
    interestDescription: "Lãi suất 0.8% / ngày trên tổng số dư tài khoản VinClub (sinh lời cộng dồn hằng ngày).",
    bgGradient: "from-slate-800/15 via-slate-600/5 to-transparent",
    image: "/src/assets/images/regenerated_image_1786321591694.png",
    privileges: [
      {
        icon: BadgePercent,
        title: "Lãi suất đặc quyền VinClub",
        value: "0.8% / ngày",
        desc: "Sinh lời 0.8% mỗi ngày trên tổng số dư tài khoản trong ứng dụng VinClub."
      },
      {
        icon: ShieldCheck,
        title: "Hỗ trợ Quản lý Tài sản 1:1",
        value: "Cố vấn riêng biệt",
        desc: "Cố vấn tài chính cá nhân 1:1 xây dựng chiến lược bảo toàn vốn & tăng trưởng bền vững."
      },
      {
        icon: Hotel,
        title: "Đặc quyền Nâng hạng Vinpearl",
        value: "Chiết khấu 40%",
        desc: "Miễn phí nâng hạng phòng Suite, quyền vào VIP Lounge & xe đưa đón hạng sang."
      },
      {
        icon: Crown,
        title: "Suất Đầu tư Ngoại giao",
        value: "Quyền tiếp cận VIP",
        desc: "Suất ngoại giao dự án BĐS VinGroup, miễn phí hoàn toàn phí chuyển khoản đầu tư."
      }
    ]
  },
  DIAMOND: {
    tierKey: "DIAMOND",
    name: "Thẻ Diamond",
    fullName: "Thành viên Kim Cương (Từ 10 Tỷ ₫ trở lên)",
    badgeColor: "bg-cyan-100 text-cyan-900 border-cyan-400",
    interestRate: "1.2% / ngày",
    interestDescription: "Lãi suất 1.2% / ngày trên tổng số dư tài khoản VinClub (sinh lời cộng dồn hằng ngày).",
    bgGradient: "from-cyan-900/20 via-sky-800/10 to-transparent",
    image: "https://loyalty-cdn.cloudcpo.net/240807164519_previous_photo_card_efd6a076-7d73-46e2-ac0c-713d2dca20f7.jpg",
    privileges: [
      {
        icon: BadgePercent,
        title: "Lãi suất đặc quyền VinClub",
        value: "1.2% / ngày",
        desc: "Sinh lời 1.2% mỗi ngày trên tổng số dư tài khoản trong ứng dụng VinClub."
      },
      {
        icon: ShieldCheck,
        title: "Quản gia Tài sản 1:1 (Family Office)",
        value: "Đặc quyền 24/7",
        desc: "Đội ngũ chuyên gia cấu trúc gia sản nối tiếp, bảo mật tối cao & tối ưu thuế."
      },
      {
        icon: Hotel,
        title: "Đặc quyền Thượng lưu Vinpearl",
        value: "Chiết khấu 50%",
        desc: "Tặng 3 đêm nghỉ Villa biển 3PN miễn phí/năm, dịch vụ đưa đón bằng Siêu xe VIP."
      },
      {
        icon: Crown,
        title: "Hạn mức Tín dụng & Gala VIP",
        value: "Bảo lãnh 100%",
        desc: "Hạn mức vay ưu đãi đặc quyền cao nhất, thẻ mời Gala VIP & Đại hội Cổ đông Vingroup."
      }
    ]
  }
};

// Specialist Consultants list categorized by expertise
const CONSULTANTS = [
  {
    id: "c1",
    name: "Nguyễn Văn An",
    role: "Giám đốc Quản lý Dự Án & Xe Điện VinFast",
    category: "PROJECT",
    categoryLabel: "Dự Án & Thương mại VinFast",
    rating: 5.0,
    reviewsCount: 142,
    exp: "15 năm kinh nghiệm",
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=80",
    phone: "0901234567",
    status: "Trực tuyến (1:1)",
    specialties: ["Lập chiến lược dòng tiền", "Dự án xe điện VinFast", "Vincom MegaMall"]
  },
  {
    id: "c2",
    name: "Trần Thị Bình",
    role: "Chuyên gia Bất động sản & Đất nền VinHomes",
    category: "VINHOMES",
    categoryLabel: "Bất động sản VinHomes",
    rating: 4.9,
    reviewsCount: 98,
    exp: "12 năm kinh nghiệm",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    phone: "0902345678",
    status: "Sẵn sàng nhận lịch",
    specialties: ["Suất ngoại giao Vinhomes", "Thẩm định pháp lý đất nền", "Vinhomes Ocean Park"]
  },
  {
    id: "c3",
    name: "Lê Hoàng Cường",
    role: "Trưởng phòng Phân tích Đầu tư Chứng khoán",
    category: "STOCKS",
    categoryLabel: "Đầu tư Chứng khoán",
    rating: 5.0,
    reviewsCount: 215,
    exp: "14 năm kinh nghiệm",
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
    phone: "0903456789",
    status: "Trực tuyến (1:1)",
    specialties: ["Danh mục Cổ phiếu VIC & VHM", "Quản trị rủi ro", "Ủy thác chứng khoán"]
  },
  {
    id: "c4",
    name: "Nguyễn Việt Quang",
    role: "Giám đốc Cố vấn Đầu tư Nghỉ dưỡng Vinpearl",
    category: "RESORT",
    categoryLabel: "Đầu tư Nghỉ dưỡng Vinpearl",
    rating: 4.9,
    reviewsCount: 188,
    exp: "16 năm kinh nghiệm",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    phone: "0904567890",
    status: "Sẵn sàng nhận lịch",
    specialties: ["Condotel & Villa Vinpearl", "Chi trả lợi nhuận theo giờ", "Casino & Golf đặc quyền"]
  }
];

const CATEGORIES = [
  { key: "ALL", label: "Tất cả Lĩnh vực" },
  { key: "PROJECT", label: "1. Dự Án" },
  { key: "VINHOMES", label: "2. VinHomes" },
  { key: "RESORT", label: "3. Đầu tư nghỉ dưỡng" },
  { key: "STOCKS", label: "4. Đầu tư chứng khoán" }
];

const TIME_SLOTS = ["09:00 - 10:00", "10:30 - 11:30", "14:00 - 15:00", "15:30 - 16:30", "19:30 - 20:30"];
const METHODS = [
  { id: "MEET_1ON1", label: "Trực tiếp 1:1 tại Văn phòng VIP", icon: UserCheck },
  { id: "VIDEO_CALL", label: "Cuộc gọi Video Call trực tuyến", icon: Video },
  { id: "PHONE_CALL", label: "Gọi điện thoại tư vấn riêng", icon: Phone }
];

export default function Consultation() {
  const { user } = useAuth();
  const [depositSum, setDepositSum] = useState(0);

  // Selected Tier Tab for Privilege Inspection
  const [selectedTierKey, setSelectedTierKey] = useState("MEMBER");

  // Selected Specialist Category Filter
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  // Selected Consultant for Booking Modal
  const [bookingConsultant, setBookingConsultant] = useState(null);
  const [bookingDate, setBookingDate] = useState("TODAY");
  const [bookingTime, setBookingTime] = useState("10:30 - 11:30");
  const [bookingMethod, setBookingMethod] = useState("MEET_1ON1");
  const [bookingNote, setBookingNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const me = user;
      if (me) {
        const walletTxs = await base44.entities.WalletTransaction.filter(
          { $or: [{ user_id: me.id }, { created_by_id: me.id }] },
          "-created_date",
          100
        ).catch(() => []);

        // Chỉ tính nạp tiền THẬT đã chốt (không tính thưởng/lãi casino-vòng
        // quay-lãi VIP dù cũng có type:"deposit", và không tính giao dịch
        // pending/rejected/failed) - khớp cách total_deposited được cộng ở
        // phía Admin duyệt nạp, dùng chung logic với MembershipCard.jsx.
        const sum = walletTxs
          .filter((t) => resolveTransactionKind(t) === TRANSACTION_KINDS.DEPOSIT && resolveTransactionStatus(t) === "success")
          .reduce((acc, t) => acc + (Number(t.amount) || 0), 0) + (me?.total_deposited || (me?.role === "admin" ? (me?.balance ?? 0) : 0));

        setDepositSum(sum);
        const userTierInfo = getCardTierInfo(me?.membership_tier);
        setSelectedTierKey(userTierInfo.tier);
      }
    })();
  }, [user]);

  const currentTierInfo = getCardTierInfo(user?.membership_tier);
  const selectedPrivilegeData = TIER_PRIVILEGES[selectedTierKey] || TIER_PRIVILEGES.MEMBER;

  const filteredConsultants = CONSULTANTS.filter(
    (c) => selectedCategory === "ALL" || c.category === selectedCategory
  );

  const handleConfirmBooking = () => {
    if (!bookingConsultant) return;
    setSubmitting(true);
    setTimeout(() => {
      toast.success(`Đặt lịch tham vấn thành công với ${bookingConsultant.name}!`, {
        description: `Thời gian: ${bookingTime} (${bookingDate === "TODAY" ? "Hôm nay" : "Ngày mai"})`
      });
      setSubmitting(false);
      setBookingConsultant(null);
      setBookingNote("");
    }, 600);
  };

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <PageHeader title="Tham vấn phúc lợi" />

      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Banner Welcome & User Tier Status */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#948154] via-[#7d6c43] to-[#594c2e] p-3.5 text-white shadow-md">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shrink-0">
                <Landmark className="w-4 h-4 text-amber-200" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-amber-200">
                  Phúc lợi đặc quyền VinClub
                </p>
                <h2 className="text-[13px] font-bold text-white drop-shadow-xs">
                  {user?.full_name || user?.name || "Thành viên VIP"}
                </h2>
              </div>
            </div>
            <span className="text-[8px] font-extrabold uppercase bg-black/30 border border-amber-300/40 text-amber-200 px-2 py-1 rounded-lg backdrop-blur-xs">
              {currentTierInfo.name}
            </span>
          </div>

          <div className="mt-2.5 pt-2 border-t border-white/20 flex items-center justify-between text-[10px]">
            <span className="text-white/80">Lãi suất số dư sinh lời:</span>
            <span className="font-extrabold text-yellow-300 bg-black/20 px-2 py-0.5 rounded-full border border-yellow-300/30">
              {currentTierInfo.tier === "DIAMOND"
                ? "1.2%"
                : currentTierInfo.tier === "PLATINUM"
                ? "0.8%"
                : currentTierInfo.tier === "GOLD"
                ? "0.4%"
                : "0.2%"}{" "}
              / ngày
            </span>
          </div>
        </div>

        {/* 1. SECTION: Bộ lọc Đặc quyền theo Hạng thẻ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[12px] font-bold text-black flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-[#948154]" />
              Đặc quyền dịch vụ theo Hạng thẻ
            </h3>
            <span className="text-[8px] text-gray-400">Chọn hạng để xem</span>
          </div>

          {/* Tier Tabs Selector */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-gray-200/60 rounded-xl">
            {Object.keys(TIER_PRIVILEGES).map((tKey) => {
              const tierObj = TIER_PRIVILEGES[tKey];
              const isSelected = selectedTierKey === tKey;
              const isUserTier = currentTierInfo.tier === tKey;

              return (
                <button
                  key={tKey}
                  onClick={() => setSelectedTierKey(tKey)}
                  className={`relative py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center flex flex-col items-center justify-center ${
                    isSelected
                      ? "bg-white text-black shadow-xs font-extrabold scale-[1.02]"
                      : "text-gray-500 hover:text-black"
                  }`}
                >
                  <span>{tierObj.name.replace("Thẻ ", "")}</span>
                  {isUserTier && (
                    <span className="text-[6px] bg-[#948154] text-white px-1 py-0.2 rounded mt-0.5 whitespace-nowrap font-semibold">
                      Hạng bạn
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Privilege Showcase Card */}
          <motion.div
            key={selectedTierKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl p-3.5 bg-white border border-gray-100 shadow-sm space-y-3 relative overflow-hidden`}
          >
            {/* Header Tier Info */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div className="flex items-center gap-2">
                <img
                  src={selectedPrivilegeData.image}
                  alt={selectedPrivilegeData.name}
                  className="w-10 h-6 object-fill rounded shadow-2xs border border-gray-200"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] font-extrabold text-black">{selectedPrivilegeData.name}</p>
                    {currentTierInfo.tier === selectedTierKey && (
                      <span className="text-[7px] font-bold bg-green-500 text-white px-1.5 py-0.2 rounded-full">
                        Hạng của bạn
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-gray-500">{selectedPrivilegeData.fullName}</p>
                </div>
              </div>
            </div>

            {/* Interest Highlight Banner */}
            <div className="bg-gradient-to-r from-[#948154]/10 via-amber-50 to-amber-100/30 p-2.5 rounded-xl border border-[#948154]/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#948154] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <BadgePercent className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold text-black">
                    Lãi suất sinh lời trong app:{" "}
                    <span className="text-[#948154] text-[12px] font-black">{selectedPrivilegeData.interestRate}</span>
                  </p>
                  <p className="text-[8px] text-gray-600 leading-tight">
                    {selectedPrivilegeData.interestDescription}
                  </p>
                </div>
              </div>
            </div>

            {/* Privileges Grid */}
            <div className="grid grid-cols-1 gap-2 pt-1">
              {selectedPrivilegeData.privileges.map((item, idx) => {
                const IconComp = item.icon;
                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-gray-50/80 border border-gray-100/80 flex items-start gap-2.5"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#948154]/10 text-[#948154] flex items-center justify-center shrink-0 mt-0.5 border border-[#948154]/20">
                      <IconComp className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-[10.5px] font-bold text-black">{item.title}</p>
                        <span className="text-[9px] font-bold text-[#948154] bg-[#948154]/10 px-1.5 py-0.2 rounded border border-[#948154]/20">
                          {item.value}
                        </span>
                      </div>
                      <p className="text-[8.5px] text-gray-500 leading-tight mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* 2. SECTION: VIP Concierge & Expert Advisory */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[12px] font-bold text-black flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-[#948154]" />
              Đội ngũ Chuyên viên & Cố vấn VIP
            </h3>
            <span className="text-[8px] text-gray-400">Tư vấn 1:1 trực tiếp</span>
          </div>

          {/* Specialist Field Filter Badges */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const isCatActive = selectedCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`px-2.5 py-1 rounded-xl text-[9px] font-bold whitespace-nowrap transition-all shrink-0 ${
                    isCatActive
                      ? "bg-[#948154] text-white shadow-xs"
                      : "bg-white text-gray-600 border border-gray-200"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Consultants List */}
          <div className="space-y-2.5">
            {filteredConsultants.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl p-3 shadow-xs border border-gray-100 space-y-2.5"
              >
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="w-12 h-12 rounded-full object-cover border border-amber-900/10 shadow-2xs"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-bold text-black truncate">{c.name}</p>
                      <span className="text-[8px] font-bold text-green-700 bg-green-50 px-1.5 py-0.3 rounded-full flex items-center gap-1 border border-green-200/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        {c.status}
                      </span>
                    </div>

                    <p className="text-[9.5px] font-medium text-gray-500 truncate">{c.role}</p>

                    <div className="flex items-center gap-2.5 mt-1">
                      <span className="flex items-center gap-0.5 text-[9.5px] font-bold text-amber-600">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        {c.rating} ({c.reviewsCount})
                      </span>
                      <span className="text-[9px] text-gray-400 font-medium">{c.exp}</span>
                    </div>
                  </div>
                </div>

                {/* Specialties tags */}
                <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-50">
                  {c.specialties.map((s, idx) => (
                    <span
                      key={idx}
                      className="text-[8px] font-medium text-[#948154] bg-[#948154]/5 px-2 py-0.5 rounded-md border border-[#948154]/10"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  <a
                    href={`tel:${c.phone}`}
                    className="flex-1 py-1.5 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 text-[10px] font-bold flex items-center justify-center gap-1 transition-all border border-green-200/60"
                  >
                    <Phone className="w-3 h-3" /> Gọi trực tiếp
                  </a>
                  <button
                    onClick={() => setBookingConsultant(c)}
                    className="flex-1 py-1.5 rounded-xl bg-[#948154] text-white hover:bg-[#837046] text-[10px] font-bold flex items-center justify-center gap-1 transition-all shadow-xs"
                  >
                    <Calendar className="w-3 h-3" /> Đặt lịch tư vấn
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 3. MODAL: Đặt lịch Tham vấn */}
        <AnimatePresence>
          {bookingConsultant && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4">
              <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                className="w-full max-w-[325px] bg-white rounded-2xl p-4 shadow-2xl border border-gray-200 space-y-3.5 max-h-[85vh] overflow-y-auto"
              >
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-gray-100 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={bookingConsultant.avatar}
                      alt={bookingConsultant.name}
                      className="w-10 h-10 rounded-full object-cover border border-amber-900/10"
                    />
                    <div>
                      <h4 className="text-[12px] font-bold text-black">Đặt lịch với {bookingConsultant.name}</h4>
                      <p className="text-[9px] text-gray-500">{bookingConsultant.role}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setBookingConsultant(null)}
                    className="p-1 text-gray-400 hover:text-black rounded-full hover:bg-gray-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Date Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-700 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#948154]" /> Lựa chọn ngày
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
                    <Clock className="w-3 h-3 text-[#948154]" /> Khung giờ phù hợp
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {TIME_SLOTS.map((slot) => (
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

                {/* Method selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-700 flex items-center gap-1">
                    <Headphones className="w-3 h-3 text-[#948154]" /> Hình thức trao đổi
                  </label>
                  <div className="space-y-1">
                    {METHODS.map((m) => {
                      const Icon = m.icon;
                      const isChecked = bookingMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setBookingMethod(m.id)}
                          className={`w-full p-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                            isChecked
                              ? "bg-[#948154]/10 border-[#948154] text-black"
                              : "bg-gray-50 border-gray-200 text-gray-600"
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${isChecked ? "text-[#948154]" : "text-gray-400"}`} />
                          <span className="text-[10px] font-semibold flex-1">{m.label}</span>
                          {isChecked && <CheckCircle2 className="w-3.5 h-3.5 text-[#948154]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Consultation details note */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-700 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3 text-[#948154]" /> Nội dung cần tư vấn
                  </label>
                  <textarea
                    value={bookingNote}
                    onChange={(e) => setBookingNote(e.target.value)}
                    placeholder="Ví dụ: Cần hỗ trợ hoạch định tài chính cá nhân, quy trình nhận suất ngoại giao BĐS..."
                    rows={2}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 text-[10px] focus:outline-none focus:border-[#948154] resize-none"
                  />
                </div>

                {/* Submit Action */}
                <button
                  onClick={handleConfirmBooking}
                  disabled={submitting}
                  className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[11px] font-bold shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  {submitting ? (
                    "Đang đăng ký..."
                  ) : (
                    <>
                      Xác nhận đặt lịch tư vấn <ChevronRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <BottomNav />
    </main>
  );
}
