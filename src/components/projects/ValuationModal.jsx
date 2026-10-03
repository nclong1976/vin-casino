import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  MapPin,
  Calculator,
  TrendingUp,
  ShieldCheck,
  Search,
  Calendar,
  ArrowRight,
  Bell,
  Headphones,
  ChevronDown,
  Landmark,
  Loader2,
  Map as MapIcon,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { toast } from "sonner";
import PanZoomImage from "@/components/shared/PanZoomImage";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { notifyUser } from "@/lib/notifyUser";
import { getActiveConversationId } from "@/lib/cskhConversation";
import {
  getCycleDays,
  formatDailyRatePercent,
  calculateExpectedInterest,
  isDailyAccrualCategory,
  getMaturityDate,
  TERM_PAYOUT_COPY,
} from "@/lib/investmentTerms";
import {
  TYPE_LABELS,
  TYPE_ORDER,
  DIRECTION_LABELS,
  DIRECTION_ORDER,
  VIEW_LABELS,
  VIEW_ORDER,
  SCENARIO_LABELS,
  fmtMoney,
  fmtVnd,
  clampArea,
  buildValuationInput,
  fetchValuationForm,
  valuateUnit,
  createValuationLead,
  vhErrorMessage,
} from "@/lib/vinhomesValuation";

const GOLD = "#948154";
const TABS = [
  ["overview", "Tổng quan"],
  ["valuation", "Định giá"],
  ["payment", "Tiến độ & Vay"],
];
const FACTOR_LABELS = {
  k_zone: "Phân khu",
  k_type: "Loại hình",
  k_dir: "Hướng nhà",
  k_pos: "Vị trí / tầng",
  k_view: "Hướng nhìn",
};

function Chip({ active, onClick, children, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? "bg-[#948154] border-[#948154] text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-gray-700">{label}</p>
      {children}
    </div>
  );
}

/**
 * "Định giá thử" cho 1 dự án Vinhomes (bấm từ thẻ dự án ở LandInvestment.jsx).
 * Giai đoạn 1: form chọn phân khu / loại hình / mã căn / hướng / diện tích,
 * kết quả tính trên máy chủ (RPC valuate_unit - hệ số do Admin cấu hình):
 * giá trị ước tính kèm khoảng sàn–trần, lịch sử giá, dự phóng, tiến độ thanh
 * toán và gói vay. Phần "đầu tư trong app" vẫn dùng NGUYÊN các hàm của
 * investmentTerms.js (cùng công thức với DepositModal và trigger tính lãi).
 */
export default function ValuationModal({ project, onClose, onInvest, initialZoneId = null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState("valuation");
  const [formData, setFormData] = useState(null);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ zoneId: "", type: "apartment", unitCode: "", direction: "DN", area: 80, floor: 10, isCorner: false, view: "none", years: 5 });
  const [result, setResult] = useState(null);
  const [calcError, setCalcError] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [showFactors, setShowFactors] = useState(false);
  const [leadBusy, setLeadBusy] = useState(null);

  // Dữ liệu form (phân khu, mã căn, khoảng diện tích...).
  useEffect(() => {
    if (!project?.id) return undefined;
    let alive = true;
    fetchValuationForm(project.id)
      .then((data) => {
        if (!alive) return;
        if (!data) {
          setFormError("Dự án chưa được cấu hình định giá.");
          return;
        }
        setFormData(data);
        const zone = data.zones?.find((z) => z.id === initialZoneId) || data.zones?.[0];
        const types = TYPE_ORDER.filter((t) => (data.types || []).includes(t) && (!zone || zone.types.includes(t)));
        const type = types[0] || "apartment";
        const range = data.area_ranges?.[type];
        setForm((f) => ({
          ...f,
          zoneId: zone?.id || "",
          type,
          direction: (data.directions || []).includes("DN") ? "DN" : data.directions?.[0] || "DN",
          area: range ? Math.round((Number(range[0]) + Number(range[1])) / 2) : f.area,
        }));
      })
      .catch((e) => alive && setFormError(vhErrorMessage(e, "Không tải được dữ liệu định giá.")));
    return () => {
      alive = false;
    };
  }, [project?.id]);

  const zone = formData?.zones?.find((z) => z.id === form.zoneId);
  const availableTypes = TYPE_ORDER.filter((t) => (formData?.types || []).includes(t) && (!zone || zone.types.includes(t)));
  const range = formData?.area_ranges?.[form.type] || [40, 150];
  const unit = formData?.units?.find((u) => u.code === form.unitCode.trim().toUpperCase());
  const input = useMemo(() => buildValuationInput(form), [form]);

  // Tự định giá lại mỗi khi đổi thông số (chờ 350 ms sau lần chỉnh cuối).
  useEffect(() => {
    if (!project?.id || !formData) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      setCalculating(true);
      valuateUnit(project.id, input)
        .then((r) => {
          if (!alive) return;
          setResult(r);
          setCalcError("");
        })
        .catch((e) => alive && setCalcError(vhErrorMessage(e)))
        .finally(() => alive && setCalculating(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [project?.id, formData, input]);

  if (!project) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const pickZone = (id) => {
    const z = formData?.zones?.find((x) => x.id === id);
    const type = z && !z.types.includes(form.type) ? TYPE_ORDER.find((t) => z.types.includes(t)) || form.type : form.type;
    set({ zoneId: id, type, unitCode: "", area: clampArea(form.area, formData?.area_ranges?.[type]) });
  };
  const pickType = (type) => set({ type, unitCode: "", area: clampArea(form.area, formData?.area_ranges?.[type]) });
  const pickUnit = (code) => {
    const u = formData?.units?.find((x) => x.code === code.trim().toUpperCase());
    if (!u) return set({ unitCode: code });
    set({ unitCode: u.code, type: u.type, area: Number(u.area), direction: u.direction, floor: u.floor || form.floor, zoneId: u.zone_id || form.zoneId });
  };

  const isActive = result?.project?.is_active ?? project.is_active ?? true;
  const value = Number(result?.value?.estimate) || 0;
  const totalTermRate = Number(project.total_term_interest_rate) || 0;
  const cycleDays = getCycleDays(project);
  const termInterest = calculateExpectedInterest(value, totalTermRate);
  const maturityDate = getMaturityDate(new Date(), project.term_duration_minutes);
  const history = result?.history?.points || [];
  const bandPos = result ? ((value - result.value.floor) / Math.max(1, result.value.ceiling - result.value.floor)) * 100 : 50;

  const sendLead = async (action) => {
    if (!user?.id) {
      toast.error("Vui lòng đăng nhập để tiếp tục.");
      return;
    }
    if (!result || leadBusy) return;
    setLeadBusy(action);
    try {
      await createValuationLead(project.id, action, input);
      const summary = `${TYPE_LABELS[result.input.type]} ${result.input.area} m², hướng ${DIRECTION_LABELS[result.input.direction]}${
        result.input.unit_code ? `, mã căn ${result.input.unit_code}` : ""
      } - giá trị ước tính ${fmtVnd(value)}`;
      const name = project.name || project.title;
      if (action === "consult") {
        await base44.entities.Message.create({
          sender: "user",
          conversation_id: getActiveConversationId(user.id) || user.id,
          user_id: user.id,
          content: `Tôi muốn được tư vấn dự án ${name}: ${summary}.`,
          attachments: [],
        });
        await notifyUser("admin", {
          title: "Khách cần tư vấn dự án Vinhomes",
          content: `${user.full_name || user.email || "Hội viên"} muốn tư vấn ${name}: ${summary}.`,
          type: "admin",
        }).catch(() => {});
        onClose();
        navigate("/support");
      } else {
        await notifyUser("admin", {
          title: "Khách đăng ký nhận thông báo mở bán",
          content: `${user.full_name || user.email || "Hội viên"} chờ mở bán ${name}: ${summary}.`,
          type: "admin",
        }).catch(() => {});
        toast.success("Đã ghi nhận. Chúng tôi sẽ báo khi dự án mở bán.");
      }
    } catch (e) {
      toast.error(vhErrorMessage(e, "Không gửi được yêu cầu, vui lòng thử lại."));
    } finally {
      setLeadBusy(null);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-4" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[440px] bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[94vh] flex flex-col font-heading"
        >
          {/* Ảnh + tên dự án */}
          <div className="relative w-full h-[110px] shrink-0 overflow-hidden">
            <img src={project.image} alt={project.name || project.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white hover:bg-black/60 transition-colors cursor-pointer"
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

          <div className="grid grid-cols-3 gap-1 p-1 mx-4 mt-3 rounded-xl bg-gray-100 shrink-0">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${tab === k ? "bg-white text-[#948154] shadow-sm" : "text-gray-500"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-3 overflow-y-auto">
            {tab === "overview" && (
              <>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-gray-700 flex items-center gap-1">
                    <MapIcon className="w-3 h-3 text-[#948154]" /> Phối cảnh dự án
                  </p>
                  <PanZoomImage src={project.image} alt={`Phối cảnh ${project.name || project.title}`} className="w-full h-[190px] rounded-xl border border-gray-200" />
                </div>
                <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 space-y-1.5 text-[10.5px]">
                  <div className="flex justify-between gap-3">
                    <span className="font-bold text-gray-700 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#948154]" /> Vị trí
                    </span>
                    <span className="text-gray-600 text-right">{project.location}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="font-bold text-gray-700">Đơn giá gốc</span>
                    <span className="text-gray-600">{project.priceStr}</span>
                  </div>
                  {formData && (
                    <div className="flex justify-between gap-3">
                      <span className="font-bold text-gray-700">Loại hình</span>
                      <span className="text-gray-600 text-right">{(formData.types || []).map((t) => TYPE_LABELS[t] || t).join(" · ")}</span>
                    </div>
                  )}
                  {project.legalStatus && (
                    <div className="flex justify-between gap-3">
                      <span className="font-bold text-gray-700 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Pháp lý
                      </span>
                      <span className="text-gray-600 text-right">{project.legalStatus}</span>
                    </div>
                  )}
                  {project.monthlyTransactions && (
                    <div className="flex justify-between gap-3">
                      <span className="font-bold text-gray-700 flex items-center gap-1">
                        <Search className="w-3.5 h-3.5 text-blue-600" /> Thanh khoản
                      </span>
                      <span className="text-gray-600">{project.monthlyTransactions}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setTab("valuation")}
                  className="w-full py-2 rounded-xl bg-amber-50 border border-amber-200 text-[#948154] text-[11px] font-bold cursor-pointer"
                >
                  Định giá một căn ở dự án này →
                </button>
              </>
            )}

            {tab !== "overview" && formError && (
              <p className="text-center text-[11px] text-gray-500 py-8">{formError}</p>
            )}

            {tab === "valuation" && !formError && (
              <>
                {!formData ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {formData.zones.length > 1 && (
                      <Field label="Phân khu">
                        <select
                          value={form.zoneId}
                          onChange={(e) => pickZone(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] bg-white"
                        >
                          {formData.zones.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}

                    {formData.units.length > 0 && (
                      <Field label="Mã căn (không bắt buộc)">
                        <input
                          list={`vh-units-${project.id}`}
                          value={form.unitCode}
                          onChange={(e) => pickUnit(e.target.value)}
                          placeholder="VD: A1-1203 - để trống nếu chưa chọn căn"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px]"
                        />
                        <datalist id={`vh-units-${project.id}`}>
                          {formData.units.map((u) => (
                            <option key={u.code} value={u.code}>
                              {TYPE_LABELS[u.type]} · {u.area} m² · {DIRECTION_LABELS[u.direction]}
                            </option>
                          ))}
                        </datalist>
                        {unit && <p className="text-[9.5px] text-emerald-700">Đã điền thông số theo mã căn {unit.code}.</p>}
                      </Field>
                    )}

                    <Field label="Loại hình">
                      <div className="flex flex-wrap gap-1.5">
                        {availableTypes.map((t) => (
                          <Chip key={t} active={form.type === t} disabled={!!unit} onClick={() => pickType(t)}>
                            {TYPE_LABELS[t]}
                          </Chip>
                        ))}
                      </div>
                    </Field>

                    <Field label="Hướng nhà">
                      <div className="flex flex-wrap gap-1.5">
                        {DIRECTION_ORDER.filter((d) => formData.directions.includes(d)).map((d) => (
                          <Chip key={d} active={form.direction === d} disabled={!!unit} onClick={() => set({ direction: d })}>
                            {DIRECTION_LABELS[d]}
                          </Chip>
                        ))}
                      </div>
                    </Field>

                    <Field label="Diện tích">
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={range[0]}
                          max={range[1]}
                          step="1"
                          value={form.area}
                          disabled={!!unit}
                          onChange={(e) => set({ area: Number(e.target.value) })}
                          className="flex-1 accent-[#948154] cursor-pointer"
                        />
                        <span className="text-[#948154] font-extrabold text-[12px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200 w-[72px] text-center">
                          {form.area} m²
                        </span>
                      </div>
                      <div className="flex justify-between text-[8.5px] text-gray-400">
                        <span>{range[0]} m²</span>
                        <span>{range[1]} m²</span>
                      </div>
                    </Field>

                    <div className="grid grid-cols-2 gap-2">
                      {form.type === "apartment" ? (
                        <Field label="Tầng">
                          <input
                            type="number"
                            min="1"
                            max="80"
                            value={form.floor}
                            disabled={!!unit}
                            onChange={(e) => set({ floor: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px]"
                          />
                        </Field>
                      ) : (
                        <Field label="Vị trí">
                          <div className="flex gap-1.5">
                            <Chip active={!form.isCorner} disabled={!!unit} onClick={() => set({ isCorner: false })}>
                              Giữa dãy
                            </Chip>
                            <Chip active={form.isCorner} disabled={!!unit} onClick={() => set({ isCorner: true })}>
                              Căn góc
                            </Chip>
                          </div>
                        </Field>
                      )}
                      <Field label="Hướng nhìn">
                        <select
                          value={form.view}
                          disabled={!!unit}
                          onChange={(e) => set({ view: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] bg-white"
                        >
                          {VIEW_ORDER.filter((v) => formData.views.includes(v)).map((v) => (
                            <option key={v} value={v}>
                              {VIEW_LABELS[v]}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                )}

                {calcError && <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5">{calcError}</p>}

                {result && (
                  <div className={`space-y-3 transition-opacity ${calculating ? "opacity-60" : ""}`}>
                    {/* Giá trị ước tính */}
                    <div className="p-3 rounded-xl bg-gradient-to-br from-amber-900/5 via-amber-50/50 to-amber-100/30 border border-[#948154]/20 space-y-2">
                      <p className="text-[9px] font-extrabold uppercase text-[#948154] tracking-wider flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Giá trị ước tính
                      </p>
                      <p className="text-[22px] font-extrabold text-gray-900 leading-none">{fmtVnd(value)}</p>
                      <p className="text-[10.5px] text-gray-600">
                        {result.input.area} m² × {fmtVnd(result.unit_price.applied)}/m²
                      </p>
                      <div>
                        <div className="relative h-2 rounded-full bg-gradient-to-r from-sky-200 via-amber-200 to-rose-200">
                          <span
                            className="absolute -top-1 w-1.5 h-4 rounded-full bg-[#948154] ring-2 ring-white"
                            style={{ left: `calc(${Math.min(100, Math.max(0, bandPos))}% - 3px)` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9.5px] mt-1">
                          <span className="text-gray-500">
                            Sàn <b className="text-gray-800">{fmtMoney(result.value.floor)}</b>
                          </span>
                          <span className="text-gray-400">±{result.value.band_pct}%</span>
                          <span className="text-gray-500">
                            Trần <b className="text-gray-800">{fmtMoney(result.value.ceiling)}</b>
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowFactors((v) => !v)}
                        className="w-full flex items-center justify-between text-[10px] text-gray-600 pt-1.5 border-t border-gray-200/70 cursor-pointer"
                      >
                        <span>Cách tính đơn giá</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFactors ? "rotate-180" : ""}`} />
                      </button>
                      {showFactors && (
                        <div className="text-[10px] space-y-0.5">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Đơn giá gốc dự án</span>
                            <span className="font-mono">{fmtVnd(result.unit_price.base)}</span>
                          </div>
                          {Object.entries(FACTOR_LABELS).map(([k, label]) => (
                            <div key={k} className="flex justify-between">
                              <span className="text-gray-500">× {label}</span>
                              <span className="font-mono">{Number(result.unit_price.factors[k]).toLocaleString("vi-VN", { maximumFractionDigits: 4 })}</span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t border-gray-200/70 pt-0.5 font-bold">
                            <span>= Đơn giá áp dụng</span>
                            <span className="font-mono">{fmtVnd(result.unit_price.applied)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Lịch sử giá */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-700">Lịch sử đơn giá ({TYPE_LABELS[result.input.type]})</p>
                      {history.length >= 2 ? (
                        <>
                          <div className="h-[110px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} minTickGap={24} />
                                <YAxis
                                  domain={["auto", "auto"]}
                                  tickFormatter={(v) => `${Math.round(v / 1e6)}tr`}
                                  tick={{ fontSize: 9, fill: "#9ca3af" }}
                                  axisLine={false}
                                  tickLine={false}
                                  width={34}
                                />
                                <Tooltip formatter={(v) => [`${fmtVnd(v)}/m²`, "Đơn giá"]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                <Line type="monotone" dataKey="price_per_m2" stroke={GOLD} strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="text-[10px] text-gray-500">
                            Tăng bình quân {result.history.cagr_pct}%/năm · cao nhất {fmtMoney(result.history.high)}/m² · thấp nhất{" "}
                            {fmtMoney(result.history.low)}/m²
                          </p>
                        </>
                      ) : (
                        <p className="text-[10px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-2">
                          Mới có đơn giá của tháng này. Dự phóng bên dưới dùng mức tăng giá {result.projection.scenarios[1]?.growth_pct}%/năm do VinClub
                          cấu hình.
                        </p>
                      )}
                    </div>

                    {/* Dự phóng */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-gray-700">Dự phóng nếu giữ căn</p>
                        <div className="flex gap-1">
                          {[3, 5, 10].map((y) => (
                            <Chip key={y} active={form.years === y} onClick={() => set({ years: y })}>
                              {y} năm
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-100 overflow-hidden">
                        <table className="w-full text-[10px]">
                          <thead className="bg-gray-50 text-gray-500">
                            <tr>
                              <th className="text-left px-2 py-1 font-semibold">Kịch bản</th>
                              <th className="text-right px-2 py-1 font-semibold">Giá trị sau {result.projection.years} năm</th>
                              <th className="text-right px-2 py-1 font-semibold">Tiền thuê ròng</th>
                              <th className="text-right px-2 py-1 font-semibold">Lãi dự kiến</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.projection.scenarios.map((s) => (
                              <tr key={s.name} className={`border-t border-gray-100 ${s.name === "base" ? "bg-amber-50/50 font-bold" : ""}`}>
                                <td className="px-2 py-1">
                                  {SCENARIO_LABELS[s.name]}
                                  <span className="block text-[9px] font-normal text-gray-400">+{s.growth_pct}%/năm</span>
                                </td>
                                <td className="px-2 py-1 text-right">{fmtMoney(s.value_end)}</td>
                                <td className="px-2 py-1 text-right">{fmtMoney(s.rent_net_total)}</td>
                                <td className="px-2 py-1 text-right text-emerald-700">+{fmtMoney(s.profit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[9.5px] text-gray-400">
                        Tiền thuê ròng tính với tỉ suất {result.projection.rent_yield_pct}%/năm sau khi trừ thời gian trống và chi phí vận hành.
                      </p>
                    </div>

                    {/* Đầu tư trong app - cùng công thức với DepositModal */}
                    {totalTermRate > 0 && (
                      <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 space-y-1 text-[10.5px]">
                        <p className="font-bold text-gray-700">Nếu đầu tư số tiền này theo kỳ hạn của dự án trong VinClub</p>
                        <div className="flex justify-between">
                          <span className="text-gray-600">
                            Lãi toàn kỳ ({totalTermRate}% · ~{formatDailyRatePercent(totalTermRate, cycleDays)}):
                          </span>
                          <span className="font-bold text-red-600">+{fmtVnd(termInterest)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" /> Dự kiến đáo hạn:
                          </span>
                          <span className="font-bold">{maturityDate.toLocaleDateString("vi-VN")}</span>
                        </div>
                        <p className="text-[9px] text-gray-500">
                          {isDailyAccrualCategory(project.category) ? "Lãi được cộng vào ví mỗi ngày trong suốt kỳ hạn." : TERM_PAYOUT_COPY}
                        </p>
                      </div>
                    )}

                    <button
                      onClick={() => setTab("payment")}
                      className="w-full py-2 rounded-xl border border-gray-200 text-[11px] font-bold text-gray-700 cursor-pointer"
                    >
                      Xem tiến độ thanh toán & gói vay →
                    </button>
                  </div>
                )}
              </>
            )}

            {tab === "payment" && !formError && (
              <>
                {!result ? (
                  <p className="text-center text-[11px] text-gray-500 py-8">Chọn thông số ở tab Định giá trước.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[10.5px] text-gray-600">
                      Cho {TYPE_LABELS[result.input.type].toLowerCase()} {result.input.area} m², giá trị ước tính{" "}
                      <b className="text-gray-900">{fmtVnd(value)}</b>.
                    </p>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-700">Thanh toán theo tiến độ</p>
                      <div className="rounded-xl border border-gray-100 overflow-hidden">
                        <table className="w-full text-[10.5px]">
                          <tbody>
                            {result.payment.schedule.map((p) => (
                              <tr key={p.label} className="border-t border-gray-100 first:border-t-0">
                                <td className="px-2.5 py-1.5">
                                  {p.label}
                                  <span className="block text-[9px] text-gray-400">{p.month === 0 ? "Ngay khi ký" : `Tháng thứ ${p.month}`}</span>
                                </td>
                                <td className="px-2.5 py-1.5 text-right text-gray-500">{p.pct}%</td>
                                <td className="px-2.5 py-1.5 text-right font-bold">{fmtVnd(p.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {Number(result.payment.early_discount_pct) > 0 && (
                        <p className="text-[10px] text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5">
                          Thanh toán sớm 100%: chiết khấu {result.payment.early_discount_pct}%, còn <b>{fmtVnd(result.payment.early_total)}</b>.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-gray-700 flex items-center gap-1">
                        <Landmark className="w-3.5 h-3.5 text-[#948154]" /> Gợi ý gói vay (xếp theo tổng tiền lãi thấp nhất)
                      </p>
                      {result.loans.length === 0 && <p className="text-[10px] text-gray-500">Chưa có gói vay nào được cấu hình.</p>}
                      {result.loans.map((l, i) => (
                        <div key={l.id} className={`rounded-xl border p-2.5 text-[10.5px] space-y-1 ${i === 0 ? "border-[#948154]/40 bg-amber-50/40" : "border-gray-100"}`}>
                          <div className="flex justify-between items-start">
                            <p className="font-bold text-gray-900">{l.name}</p>
                            {i === 0 && <span className="text-[9px] font-bold text-[#948154]">Đề xuất</span>}
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                            <span className="text-gray-500">Vay ({Math.round(l.ltv * 100)}%)</span>
                            <span className="text-right font-semibold">{fmtMoney(l.amount)}</span>
                            <span className="text-gray-500">Vốn tự có</span>
                            <span className="text-right font-semibold">{fmtMoney(l.equity)}</span>
                            <span className="text-gray-500">
                              Trả tháng đầu ({l.promo_rate}%{l.promo_months ? ` · ${l.promo_months} th` : ""})
                            </span>
                            <span className="text-right font-semibold">{fmtMoney(l.monthly_first)}</span>
                            <span className="text-gray-500">Sau ưu đãi ({l.float_rate}%)</span>
                            <span className="text-right font-semibold">{fmtMoney(l.monthly_after)}</span>
                            <span className="text-gray-500">Tổng lãi {l.years} năm</span>
                            <span className="text-right font-semibold">{fmtMoney(l.total_interest)}</span>
                          </div>
                          <p className="text-[9px] text-gray-400">{l.source_note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {result && tab !== "overview" && (
              <p className="text-[8.5px] text-gray-400 text-center leading-snug">
                Ước tính tham khảo theo cấu hình ngày {new Date(result.config_updated_at).toLocaleDateString("vi-VN")}, không phải giá chào bán chính
                thức hay cam kết lợi nhuận.
              </p>
            )}
          </div>

          {/* Hành động */}
          <div className="p-4 pt-2 border-t border-gray-100 shrink-0 grid grid-cols-2 gap-2">
            <button
              onClick={() => sendLead("consult")}
              disabled={!result || !!leadBusy}
              className="py-2.5 rounded-xl border border-[#948154] text-[#948154] text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              {leadBusy === "consult" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Headphones className="w-3.5 h-3.5" />} Liên hệ tư vấn
            </button>
            {isActive ? (
              <button
                onClick={() => onInvest?.(project)}
                className="py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[11px] font-bold shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Đầu tư ngay <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => sendLead("notify")}
                disabled={!result || !!leadBusy}
                className="py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[11px] font-bold shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                {leadBusy === "notify" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />} Báo khi mở bán
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
