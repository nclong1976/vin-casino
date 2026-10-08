import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Drawer as DrawerPrimitive } from "vaul";
import {
  CalendarClock, Check, Copy, Gift, HeartPulse, Loader2, Lock, PartyPopper, Plane, ShoppingBag, Ticket, Utensils, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import BottomNav from "@/components/BottomNav";
import { Drawer, DrawerDescription, DrawerHeader, DrawerOverlay, DrawerPortal, DrawerTitle } from "@/components/ui/drawer";
import { useAuth } from "@/lib/AuthContext";
import { getCardTierInfo } from "@/lib/membershipUtils";
import { qrRects } from "@/shared/docLayout";
import {
  CATEGORIES, TIER_LABELS, claimOffer, claimStatus, fetchMyClaims, fetchWelfareOffers, markClaimUsed, offerState, tierKey, tierProgress,
} from "@/lib/welfare";

const CATEGORY_STYLE = {
  resort: { icon: Plane, color: "bg-sky-50 text-sky-600" },
  dining: { icon: Utensils, color: "bg-orange-50 text-orange-500" },
  shopping: { icon: ShoppingBag, color: "bg-emerald-50 text-emerald-600" },
  health: { icon: HeartPulse, color: "bg-rose-50 text-rose-500" },
  casino: { icon: Ticket, color: "bg-purple-50 text-purple-600" },
  event: { icon: PartyPopper, color: "bg-amber-50 text-amber-600" },
};
const styleOf = (cat) => CATEGORY_STYLE[cat] || { icon: Gift, color: "bg-[#948154]/10 text-[#948154]" };

const WALLET_FILTERS = [
  { id: "active", label: "Còn hạn" },
  { id: "used", label: "Đã dùng" },
  { id: "expired", label: "Hết hạn" },
];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const fmtBillion = (n) => {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  return `${Math.round(n / 1e6).toLocaleString("vi-VN")} triệu`;
};

function stateLabel(offer) {
  const st = offerState(offer);
  if (st === "locked") return `Hạng ${TIER_LABELS[offer.min_tier]} trở lên`;
  if (st === "soldout") return "Đã hết suất";
  if (st === "limit") return "Đã nhận đủ tháng này";
  return null;
}

function Sheet({ open, onOpenChange, title, description, children }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPortal>
        <DrawerOverlay className="z-[60] bg-black/60" />
        <DrawerPrimitive.Content className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[90vh] flex-col rounded-t-2xl bg-white font-heading shadow-2xl outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-gray-300" />
          <div className="mx-auto w-full max-w-lg overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
            <DrawerHeader className="px-0 pb-3 text-left">
              <DrawerTitle className="text-[15px] text-gray-900">{title}</DrawerTitle>
              {description && <DrawerDescription className="text-[11px] text-gray-500">{description}</DrawerDescription>}
            </DrawerHeader>
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </Drawer>
  );
}

function QrCode({ value, size = 168 }) {
  const qr = useMemo(() => qrRects(value), [value]);
  const n = qr.moduleCount + 4;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label={`Mã QR ${value}`}>
      <rect width={n} height={n} fill="#fff" />
      {qr.rects.map((r, i) => (
        <rect key={i} x={r.x + 2} y={r.y + 2} width={r.w} height={1} fill="#111" />
      ))}
    </svg>
  );
}

function OfferCard({ offer, index, onOpen }) {
  const st = offerState(offer);
  const { icon: Icon, color } = styleOf(offer.category);
  const blocked = stateLabel(offer);
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
      onClick={() => onOpen(offer)}
      className={`relative text-left bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col ${st === "locked" ? "opacity-70" : ""}`}
    >
      {offer.badge && st !== "locked" && (
        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-[#D32F2F] text-white text-[7px] font-bold">{offer.badge}</span>
      )}
      {st === "locked" && <Lock className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-gray-400" />}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${st === "locked" ? "bg-gray-100 text-gray-400" : color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-[11.5px] font-bold text-black leading-tight">{offer.title}</p>
      <p className="text-[9.5px] text-gray-400 mt-0.5 leading-snug line-clamp-2 flex-1">{offer.description}</p>
      {offer.remaining !== null && offer.remaining !== undefined && st !== "locked" && (
        <p className="text-[9px] text-amber-600 mt-1">Còn {offer.remaining} suất</p>
      )}
      <span
        className={`w-full mt-2 py-1.5 rounded-lg text-center text-[9.5px] font-semibold ${
          blocked ? "bg-gray-100 text-gray-500" : "bg-[#948154] text-white"
        }`}
      >
        {blocked || "Nhận ngay"}
      </span>
    </motion.button>
  );
}

function VoucherRow({ claim, onOpen }) {
  const st = claimStatus(claim);
  const { icon: Icon, color } = styleOf(claim.offer_category);
  return (
    <button
      type="button"
      onClick={() => onOpen(claim)}
      className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm text-left"
    >
      <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${st === "active" ? color : "bg-gray-100 text-gray-400"}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] font-bold truncate ${st === "active" ? "text-gray-900" : "text-gray-400"}`}>{claim.offer_title}</p>
        <p className="text-[10px] text-gray-400 font-mono">{claim.code}</p>
      </div>
      <span
        className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${
          st === "active" ? "bg-emerald-50 text-emerald-700" : st === "used" ? "bg-gray-100 text-gray-500" : "bg-rose-50 text-rose-600"
        }`}
      >
        {st === "active" ? `HSD ${fmtDate(claim.expires_at)}` : st === "used" ? "Đã dùng" : "Hết hạn"}
      </span>
    </button>
  );
}

export default function Benefits() {
  const { user } = useAuth();
  const [offers, setOffers] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("explore");
  const [cat, setCat] = useState("all");
  const [walletFilter, setWalletFilter] = useState("active");
  const [detail, setDetail] = useState(null);
  const [voucher, setVoucher] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmUse, setConfirmUse] = useState(false);
  const [using, setUsing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [o, c] = await Promise.all([fetchWelfareOffers(), fetchMyClaims(user.id)]);
      setOffers(o.offers || []);
      setClaims(c);
      setLoadError(null);
    } catch (e) {
      setLoadError(e?.message || "Không tải được ưu đãi");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const tier = tierKey(user?.membership_tier);
  const tierInfo = getCardTierInfo(user?.membership_tier);
  const progress = tierProgress(user?.membership_tier, user?.total_deposited);
  const activeClaims = claims.filter((c) => claimStatus(c) === "active");
  const availableCount = offers.filter((o) => offerState(o) === "available").length;

  // Ưu đãi nhận được lên trước, ưu đãi khoá hạng xuống cuối.
  const visibleOffers = useMemo(() => {
    const rank = { available: 0, limit: 1, soldout: 2, locked: 3 };
    return offers
      .filter((o) => cat === "all" || o.category === cat)
      .slice()
      .sort((a, b) => rank[offerState(a)] - rank[offerState(b)] || a.sort_order - b.sort_order);
  }, [offers, cat]);
  const usedCats = useMemo(() => new Set(offers.map((o) => o.category)), [offers]);
  const walletList = claims.filter((c) => claimStatus(c) === walletFilter);
  const offerOf = (claim) => offers.find((o) => o.id === claim?.offer_id);

  const handleClaim = async (offer) => {
    if (user?.is_locked) return toast.error("Tài khoản của bạn đang bị tạm khoá. Vui lòng liên hệ CSKH.");
    setClaiming(true);
    try {
      const claim = await claimOffer(offer.id);
      toast.success("Đã nhận ưu đãi - voucher đã vào Ví của tôi");
      setDetail(null);
      setVoucher(claim);
      load();
    } catch (e) {
      toast.error(e?.message || "Không nhận được ưu đãi");
      load();
    } finally {
      setClaiming(false);
    }
  };

  const handleUse = async () => {
    if (!voucher) return;
    setUsing(true);
    try {
      const updated = await markClaimUsed(voucher.id);
      setVoucher(updated);
      setConfirmUse(false);
      toast.success("Đã xác nhận sử dụng voucher");
      load();
    } catch (e) {
      toast.error(e?.message || "Không cập nhật được voucher");
      load();
    } finally {
      setUsing(false);
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không sao chép được, vui lòng ghi lại mã");
    }
  };

  const detailState = detail ? offerState(detail) : null;
  const voucherOffer = offerOf(voucher);
  const voucherSt = voucher ? claimStatus(voucher) : null;

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <PageHeader title="Ưu đãi phúc lợi" />
      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-3">
        {/* Thẻ hạng */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#948154] to-[#5c5036] text-white p-4 shadow-md">
          <div className="flex items-center gap-3">
            <img src={tierInfo.image} alt="" className="w-16 h-10 rounded-md object-cover shadow shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-white/70">Hạng của bạn</p>
              <p className="text-[15px] font-bold leading-tight">{tierInfo.name}</p>
            </div>
          </div>
          <p className="text-[11.5px] mt-3">
            {loading ? "Đang tải ưu đãi…" : (
              <>
                <b>{availableCount}</b> ưu đãi nhận được · <b>{activeClaims.length}</b> voucher còn hạn
              </>
            )}
          </p>
          {progress.next && (
            <div className="mt-2.5">
              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-[#f3d98b] rounded-full" style={{ width: `${progress.pct}%` }} />
              </div>
              <p className="text-[9.5px] text-white/75 mt-1">
                {progress.need > 0
                  ? `Mốc tham khảo lên hạng ${TIER_LABELS[progress.next]}: còn ${fmtBillion(progress.need)} tổng nạp`
                  : `Đã đạt mốc tham khảo hạng ${TIER_LABELS[progress.next]} - liên hệ CSKH để được xét nâng hạng`}
              </p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm" role="tablist">
          {[
            ["explore", "Khám phá", Gift],
            ["wallet", "Ví của tôi", Wallet],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition ${
                tab === id ? "bg-[#948154] text-white" : "text-gray-500"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
              {id === "wallet" && activeClaims.length > 0 && (
                <span className={`min-w-[16px] h-4 px-1 rounded-full text-[9px] leading-4 ${tab === id ? "bg-white text-[#948154]" : "bg-rose-500 text-white"}`}>
                  {activeClaims.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loadError && (
          <div className="bg-rose-50 border border-rose-100 text-rose-600 text-[11px] rounded-xl p-3 flex items-center justify-between gap-2">
            {loadError}
            <button type="button" onClick={load} className="font-bold underline shrink-0">Thử lại</button>
          </div>
        )}

        {tab === "explore" ? (
          <>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4">
              {CATEGORIES.filter((c) => c.id === "all" || usedCats.has(c.id)).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(c.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium border transition ${
                    cat === c.id ? "bg-[#948154] text-white border-[#948154]" : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#948154]" /></div>
            ) : visibleOffers.length === 0 ? (
              <p className="py-10 text-center text-[11px] text-gray-400">Chưa có ưu đãi trong mục này</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {visibleOffers.map((o, i) => (
                  <OfferCard key={o.id} offer={o} index={i} onOpen={setDetail} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {WALLET_FILTERS.map((f) => {
                const n = claims.filter((c) => claimStatus(c) === f.id).length;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setWalletFilter(f.id)}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition ${
                      walletFilter === f.id ? "bg-white text-[#948154] shadow-sm" : "text-gray-500"
                    }`}
                  >
                    {f.label} {n > 0 && `(${n})`}
                  </button>
                );
              })}
            </div>
            {loading ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#948154]" /></div>
            ) : walletList.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-[11px] text-gray-400">
                  {walletFilter === "active" ? "Bạn chưa có voucher nào còn hạn" : "Không có voucher"}
                </p>
                {walletFilter === "active" && (
                  <button type="button" onClick={() => setTab("explore")} className="text-[11px] font-bold text-[#948154]">
                    Khám phá ưu đãi →
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {walletList.map((c) => (
                  <VoucherRow key={c.id} claim={c} onOpen={setVoucher} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Chi tiết ưu đãi */}
      <Sheet open={!!detail} onOpenChange={(v) => !v && !claiming && setDetail(null)} title={detail?.title || ""} description={detail?.description}>
        {detail && (
          <div className="space-y-3">
            <ul className="text-[11.5px] text-gray-600 space-y-1.5">
              <li>• Dành cho hạng <b>{TIER_LABELS[detail.min_tier]}</b> trở lên{tier === detail.min_tier ? " (hạng của bạn)" : ""}</li>
              <li>
                • {detail.monthly_limit ? `Nhận tối đa ${detail.monthly_limit} lần/tháng - bạn đã nhận ${detail.my_month_count}` : "Không giới hạn số lần nhận"}
              </li>
              {detail.remaining !== null && detail.remaining !== undefined && <li>• Còn {detail.remaining} suất</li>}
              <li>• Voucher dùng trong {detail.valid_days} ngày kể từ khi nhận</li>
            </ul>
            {detail.terms && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Điều kiện sử dụng</p>
                <p className="text-[11.5px] text-gray-700 whitespace-pre-line">{detail.terms}</p>
              </div>
            )}
            <button
              type="button"
              disabled={detailState !== "available" || claiming}
              onClick={() => handleClaim(detail)}
              className="w-full h-11 rounded-xl bg-[#948154] text-white text-[13px] font-bold disabled:bg-gray-200 disabled:text-gray-500 flex items-center justify-center gap-2"
            >
              {claiming && <Loader2 className="w-4 h-4 animate-spin" />}
              {detailState === "available" ? "Nhận ưu đãi" : stateLabel(detail)}
            </button>
          </div>
        )}
      </Sheet>

      {/* Voucher */}
      <Sheet
        open={!!voucher}
        onOpenChange={(v) => {
          if (v || using) return;
          setVoucher(null);
          setConfirmUse(false);
        }} title={voucher?.offer_title || ""} description="Đưa mã này cho nhân viên khi sử dụng ưu đãi">
        {voucher && (
          <div className="space-y-3">
            <div className={`rounded-2xl border-2 border-dashed p-4 flex flex-col items-center ${voucherSt === "active" ? "border-[#948154]/50" : "border-gray-200 opacity-60"}`}>
              <QrCode value={voucher.code} />
              <div className="mt-3 flex items-center gap-2">
                <span className="font-mono text-[20px] font-bold tracking-widest text-gray-900">{voucher.code}</span>
                <button type="button" onClick={() => copyCode(voucher.code)} className="p-1.5 rounded-lg bg-gray-100 text-gray-600" aria-label="Sao chép mã">
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p
                className={`mt-2 text-[11px] font-semibold flex items-center gap-1 ${
                  voucherSt === "active" ? "text-emerald-700" : voucherSt === "used" ? "text-gray-500" : "text-rose-600"
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                {voucherSt === "active"
                  ? `Hạn dùng đến ${fmtDate(voucher.expires_at)}`
                  : voucherSt === "used"
                    ? `Đã dùng ngày ${fmtDate(voucher.used_at)}`
                    : `Hết hạn ngày ${fmtDate(voucher.expires_at)}`}
              </p>
            </div>
            <p className="text-[10.5px] text-gray-400 text-center">Nhận ngày {fmtDate(voucher.claimed_at)}</p>
            {voucherOffer?.terms && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Điều kiện sử dụng</p>
                <p className="text-[11.5px] text-gray-700 whitespace-pre-line">{voucherOffer.terms}</p>
              </div>
            )}
            {voucherSt === "active" &&
              (confirmUse ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-[11.5px] text-amber-800">
                    Chỉ xác nhận khi ưu đãi <b>đã được sử dụng tại quầy</b>. Voucher sẽ chuyển sang "Đã dùng" và không hoàn tác được.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={using}
                      onClick={() => setConfirmUse(false)}
                      className="flex-1 h-10 rounded-xl bg-white border border-gray-200 text-[12px] font-semibold text-gray-600"
                    >
                      Huỷ
                    </button>
                    <button
                      type="button"
                      disabled={using}
                      onClick={handleUse}
                      className="flex-1 h-10 rounded-xl bg-[#948154] text-white text-[12px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-70"
                    >
                      {using && <Loader2 className="w-4 h-4 animate-spin" />} Xác nhận
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmUse(true)}
                  className="w-full h-11 rounded-xl border-2 border-[#948154] text-[#948154] text-[13px] font-bold flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Xác nhận đã sử dụng
                </button>
              ))}
          </div>
        )}
      </Sheet>
      <BottomNav />
    </main>
  );
}
