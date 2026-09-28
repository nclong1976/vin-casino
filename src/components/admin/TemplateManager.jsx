import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Pencil, X, Archive, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const STATUS_CONFIG = {
  draft: { label: "Nháp", color: "bg-gray-100 text-gray-500" },
  published: { label: "Đã xuất bản", color: "bg-green-100 text-green-600" },
  archived: { label: "Đã lưu trữ", color: "bg-orange-100 text-orange-600" },
};

const CATEGORY_SUGGESTIONS = ["Hợp đồng", "Giấy uỷ quyền", "Biên bản thỏa thuận", "Cam kết", "Thông báo"];

function normalizeVariableKey(raw) {
  return (raw || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
}

const emptyForm = { name: "", category: "", body: "", variables: [] };

/**
 * Giai đoạn 1 của thiết kế "E-Contract & Document e-Signing" (xem doc thiết
 * kế): cho phép Admin tạo/sửa Mẫu tài liệu (document_templates) tái sử dụng
 * nhiều lần, thay vì phải gõ tay toàn bộ nội dung mỗi lần gửi như trước.
 * DocumentsTab.jsx (luồng "Soạn & gửi") đọc các mẫu status='published' từ
 * đây để dựng form nhập biến động + render preview khi khởi tạo document.
 */
export default function TemplateManager() {
  const { user: adminUser } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [varKeyInput, setVarKeyInput] = useState("");
  const [varLabelInput, setVarLabelInput] = useState("");
  const [varRequiredInput, setVarRequiredInput] = useState(true);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef(null);

  const fetchTemplates = () => {
    base44.entities.DocumentTemplate.list("-created_date", 200)
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
    const unsub = base44.entities.DocumentTemplate.subscribe(() => fetchTemplates());
    return () => unsub();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setVarKeyInput("");
    setVarLabelInput("");
    setVarRequiredInput(true);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (tpl) => {
    setForm({
      name: tpl.name || "",
      category: tpl.category || "",
      body: tpl.body || "",
      variables: Array.isArray(tpl.variables) ? tpl.variables : [],
    });
    setEditingId(tpl.id);
    setFormOpen(true);
  };

  const insertVariableIntoBody = (key) => {
    const token = `{{${key}}}`;
    const el = bodyRef.current;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = form.body.slice(0, start) + token + form.body.slice(end);
      setForm((f) => ({ ...f, body: next }));
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + token.length;
      });
    } else {
      setForm((f) => ({ ...f, body: f.body + token }));
    }
  };

  const addVariable = () => {
    const key = normalizeVariableKey(varKeyInput);
    if (!key) {
      toast.error("Vui lòng nhập mã biến (VD: HO_TEN)");
      return;
    }
    if (form.variables.some((v) => v.key === key)) {
      toast.error("Mã biến này đã tồn tại");
      return;
    }
    setForm((f) => ({
      ...f,
      variables: [...f.variables, { key, label: varLabelInput.trim() || key, required: varRequiredInput }],
    }));
    setVarKeyInput("");
    setVarLabelInput("");
    setVarRequiredInput(true);
  };

  const removeVariable = (key) => {
    setForm((f) => ({ ...f, variables: f.variables.filter((v) => v.key !== key) }));
  };

  const saveTemplate = async (status) => {
    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên mẫu");
      return;
    }
    if (!form.body.trim()) {
      toast.error("Vui lòng nhập nội dung mẫu");
      return;
    }
    setSaving(true);
    try {
      const existing = editingId ? templates.find((t) => t.id === editingId) : null;
      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        body: form.body,
        variables: form.variables,
        status,
        version: (existing?.version || 0) + 1,
      };
      if (editingId) {
        await base44.entities.DocumentTemplate.update(editingId, payload);
        toast.success("Đã cập nhật mẫu");
      } else {
        await base44.entities.DocumentTemplate.create({
          ...payload,
          created_by: adminUser?.full_name || adminUser?.email || "Admin",
        });
        toast.success("Đã tạo mẫu mới");
      }
      setFormOpen(false);
      resetForm();
    } catch (e) {
      toast.error("Không thể lưu mẫu");
    } finally {
      setSaving(false);
    }
  };

  const archiveTemplate = async (tpl) => {
    try {
      await base44.entities.DocumentTemplate.update(tpl.id, { status: "archived" });
      toast.success("Đã lưu trữ mẫu");
    } catch (e) {
      toast.error("Không thể lưu trữ mẫu");
    }
  };

  const deleteTemplate = async (tpl) => {
    if (!window.confirm(`Xóa hẳn mẫu "${tpl.name}"? Hành động này không thể hoàn tác.`)) return;
    try {
      await base44.entities.DocumentTemplate.delete(tpl.id);
      toast.success("Đã xóa mẫu");
    } catch (e) {
      toast.error("Không thể xóa - có thể mẫu này đã được dùng để tạo tài liệu. Hãy lưu trữ thay vì xóa.");
    }
  };

  const previewRendered = useMemo(() => {
    let out = form.body || "";
    form.variables.forEach((v) => {
      out = out.split(`{{${v.key}}}`).join(`[${v.label}]`);
    });
    return out;
  }, [form.body, form.variables]);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => (formOpen ? setFormOpen(false) : openCreate())}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
        >
          <span className="flex items-center gap-2 text-[13px] font-bold text-black">
            <Plus className="w-4 h-4 text-[#948154]" /> {editingId ? "Sửa mẫu tài liệu" : "Tạo mẫu tài liệu mới"}
          </span>
          {formOpen && <X className="w-4 h-4 text-gray-400" />}
        </button>

        <AnimatePresence>
          {formOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                <div>
                  <label className="text-[10.5px] font-bold text-gray-700">Tên mẫu</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="VD: Hợp đồng đặt cọc"
                    className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-[#948154] outline-none text-[12px]"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] font-bold text-gray-700">Nhóm mẫu</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="VD: Hợp đồng, Giấy uỷ quyền..."
                    list="template-category-suggestions"
                    className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-[#948154] outline-none text-[12px]"
                  />
                  <datalist id="template-category-suggestions">
                    {CATEGORY_SUGGESTIONS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                {/* Biến động */}
                <div>
                  <label className="text-[10.5px] font-bold text-gray-700">Biến động (chèn vào nội dung dạng {"{{MÃ_BIẾN}}"})</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {form.variables.map((v) => (
                      <span key={v.key} className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg bg-[#948154]/10 text-[10.5px] text-[#837046] font-medium">
                        <button type="button" onClick={() => insertVariableIntoBody(v.key)} className="hover:underline">
                          {`{{${v.key}}}`} {v.required ? "" : "(tuỳ chọn)"}
                        </button>
                        <button type="button" onClick={() => removeVariable(v.key)} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {form.variables.length === 0 && <span className="text-[10.5px] text-gray-400">Chưa có biến nào</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                    <input
                      value={varKeyInput}
                      onChange={(e) => setVarKeyInput(e.target.value)}
                      placeholder="Mã biến (HO_TEN)"
                      className="h-8 px-2 rounded-md border border-gray-300 focus:border-[#948154] outline-none text-[11px] w-32"
                    />
                    <input
                      value={varLabelInput}
                      onChange={(e) => setVarLabelInput(e.target.value)}
                      placeholder="Nhãn hiển thị (Họ tên)"
                      className="h-8 px-2 rounded-md border border-gray-300 focus:border-[#948154] outline-none text-[11px] w-36"
                    />
                    <label className="flex items-center gap-1 text-[10.5px] text-gray-600">
                      <input type="checkbox" checked={varRequiredInput} onChange={(e) => setVarRequiredInput(e.target.checked)} />
                      Bắt buộc
                    </label>
                    <button
                      type="button"
                      onClick={addVariable}
                      className="h-8 px-2.5 rounded-md bg-[#948154] hover:bg-[#837046] text-white text-[11px] font-semibold"
                    >
                      + Thêm biến
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10.5px] font-bold text-gray-700">Nội dung mẫu</label>
                  <textarea
                    ref={bodyRef}
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder="Soạn nội dung mẫu, nhấn vào 1 biến ở trên để chèn vào vị trí con trỏ..."
                    rows={9}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-[#948154] outline-none text-[12px] leading-relaxed resize-y font-mono"
                  />
                </div>

                {form.body.trim() && (
                  <div>
                    <label className="text-[10.5px] font-bold text-gray-700">Xem trước (biến hiển thị dạng [Nhãn])</label>
                    <div className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-gray-600 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                      {previewRendered}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => saveTemplate("draft")}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-[12px] font-semibold"
                  >
                    Lưu nháp
                  </button>
                  <button
                    onClick={() => saveTemplate("published")}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-lg bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[12px] font-semibold flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> {saving ? "Đang lưu..." : "Xuất bản"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {loading ? (
        <div className="text-center py-8 text-[13px] text-gray-400">Đang tải...</div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-[13px] text-gray-400 shadow-sm">Chưa có mẫu tài liệu nào</div>
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => {
            const sc = STATUS_CONFIG[tpl.status] || STATUS_CONFIG.draft;
            return (
              <div key={tpl.id} className="bg-white rounded-xl shadow-sm p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-bold text-black truncate">{tpl.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {tpl.category || "Không phân loại"} · v{tpl.version || 1} · {(tpl.variables || []).length} biến
                  </p>
                  <span className={`inline-block mt-1 text-[9px] font-semibold px-2 py-0.5 rounded-full ${sc.color}`}>{sc.label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(tpl)} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" title="Sửa">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {tpl.status !== "archived" && (
                    <button onClick={() => archiveTemplate(tpl)} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" title="Lưu trữ">
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => deleteTemplate(tpl)} className="p-1.5 rounded-md text-red-400 hover:bg-red-50" title="Xóa">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
