import platinumCard from "@/assets/images/regenerated_image_1786321591694.png";

// Hạng thành viên KHÔNG còn tự động thăng hạng theo tổng tiền nạp - chỉ Admin
// mới gán hạng cho từng tài khoản (xem UserDetailModal.jsx > "Hạng thành
// viên"), lưu vào user.membership_tier ("Member" | "Gold" | "Platinum" |
// "Diamond"). Hàm bên dưới chỉ tra cứu thông tin/quyền lợi tĩnh của 1 hạng,
// không tự suy ra hạng từ số tiền đã nạp nữa.
const TIER_INFO = {
  MEMBER: {
    tier: "MEMBER",
    name: "Thẻ Member - VIP 0",
    tierLabel: "MEMBER - VIP 0",
    fullName: "Thành viên Member - VIP 0",
    image: "https://statics.vinpearl.com/vinclub-member_1723049424.png",
    dailyRate: 0.2,
    dailyRateLabel: "0,2%/ngày",
    benefits: [
      "Tỷ suất lợi nhuận dự án đầu tư: 0,2%/ngày, nhận gốc & lãi khi đáo hạn",
      "Tích điểm thưởng VinClub cho mọi dịch vụ",
      "Ưu đãi 10% tại hệ sinh thái Vingroup",
      "Tham gia Vòng quay may mắn hằng ngày"
    ]
  },
  GOLD: {
    tier: "GOLD",
    name: "VIP Vàng",
    tierLabel: "GOLD VIP",
    fullName: "Thành viên VIP Vàng",
    image: "https://loyalty-cdn.cloudcpo.net/240807164237_previous_photo_card_24fedc53-f059-407e-ac30-e3f7baf0fca7.jpg",
    dailyRate: 0.4,
    dailyRateLabel: "0,4%/ngày",
    benefits: [
      "Tỷ suất lợi nhuận dự án đầu tư: 0,4%/ngày, nhận gốc & lãi khi đáo hạn",
      "Ưu đãi 30% dịch vụ nghỉ dưỡng Vinpearl",
      "Tặng voucher buffet 2-for-1 hằng tháng",
      "Vé vào cửa tự do Casino Corona"
    ]
  },
  PLATINUM: {
    tier: "PLATINUM",
    name: "VIP Bạch Kim",
    tierLabel: "PLATINUM VIP",
    fullName: "Thành viên VIP Bạch Kim",
    image: platinumCard,
    dailyRate: 0.8,
    dailyRateLabel: "0,8%/ngày",
    benefits: [
      "Tỷ suất lợi nhuận dự án đầu tư: 0,8%/ngày, nhận gốc & lãi khi đáo hạn",
      "Ưu đãi 40% dịch vụ nghỉ dưỡng Vinpearl",
      "Phòng chờ VIP tại Casino Corona",
      "Hỗ trợ tư vấn dự án & BĐS cao cấp"
    ]
  },
  DIAMOND: {
    tier: "DIAMOND",
    name: "VIP Kim Cương",
    tierLabel: "DIAMOND VIP",
    fullName: "Thành viên VIP Kim Cương",
    image: "https://loyalty-cdn.cloudcpo.net/240807164519_previous_photo_card_efd6a076-7d73-46e2-ac0c-713d2dca20f7.jpg",
    dailyRate: 1.2,
    dailyRateLabel: "1,2%/ngày",
    benefits: [
      "Tỷ suất lợi nhuận dự án đầu tư: 1,2%/ngày, nhận gốc & lãi khi đáo hạn",
      "Đặc quyền Chăm sóc KH 24/7 riêng biệt",
      "Giảm 50% phí dịch vụ Vinpearl & Casino VIP",
      "Thẻ mời VIP dự sự kiện độc quyền VinGroup"
    ]
  }
};

function normalizeTierKey(tier) {
  const v = String(tier || "").trim().toUpperCase();
  if (v.includes("DIAMOND") || v.includes("KIM CƯƠNG")) return "DIAMOND";
  if (v.includes("PLATINUM") || v.includes("BẠCH KIM")) return "PLATINUM";
  if (v.includes("GOLD") || v.includes("VÀNG")) return "GOLD";
  return "MEMBER";
}

/**
 * Trả về thông tin hạng thẻ tĩnh (tên, lãi suất, quyền lợi...) theo hạng đã
 * được Admin gán (user.membership_tier). Không tự tính hạng từ số tiền nạp.
 */
export function getCardTierInfo(membershipTier = "Member") {
  return TIER_INFO[normalizeTierKey(membershipTier)];
}

export const ALL_CARD_TIERS = [
  {
    tier: "MEMBER",
    name: "Thẻ Member - VIP 0",
    dailyRateLabel: "0,2%/ngày",
    range: "Dưới 1 Tỷ ₫",
    image: "https://statics.vinpearl.com/vinclub-member_1723049424.png"
  },
  {
    tier: "GOLD",
    name: "VIP Vàng",
    dailyRateLabel: "0,4%/ngày",
    range: "1 Tỷ - Dưới 3 Tỷ ₫",
    image: "https://loyalty-cdn.cloudcpo.net/240807164237_previous_photo_card_24fedc53-f059-407e-ac30-e3f7baf0fca7.jpg"
  },
  {
    tier: "PLATINUM",
    name: "VIP Bạch Kim",
    dailyRateLabel: "0,8%/ngày",
    range: "3 Tỷ - Dưới 10 Tỷ ₫",
    image: platinumCard
  },
  {
    tier: "DIAMOND",
    name: "VIP Kim Cương",
    dailyRateLabel: "1,2%/ngày",
    range: "Từ 10 Tỷ ₫ trở lên",
    image: "https://loyalty-cdn.cloudcpo.net/240807164519_previous_photo_card_efd6a076-7d73-46e2-ac0c-713d2dca20f7.jpg"
  }
];
