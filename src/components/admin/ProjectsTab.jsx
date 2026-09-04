import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Pencil, Check, X, Plus, Search, MapPin, Building2, Lock, Loader2, Trash2, AlertTriangle, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { isDailyAccrualCategory, getCycleDays, formatDailyRatePercent, getProjectTermUnit } from "@/lib/investmentTerms";

const fmtSchedule = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
};

export default function ProjectsTab({ filterRequest }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  // "Đi tới Dự án" từ tab Chứng khoán truyền sẵn "STOCKS" để mở đúng bộ
  // lọc, không bắt admin tự bấm lại.
  const [categoryFilter, setCategoryFilter] = useState(filterRequest?.filter || "ALL");
  const [togglingId, setTogglingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ProjectsTab giờ luôn mount sẵn (Admin.jsx chỉ ẩn/hiện bằng CSS thay vì
  // unmount) nên không còn nhận filter mới qua remount - phải tự áp dụng
  // lại mỗi khi Admin.jsx bấm "Đi tới Dự án" gửi yêu cầu mới (nhận biết qua
  // "nonce" tăng dần, không phải qua giá trị filter, để bấm 2 lần liên tiếp
  // cùng 1 filter vẫn có tác dụng).
  useEffect(() => {
    if (filterRequest?.filter) setCategoryFilter(filterRequest.filter);
  }, [filterRequest?.nonce]);

  const fetch = () => {
    base44.entities.Project
      .list("-created_date", 100)
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch();
    // Subscribe to real-time project updates from base44 entity client
    const unsubscribe = base44.entities.Project.subscribe((updatedItems) => {
      if (Array.isArray(updatedItems)) {
        setProjects(updatedItems);
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const toggleActive = async (p) => {
    const nextStatus = !p.is_active;
    setTogglingId(p.id);
    // Đổi giao diện ngay để admin thấy phản hồi tức thì, không đợi network
    setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: nextStatus } : x)));
    try {
      const result = await base44.entities.Project.update(p.id, { is_active: nextStatus });
      if (result?.__supabaseSynced === false) throw new Error("Ghi lên máy chủ thất bại");
      toast.success(
        nextStatus
          ? `Đã BẬT mở đầu tư: "${p.title || p.name}"`
          : `Đã TẮT tạm khóa đầu tư: "${p.title || p.name}"`
      );
      fetch();
    } catch (e) {
      // Rollback nếu ghi thất bại
      setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: p.is_active } : x)));
      toast.error("Không thể cập nhật trạng thái dự án");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await base44.entities.Project.delete(deleting.id);
      toast.success(`Đã xóa dự án "${deleting.title || deleting.name}"`);
      setProjects((prev) => prev.filter((x) => x.id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      toast.error("Không thể xóa dự án");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSave = async (data) => {
    try {
      const result = editing?.id
        ? await base44.entities.Project.update(editing.id, data)
        : await base44.entities.Project.create(data);
      if (result?.__supabaseSynced === false) {
        toast.error("Ghi lên máy chủ thất bại, vui lòng thử lại.");
        return;
      }
      toast.success(editing?.id ? `Đã cập nhật dự án "${data.title}" thành công` : `Đã tạo mới dự án "${data.title}"`);
      setEditing(null);
      setShowAdd(false);
      fetch();
    } catch (e) {
      toast.error("Không thể lưu thông tin dự án");
    }
  };

  // Filter logic
  const filtered = projects.filter((p) => {
    const title = (p.title || p.name || "").toLowerCase();
    const loc = (p.location || "").toLowerCase();
    const cat = (p.category || "").toLowerCase();
    const q = search.toLowerCase();
    const matchesSearch = title.includes(q) || loc.includes(q) || cat.includes(q);

    if (categoryFilter === "ALL") return matchesSearch;
    if (categoryFilter === "PROJECT") {
      return matchesSearch && (cat === "dự án" || cat.includes("xe điện") || cat.includes("thương mại") || cat.includes("công nghệ") || (!cat.includes("vinhomes") && !cat.includes("đất") && !cat.includes("nghỉ dưỡng") && !cat.includes("chứng khoán")));
    }
    if (categoryFilter === "VINHOMES") {
      return matchesSearch && (cat === "vinhomes" || cat.includes("đất") || cat.includes("bất động sản") || title.includes("vinhomes"));
    }
    if (categoryFilter === "RESORT") {
      return matchesSearch && (cat.includes("nghỉ dưỡng") || cat.includes("resort") || title.includes("vinpearl"));
    }
    if (categoryFilter === "STOCKS") {
      return matchesSearch && (cat.includes("chứng khoán") || cat.includes("cổ phiếu") || title.includes("cổ phiếu") || title.includes("phần"));
    }
    return matchesSearch;
  });

  const getCategoryBadgeStyle = (category = "") => {
    const c = category.toLowerCase();
    if (c === "vinhomes" || c.includes("đất") || c.includes("bất động sản")) {
      return "bg-amber-50 text-[#837046] border-amber-200";
    }
    if (c.includes("nghỉ dưỡng") || c.includes("resort")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (c.includes("chứng khoán") || c.includes("cổ phiếu")) {
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
    return "bg-blue-50 text-blue-700 border-blue-200";
  };

  if (loading)
    return <div className="text-center py-8 text-[12px] text-gray-400">Đang tải danh mục dự án...</div>;

  return (
    <div className="space-y-3">
      {/* Header Bar & Actions */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-bold text-black flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-[#948154]" /> Quản lý 4 Mục Đầu tư ({projects.length})
          </h2>
          <p className="text-[9.5px] text-gray-400">Đồng bộ hai chiều trực tiếp với giao diện người dùng</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowAdd(true); }}
          className="px-3 py-1.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[10.5px] font-bold flex items-center gap-1 shadow-xs shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Thêm dự án
        </button>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="space-y-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên dự án, vị trí, danh mục..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] focus:outline-none focus:border-[#948154]"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
          {[
            ["ALL", "Tất cả"],
            ["PROJECT", "1. Dự Án"],
            ["VINHOMES", "2. VinHomes"],
            ["RESORT", "3. Đầu tư nghỉ dưỡng"],
            ["STOCKS", "4. Đầu tư chứng khoán"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              className={`relative px-2.5 py-1 rounded-lg text-[9.5px] font-bold shrink-0 transition-colors cursor-pointer ${
                categoryFilter === key
                  ? "text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {categoryFilter === key && (
                <motion.span
                  layoutId="projects-category-filter-active-bg"
                  className="absolute inset-0 bg-[#948154] rounded-lg shadow-xs"
                  transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Project Cards List */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-[12px] text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
          Không tìm thấy dự án phù hợp
        </div>
      ) : (
        filtered.map((p) => {
          const isActive = p.is_active ?? true;
          return (
            <div
              key={p.id}
              className={`bg-white rounded-xl p-3 shadow-xs border transition-all ${
                isActive ? "border-gray-100" : "border-amber-200/80 bg-amber-50/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                  <img src={p.image} alt={p.title || p.name} className="w-full h-full object-cover" />
                  {!isActive && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center text-white">
                      <Lock className="w-4 h-4 text-amber-300" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="text-[12px] font-bold text-black truncate">{p.title || p.name}</h3>
                    <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${getCategoryBadgeStyle(p.category)}`}>
                      {p.category || "Dự Án"}
                    </span>
                  </div>

                  {p.location && (
                    <p className="text-[9.5px] text-gray-500 flex items-center gap-0.5 mt-0.5">
                      <MapPin className="w-2.5 h-2.5 text-red-500" /> {p.location}
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-1 mt-1.5 p-1.5 rounded-lg bg-gray-50 text-[9px]">
                    <div>
                      <span className="text-gray-400 block text-[8px]">Đơn giá:</span>
                      <span className="font-bold text-[#948154]">{p.priceStr || (p.price_per_m2 ? `${new Intl.NumberFormat("vi-VN").format(p.price_per_m2)} ₫/m²` : "Linh hoạt")}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[8px]">Lãi suất toàn kỳ:</span>
                      <span className="font-bold text-red-600">{p.total_term_interest_rate ?? 0}%</span>
                      {isDailyAccrualCategory(p.category) && (
                        <span className="text-gray-400 block text-[8px]">
                          ~{formatDailyRatePercent(p.total_term_interest_rate, getCycleDays(p))}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[8px]">Diện tích:</span>
                      <span className="font-bold text-gray-800">{p.area || "Tiêu chuẩn"}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[8.5px] text-gray-400 shrink-0">Tiến độ:</span>
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#948154] rounded-full" style={{ width: `${p.progress || 0}%` }} />
                    </div>
                    <span className="text-[8.5px] font-bold text-black">{p.progress || 0}%</span>
                  </div>

                  {/* Scheduled open/close indicator */}
                  {(p.scheduled_open_at || p.scheduled_close_at) && (
                    <div className="flex items-center gap-1 mt-1 text-[8.5px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-1.5 py-0.5 w-fit">
                      <Clock className="w-2.5 h-2.5" />
                      {p.scheduled_open_at && <span>Tự MỞ lúc {fmtSchedule(p.scheduled_open_at)}</span>}
                      {p.scheduled_open_at && p.scheduled_close_at && <span>•</span>}
                      {p.scheduled_close_at && <span>Tự TẮT lúc {fmtSchedule(p.scheduled_close_at)}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Toolbar: Edit, Delete & Investment Toggle Switch */}
              <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditing(p)}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10.5px] font-bold flex items-center gap-1 transition-all"
                  >
                    <Pencil className="w-3 h-3 text-[#948154]" /> Chỉnh sửa
                  </button>
                  <button
                    onClick={() => setDeleting(p)}
                    title="Xóa dự án"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Toggle Switch */}
                <div className="flex items-center gap-2">
                  <span className={`text-[9.5px] font-bold ${isActive ? "text-green-700" : "text-amber-800"}`}>
                    {togglingId === p.id ? "Đang cập nhật..." : isActive ? "Mở đầu tư (Bật)" : "Tạm khóa (Tắt)"}
                  </span>
                  <button
                    onClick={() => toggleActive(p)}
                    disabled={togglingId === p.id}
                    title={isActive ? "Khóa nhận vốn đầu tư" : "Mở nhận vốn đầu tư"}
                    className={`relative inline-flex h-6 w-11 items-center justify-center rounded-full transition-colors focus:outline-none disabled:cursor-wait ${
                      isActive ? "bg-green-600" : "bg-gray-300"
                    }`}
                  >
                    {togglingId === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    ) : (
                      <span
                        className={`absolute inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isActive ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Delete Confirmation Modal */}
      {deleting && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => !deleteLoading && setDeleting(null)}>
          <div className="w-full max-w-[320px] bg-white rounded-2xl shadow-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-[13px] font-bold">Xác nhận xóa dự án</h3>
            </div>
            <p className="text-[11px] text-gray-600">
              Bạn có chắc muốn xóa vĩnh viễn dự án <strong>"{deleting.title || deleting.name}"</strong>? Hành động này không thể hoàn tác.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setDeleting(null)}
                disabled={deleteLoading}
                className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11.5px] font-bold transition-all"
              >
                Hủy
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11.5px] font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Create Project Modal */}
      {(editing || showAdd) && (
        <ProjectEditModal
          project={editing}
          onClose={() => { setEditing(null); setShowAdd(false); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ProjectEditModal({ project, onClose, onSave }) {
  const [form, setForm] = useState({
    title: project?.title || project?.name || "",
    name: project?.name || project?.title || "",
    category: project?.category || "VinHomes",
    location: project?.location || "",
    priceStr: project?.priceStr || project?.price_str || "",
    price_per_m2: project?.price_per_m2 || 35000000,
    rate: project?.rate || "12%/năm",
    total_term_interest_rate: project?.total_term_interest_rate ?? 12,
    term_duration_minutes: project?.term_duration_minutes ?? 43200,
    area: project?.area || "80-120m²",
    progress: project?.progress ?? 85,
    description: project?.description || "",
    image: project?.image || "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&h=400&fit=crop",
    minAmount: project?.minAmount || project?.min_amount || "2800000000",
    duration: project?.duration || "64800",
    scale: project?.scale || "",
    is_active: project?.is_active ?? true,
    scheduled_open_at: project?.scheduled_open_at || "",
    scheduled_close_at: project?.scheduled_close_at || "",
    // Trường riêng theo từng mục trong 4 Mục Đầu tư - trước đây trang
    // người dùng (LandInvestment/Resort/Stocks.jsx) tự bịa cứng trong code
    // (cùng 1 chuỗi tĩnh cho MỌI dự án), admin không sửa được. Giờ mỗi
    // dự án có giá trị riêng, lưu thẳng vào investment_projects.
    legalStatus: project?.legal_status || "",
    growthHistory: project?.growth_history || "",
    monthlyTransactions: project?.monthly_transactions || "",
    tag: project?.tag || "",
    stockSymbol: project?.stock_symbol || "",
    dailyChangePercent: project?.daily_change_percent ?? 0,
  });

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v, ...(k === "title" ? { name: v } : {}) }));

  // Đơn vị kỳ hạn admin nhập ĐÚNG đơn vị người dùng nhìn thấy trên thẻ/
  // DepositModal (getProjectTermUnit(): Dự Án=phút, Đầu tư nghỉ dưỡng=giờ,
  // còn lại=ngày) - trước đây admin luôn phải tự quy đổi tay ra phút (vd 5
  // ngày phải tự gõ 7200), dễ tính nhầm. term_duration_minutes vẫn là cột
  // lưu thật DUY NHẤT, chỉ quy đổi qua lại lúc hiển thị/nhập.
  const termUnit = getProjectTermUnit({ category: form.category });
  const termUnitDivisor = termUnit === "phút" ? 1 : termUnit === "giờ" ? 60 : 1440;
  const termValueInUnit = Math.round((Number(form.term_duration_minutes) || 0) / termUnitDivisor);
  const setTermValueInUnit = (val) => {
    set("term_duration_minutes", Math.round((Number(val) || 0) * termUnitDivisor));
  };

  // Nhãn "Đơn giá" đúng Ý NGHĨA thật theo từng mục - cùng 1 cột
  // (price_per_m2/priceStr) nhưng mang ý nghĩa khác hẳn nhau: giá đất/m²
  // (VinHomes), giá trọn gói (Nghỉ dưỡng), giá khớp lệnh (Chứng khoán). Riêng
  // "Dự Án" (ProjectCard.jsx) KHÔNG hề đọc/hiển thị 2 trường này cho người
  // dùng - ghi rõ để admin khỏi mất công điền nhầm tưởng có tác dụng.
  const PRICE_FIELD_LABELS = {
    "VinHomes": { main: "Đơn giá đất (₫/m²):", str: "Đơn giá niêm yết (vd: 35 triệu/m²):" },
    "Đầu tư nghỉ dưỡng": { main: "Giá trọn gói đầu tư (₫):", str: "Giá niêm yết (vd: 2.5 tỷ):" },
    "Đầu tư chứng khoán": { main: "Giá khớp lệnh (₫/CP):", str: "Giá niêm yết (vd: 85.000đ/CP):" },
    "Dự Án": { main: "Đơn giá (không hiển thị cho Dự Án):", str: "Đơn giá niêm yết (không hiển thị cho Dự Án):" },
  };
  const priceLabels = PRICE_FIELD_LABELS[form.category] || PRICE_FIELD_LABELS["VinHomes"];

  // "minAmount" là input text tự do lưu số tiền tối thiểu (₫) - trước đây
  // không validate nên có thể lưu rỗng/số âm, khiến điều kiện "đủ tối thiểu
  // để đầu tư" ở phía người dùng bị vô hiệu hoá (Number("") === 0, Number
  // âm luôn nhỏ hơn mọi khoản đầu tư thật). "rate" KHÔNG validate ở đây vì
  // đây là nhãn hiển thị dạng chuỗi ("0.025%/giờ"), không phải số thuần.
  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast.error("Vui lòng nhập tên dự án");
      return;
    }
    const minAmountNum = Number(form.minAmount);
    if (!form.minAmount || isNaN(minAmountNum) || minAmountNum < 0) {
      toast.error("Số tiền tối thiểu phải là một số không âm");
      return;
    }
    // total_term_interest_rate/term_duration_minutes là 2 trường DUY NHẤT
    // dùng để tính lãi thật (xem trigger compute_transaction_interest trong
    // supabase_total_term_interest_migration.sql) - phải validate chặt vì
    // sai ở đây sẽ tính sai lãi cho MỌI hợp đồng mới của dự án này.
    if (isNaN(Number(form.total_term_interest_rate)) || Number(form.total_term_interest_rate) < 0) {
      toast.error("Lãi suất toàn kỳ phải là một số không âm");
      return;
    }
    if (!Number(form.term_duration_minutes) || Number(form.term_duration_minutes) <= 0) {
      toast.error("Kỳ hạn (phút) phải lớn hơn 0");
      return;
    }
    onSave({
      ...form,
      total_term_interest_rate: Number(form.total_term_interest_rate),
      term_duration_minutes: Math.round(Number(form.term_duration_minutes)),
      // Cột Postgres thật là "min_amount"/"price_str" (snake_case) - form
      // này dùng "minAmount"/"priceStr" (camelCase) để khớp quy ước cũ của
      // ProjectCard/DepositModal, nhưng gửi thẳng camelCase lên Supabase sẽ
      // bị lệch tên cột, rơi vào JSONB "extra" thay vì ghi đúng cột thật.
      min_amount: form.minAmount,
      price_str: form.priceStr,
      legal_status: form.legalStatus,
      growth_history: form.growthHistory,
      monthly_transactions: form.monthlyTransactions,
      tag: form.tag,
      stock_symbol: form.stockSymbol.trim().toUpperCase(),
      daily_change_percent: Number(form.dailyChangePercent) || 0,
    });
  };

  // <input type="datetime-local"> cần dạng "YYYY-MM-DDTHH:mm" (giờ local), khác với
  // ISO string lưu trữ (UTC) - 2 hàm dưới đây chuyển đổi qua lại giữa 2 định dạng.
  const toLocalInputValue = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fromLocalInputValue = (val) => (val ? new Date(val).toISOString() : "");

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-2" onClick={onClose}>
      <div className="w-full max-w-[325px] bg-white rounded-2xl max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-3.5 py-3 border-b border-gray-100">
          <h2 className="text-[13px] font-bold text-black flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-[#948154]" />
            {project?.id ? "Chỉnh sửa dự án" : "Thêm dự án mới"}
          </h2>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 space-y-3">
          {/* Tên dự án */}
          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">Tên dự án (*):</label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Ví dụ: Vinhomes Ocean Park"
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
            />
          </div>

          {/* Danh mục 4 Mục Đầu tư */}
          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">Danh mục Phân loại Đầu tư (4 Mục):</label>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154] bg-white font-semibold"
            >
              <option value="Dự Án">1. Dự Án (Thương mại, Hạ tầng, VinFast)</option>
              <option value="VinHomes">2. VinHomes (Bất động sản & Đất nền)</option>
              <option value="Đầu tư nghỉ dưỡng">3. Đầu tư nghỉ dưỡng (Vinpearl Resort & Condotel)</option>
              <option value="Đầu tư chứng khoán">4. Đầu tư chứng khoán (Cổ phiếu & Tài chính)</option>
            </select>
          </div>

          {/* Địa điểm / Khu vực */}
          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">Khu vực / Địa điểm:</label>
            <input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Ví dụ: Gia Lâm, Hà Nội"
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
            />
          </div>

          {/* Price & Rate Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">{priceLabels.main}</label>
              <input
                type="number"
                value={form.price_per_m2}
                onChange={(e) => set("price_per_m2", Number(e.target.value) || 0)}
                placeholder="35000000"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] font-mono focus:outline-none focus:border-[#948154]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">{priceLabels.str}</label>
              <input
                value={form.priceStr}
                onChange={(e) => set("priceStr", e.target.value)}
                placeholder="35 triệu/m²"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">Lợi nhuận %/ngày:</label>
            <input
              value={form.rate}
              onChange={(e) => set("rate", e.target.value)}
              placeholder="vd: 1.25%/ngày"
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
            />
          </div>

          {/* Lãi suất TOÀN KỲ & Kỳ hạn - 2 trường DUY NHẤT dùng để tính lãi */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">Lãi suất toàn kỳ (%):</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.total_term_interest_rate}
                onChange={(e) => set("total_term_interest_rate", e.target.value)}
                placeholder="90"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
              />
              {isDailyAccrualCategory(form.category) ? (
                <p className="text-[9px] text-emerald-600 mt-0.5 font-semibold">
                  Giải ngân hàng ngày, ~{formatDailyRatePercent(form.total_term_interest_rate, getCycleDays(form))} - gốc hoàn trả ngày cuối.
                </p>
              ) : (
                <p className="text-[9px] text-gray-400 mt-0.5">Lãi cho TRỌN kỳ hạn, trả 1 lần khi đáo hạn.</p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">Kỳ hạn ({termUnit}):</label>
              <input
                type="number"
                min="1"
                step="1"
                value={termValueInUnit}
                onChange={(e) => setTermValueInUnit(e.target.value)}
                placeholder={termUnit === "phút" ? "64800" : termUnit === "giờ" ? "120" : "45"}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
              />
              <p className="text-[9px] text-gray-400 mt-0.5">
                Đúng đơn vị hiển thị cho người dùng ở mục này (= {form.term_duration_minutes || 0} phút lưu thật).
              </p>
            </div>
          </div>

          {/* Trường riêng cho từng Mục Đầu tư - trang người dùng tương ứng
              (LandInvestment/Resort/Stocks.jsx) đọc trực tiếp các trường
              này, không còn bịa cứng trong code nữa. */}
          {form.category === "VinHomes" && (
            <div className="space-y-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-[10px] font-bold text-amber-800">Thông tin riêng - VinHomes</p>
              <div>
                <label className="text-[10px] font-bold text-gray-700 block mb-1">Tình trạng pháp lý:</label>
                <input
                  value={form.legalStatus}
                  onChange={(e) => set("legalStatus", e.target.value)}
                  placeholder="Sổ hồng chính chủ - Bảo lãnh 100%"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] bg-white focus:outline-none focus:border-[#948154]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-700 block mb-1">Lịch sử tăng trưởng:</label>
                  <input
                    value={form.growthHistory}
                    onChange={(e) => set("growthHistory", e.target.value)}
                    placeholder="+18.5% (3 năm qua)"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] bg-white focus:outline-none focus:border-[#948154]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-700 block mb-1">Giao dịch/tháng:</label>
                  <input
                    value={form.monthlyTransactions}
                    onChange={(e) => set("monthlyTransactions", e.target.value)}
                    placeholder="142 giao dịch/tháng"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] bg-white focus:outline-none focus:border-[#948154]"
                  />
                </div>
              </div>
            </div>
          )}

          {form.category === "Đầu tư nghỉ dưỡng" && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-[10px] font-bold text-emerald-800 mb-1.5">Thông tin riêng - Đầu tư nghỉ dưỡng</p>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">Nhãn ngắn hiển thị trên thẻ:</label>
              <input
                value={form.tag}
                onChange={(e) => set("tag", e.target.value)}
                placeholder="Biển / Đảo / Vịnh / Sông..."
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] bg-white focus:outline-none focus:border-[#948154]"
              />
            </div>
          )}

          {form.category === "Đầu tư chứng khoán" && (
            <div className="space-y-2 p-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
              <p className="text-[10px] font-bold text-indigo-800">Thông tin riêng - Cổ phiếu</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-700 block mb-1">Mã cổ phiếu (Symbol):</label>
                  <input
                    value={form.stockSymbol}
                    onChange={(e) => set("stockSymbol", e.target.value.toUpperCase())}
                    placeholder="VIC"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] uppercase font-mono font-bold bg-white focus:outline-none focus:border-[#948154]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-700 block mb-1">Biến động trong ngày (%):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.dailyChangePercent}
                    onChange={(e) => set("dailyChangePercent", e.target.value)}
                    placeholder="3.1"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] font-mono bg-white focus:outline-none focus:border-[#948154]"
                  />
                </div>
              </div>
              <p className="text-[9px] text-gray-500">Giá/CP nhập ở ô "Giá khớp lệnh" phía trên.</p>
            </div>
          )}

          {/* Area & Progress Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">Diện tích tiêu chuẩn:</label>
              <input
                value={form.area}
                onChange={(e) => set("area", e.target.value)}
                placeholder="80-120m²"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">Tiến độ hoàn thiện (%):</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.progress}
                onChange={(e) => set("progress", parseInt(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
              />
            </div>
          </div>

          {/* Image URL */}
          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">URL Hình ảnh minh họa:</label>
            <input
              value={form.image}
              onChange={(e) => set("image", e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
            />
            {form.image && (
              <div className="mt-1.5 h-20 rounded-lg overflow-hidden border border-gray-200">
                <img src={form.image} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">Mô tả chi tiết dự án:</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Mô tả đặc điểm nổi bật, tiềm năng tăng trưởng, pháp lý..."
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154] resize-none"
            />
          </div>

          {/* Min Amount & Scale */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">Số tiền tối thiểu (₫):</label>
              <input
                value={form.minAmount}
                onChange={(e) => set("minAmount", e.target.value)}
                placeholder="2800000000"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">Quy mô dự án:</label>
              <input
                value={form.scale}
                onChange={(e) => set("scale", e.target.value)}
                placeholder="420 ha"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
              />
            </div>
          </div>

          {/* Is Active Checkbox */}
          <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-black">Mở nhận vốn đầu tư (Bật)</p>
              <p className="text-[9px] text-gray-500">Dự án luôn hiển thị với người dùng; tắt = vẫn hiện nhưng khóa gửi tiền/ký hợp đồng mới</p>
            </div>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="w-4 h-4 accent-[#948154] cursor-pointer"
            />
          </div>

          {/* Hẹn giờ tự động Mở/Tắt */}
          <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-100 space-y-2">
            <p className="text-[11px] font-bold text-blue-900 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Hẹn giờ tự động Mở/Tắt (tùy chọn)
            </p>
            <div>
              <label className="text-[10px] font-semibold text-gray-700 block mb-1">Tự động MỞ lúc:</label>
              <input
                type="datetime-local"
                value={toLocalInputValue(form.scheduled_open_at)}
                onChange={(e) => set("scheduled_open_at", fromLocalInputValue(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154] bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-700 block mb-1">Tự động TẮT lúc:</label>
              <input
                type="datetime-local"
                value={toLocalInputValue(form.scheduled_close_at)}
                onChange={(e) => set("scheduled_close_at", fromLocalInputValue(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154] bg-white"
              />
            </div>
            {(form.scheduled_open_at || form.scheduled_close_at) && (
              <button
                type="button"
                onClick={() => { set("scheduled_open_at", ""); set("scheduled_close_at", ""); }}
                className="text-[10px] font-semibold text-red-600 hover:underline"
              >
                Hủy hẹn giờ
              </button>
            )}
            <p className="text-[9px] text-gray-500">
              Hệ thống sẽ tự động bật/tắt "Mở nhận vốn đầu tư" đúng thời điểm đã hẹn, không cần thao tác thủ công.
            </p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[11px] font-bold shadow-md transition-all flex items-center justify-center gap-1.5 mt-2"
          >
            <Check className="w-4 h-4" /> Lưu thông tin dự án
          </button>
        </div>
      </div>
    </div>
  );
}
