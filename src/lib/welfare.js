import { supabase } from "@/lib/supabase";

// Ưu đãi phúc lợi (bảng welfare_offers / welfare_claims, RPC
// get_welfare_offers + claim_welfare_offer - migration 20261019090000).

export const TIER_ORDER = ["MEMBER", "GOLD", "PLATINUM", "DIAMOND"];
export const TIER_LABELS = { MEMBER: "Member", GOLD: "Vàng", PLATINUM: "Bạch Kim", DIAMOND: "Kim Cương" };

// Mốc tổng nạp tham khảo của từng hạng (membershipUtils.ALL_CARD_TIERS) -
// hạng thật vẫn do Admin gán, thanh tiến độ chỉ để người chơi tham khảo.
export const TIER_THRESHOLDS = { MEMBER: 0, GOLD: 1e9, PLATINUM: 3e9, DIAMOND: 1e10 };

export const CATEGORIES = [
  { id: "all", label: "Tất cả" },
  { id: "resort", label: "Nghỉ dưỡng" },
  { id: "dining", label: "Ẩm thực" },
  { id: "shopping", label: "Mua sắm" },
  { id: "health", label: "Sức khoẻ" },
  { id: "casino", label: "Casino" },
  { id: "event", label: "Sự kiện" },
];

/** Hạng (MEMBER…DIAMOND) từ users.membership_tier - khớp welfare_tier_rank() phía DB. */
export function tierKey(tier) {
  const v = String(tier || "").trim().toUpperCase();
  if (v.includes("DIAMOND") || v.includes("KIM CƯƠNG")) return "DIAMOND";
  if (v.includes("PLATINUM") || v.includes("BẠCH KIM")) return "PLATINUM";
  if (v.includes("GOLD") || v.includes("VÀNG")) return "GOLD";
  return "MEMBER";
}

/** Tiến độ tới hạng kế tiếp theo tổng nạp: { next, need, pct } (next = null khi đã cao nhất). */
export function tierProgress(tier, totalDeposited) {
  const key = tierKey(tier);
  const idx = TIER_ORDER.indexOf(key);
  const next = TIER_ORDER[idx + 1] || null;
  if (!next) return { next: null, need: 0, pct: 100 };
  const from = TIER_THRESHOLDS[key];
  const to = TIER_THRESHOLDS[next];
  const total = Math.max(0, Number(totalDeposited) || 0);
  const pct = Math.min(100, Math.max(0, ((total - from) / (to - from)) * 100));
  return { next, need: Math.max(0, to - total), pct };
}

/**
 * Trạng thái hiển thị của 1 ưu đãi với người đang xem:
 * locked (chưa đủ hạng) | soldout | limit (hết lượt tháng) | available.
 */
export function offerState(offer) {
  if (!offer.eligible) return "locked";
  if (offer.remaining !== null && offer.remaining !== undefined && Number(offer.remaining) <= 0) return "soldout";
  if (offer.monthly_limit && Number(offer.my_month_count) >= Number(offer.monthly_limit)) return "limit";
  return "available";
}

/** Trạng thái voucher đã nhận: used | expired | active. */
export function claimStatus(claim, now = new Date()) {
  if (claim.used_at) return "used";
  if (new Date(claim.expires_at) <= now) return "expired";
  return "active";
}

export async function fetchWelfareOffers() {
  const { data, error } = await supabase.rpc("get_welfare_offers");
  if (error) throw new Error(error.message);
  return data || { tier_rank: 0, offers: [] };
}

export async function fetchMyClaims(userId) {
  const { data, error } = await supabase
    .from("welfare_claims")
    .select("*")
    .eq("user_id", userId)
    .order("claimed_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function claimOffer(offerId) {
  const { data, error } = await supabase.rpc("claim_welfare_offer", { p_offer_id: offerId });
  if (error) throw new Error(error.message);
  return data;
}
