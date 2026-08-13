import platinumCard from "@/assets/images/regenerated_image_1786321591694.png";

export function getCardTierInfo(depositAmount = 0) {
  const amount = Number(depositAmount) || 0;

  if (amount >= 10000000000) {
    return {
      tier: "DIAMOND",
      name: "VIP Kim Cương",
      tierLabel: "DIAMOND VIP",
      fullName: "Thành viên VIP Kim Cương",
      image: "https://loyalty-cdn.cloudcpo.net/240807164519_previous_photo_card_efd6a076-7d73-46e2-ac0c-713d2dca20f7.jpg",
      min: 10000000000,
      max: Infinity,
      minLabel: "Từ 10 Tỷ ₫ trở lên",
      dailyRate: 1.2,
      dailyRateLabel: "1,2%/ngày",
      nextTierName: null,
      nextTierMin: null,
      benefits: [
        "Lãi suất cộng dồn hằng ngày: 1,2%/ngày (lúc 9h sáng)",
        "Đặc quyền Chăm sóc KH 24/7 riêng biệt",
        "Giảm 50% phí dịch vụ Vinpearl & Casino VIP",
        "Thẻ mời VIP dự sự kiện độc quyền VinGroup"
      ]
    };
  } else if (amount >= 3000000000) {
    return {
      tier: "PLATINUM",
      name: "VIP Bạch Kim",
      tierLabel: "PLATINUM VIP",
      fullName: "Thành viên VIP Bạch Kim",
      image: platinumCard,
      min: 3000000000,
      max: 10000000000,
      minLabel: "3 Tỷ - Dưới 10 Tỷ ₫",
      dailyRate: 0.8,
      dailyRateLabel: "0,8%/ngày",
      nextTierName: "VIP Kim Cương",
      nextTierMin: 10000000000,
      benefits: [
        "Lãi suất cộng dồn hằng ngày: 0,8%/ngày (lúc 9h sáng)",
        "Ưu đãi 40% dịch vụ nghỉ dưỡng Vinpearl",
        "Phòng chờ VIP tại Casino Corona",
        "Hỗ trợ tư vấn dự án & BĐS cao cấp"
      ]
    };
  } else if (amount >= 1000000000) {
    return {
      tier: "GOLD",
      name: "VIP Vàng",
      tierLabel: "GOLD VIP",
      fullName: "Thành viên VIP Vàng",
      image: "https://loyalty-cdn.cloudcpo.net/240807164237_previous_photo_card_24fedc53-f059-407e-ac30-e3f7baf0fca7.jpg",
      min: 1000000000,
      max: 3000000000,
      minLabel: "1 Tỷ - Dưới 3 Tỷ ₫",
      dailyRate: 0.4,
      dailyRateLabel: "0,4%/ngày",
      nextTierName: "VIP Bạch Kim",
      nextTierMin: 3000000000,
      benefits: [
        "Lãi suất cộng dồn hằng ngày: 0,4%/ngày (lúc 9h sáng)",
        "Ưu đãi 30% dịch vụ nghỉ dưỡng Vinpearl",
        "Tặng voucher buffet 2-for-1 hằng tháng",
        "Vé vào cửa tự do Casino Corona"
      ]
    };
  } else {
    return {
      tier: "MEMBER",
      name: "Thành viên",
      tierLabel: "MEMBER",
      fullName: "Thành viên Khởi đầu",
      image: "https://statics.vinpearl.com/vinclub-member_1723049424.png",
      min: 0,
      max: 1000000000,
      minLabel: "Dưới 1 Tỷ ₫",
      dailyRate: 0.2,
      dailyRateLabel: "0,2%/ngày",
      nextTierName: "VIP Vàng",
      nextTierMin: 1000000000,
      benefits: [
        "Lãi suất cộng dồn hằng ngày: 0,2%/ngày (lúc 9h sáng)",
        "Tích điểm thưởng VinClub cho mọi dịch vụ",
        "Ưu đãi 10% tại hệ sinh thái Vingroup",
        "Tham gia Vòng quay may mắn hằng ngày"
      ]
    };
  }
}

export const ALL_CARD_TIERS = [
  {
    tier: "MEMBER",
    name: "Thành viên",
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
