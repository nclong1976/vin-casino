import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText, Plus, Send, Search, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { validateTemplate } from "@/lib/esignValidation";
import { collectFieldAnchors, normalizeLayout, normalizeVariableKey, templateBody } from "@/shared/docLayout";
import LetterheadRenderer from "@/components/documents/LetterheadRenderer";
import QuillBodyEditor from "./QuillBodyEditor";
import VariablesPanel, { SYSTEM_VARIABLES } from "./VariablesPanel";
import RetentionSelect, { retentionLabel } from "./RetentionSelect";
import { SlotDragOverlay, SlotInspector, columnWidthMm } from "./SlotEditor";
import { FieldDragOverlay, FieldsPanel, newField } from "./FieldEditor";
import { SAMPLE_RECIPIENT, sampleValuesFor, usePublishedPreview } from "./preview";
import { Badge, Button, EmptyState, Field, Section, STATUS_BADGE, TextInput, Toggle } from "./ui";

const CATEGORY_SUGGESTIONS = ["Thông báo", "Hợp đồng", "Giấy uỷ quyền", "Biên bản thỏa thuận", "Cam kết"];

function isLegacy(tpl) {
  return !(tpl?.body_delta?.ops?.length > 0);
}

function toForm(row) {
  return {
    name: row?.name || "",
    category: row?.category || "Thông báo",
    letterhead_id: row?.letterhead_id || null,
    title_template: row?.title_template || row?.name || "",
    body_delta: JSON.parse(JSON.stringify(templateBody(row || {}))),
    variables: (row?.variables || []).map((v) => ({ scope: "campaign", type: "text", ...v, key: normalizeVariableKey(v.key) })),
    layout: JSON.parse(JSON.stringify(normalizeLayout(row?.layout))),
    requires_signature: row?.requires_signature !== false,
    retention_days: row?.retention_days ?? null,
  };
}

/** Danh sách Mẫu + trình soạn (spec 6.2). */
export default function TemplateLibrary({ onDispatch }) {
  const [items, setItems] = useState([]);
  const [letterheads, setLetterheads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = () =>
    Promise.all([base44.entities.DocumentTemplate.list("-created_date", 200), base44.entities.DocumentLetterhead.list("-created_date", 100)])
      .then(([tpls, lhs]) => {
        setItems(tpls);
        setLetterheads(lhs);
      })
      .catch(() => toast.error("Không tải được danh sách mẫu"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const unsub = base44.entities.DocumentTemplate.subscribe(() => load());
    return () => unsub?.();
  }, []);

  if (editing) {
    return (
      <TemplateEditor
        row={editing.row}
        letterheads={letterheads}
        onClose={() => {
          setEditing(null);
          load();
        }}
        onDispatch={onDispatch}
      />
    );
  }

  const lhName = (id) => letterheads.find((l) => l.id === id)?.name || "Khung mặc định";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500">Mẫu = nội dung soạn sẵn trên một Khung văn bản, có biến động và vị trí khung ký.</p>
        <Button onClick={() => setEditing({ row: null })}>
          <Plus className="w-3.5 h-3.5" /> Tạo mẫu
        </Button>
      </div>
      {loading ? (
        <p className="text-[11px] text-gray-400 py-6 text-center">Đang tải…</p>
      ) : items.length === 0 ? (
        <EmptyState icon={FileText} title="Chưa có mẫu" description="Tạo mẫu đầu tiên để phát hành văn bản." />
      ) : (
        <div className="space-y-2">
          {items.map((t) => {
            const st = STATUS_BADGE[t.status] || STATUS_BADGE.draft;
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
                <button type="button" onClick={() => setEditing({ row: t })} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12.5px] font-bold text-gray-900 truncate">{t.name || "(chưa đặt tên)"}</span>
                    <Badge color={st.color}>{st.label}</Badge>
                    {isLegacy(t) && <Badge color="orange">Mẫu cũ</Badge>}
                    <span className="text-[9.5px] text-gray-400">v{t.version || 1}</span>
                  </div>
                  <p className="text-[10.5px] text-gray-500 mt-0.5 truncate">
                    {t.category || "—"} · {lhName(t.letterhead_id)} · {(t.variables || []).length} biến · Lưu trữ: {retentionLabel(t.retention_days)}
                  </p>
                </button>
                {t.status === "published" && !isLegacy(t) && (
                  <Button variant="secondary" onClick={() => onDispatch?.(t.id)}>
                    <Send className="w-3.5 h-3.5" /> Phát hành
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecipientPicker({ value, onChange }) {
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const ensureUsers = () => {
    if (users) return;
    base44.entities.User.list("-created_date", 500).then(setUsers).catch(() => setUsers([]));
  };
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !users) return [];
    return users.filter((u) => `${u.full_name || ""} ${u.name || ""} ${u.email || ""} ${u.phone || ""}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, users]);

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <span className="text-[10.5px] text-gray-500 shrink-0">Xem với:</span>
        {value ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#948154]/10 text-[11px] text-[#7d6c45]">
            {value.full_name || value.name || value.email}
            <button type="button" onClick={() => onChange(null)} aria-label="Bỏ chọn người nhận">
              <X className="w-3 h-3" />
            </button>
          </span>
        ) : (
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onFocus={() => {
                ensureUsers();
                setOpen(true);
              }}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              placeholder={`${SAMPLE_RECIPIENT.full_name} (mẫu) - gõ để chọn người thật`}
              className="w-full h-8 pl-7 pr-2 rounded-lg border border-gray-300 text-[11px] outline-none focus:border-[#948154]"
            />
          </div>
        )}
      </div>
      {open && matches.length > 0 && !value && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 py-1">
          {matches.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onChange(u);
                setOpen(false);
                setQ("");
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-[11px]"
            >
              <b>{u.full_name || u.name}</b> <span className="text-gray-400">{u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ row, letterheads, onClose, onDispatch }) {
  const { user: adminUser } = useAuth();
  const [form, setForm] = useState(() => toForm(row));
  const [mode, setMode] = useState("compose"); // compose | print
  const [selectedSlot, setSelectedSlot] = useState("recipient");
  const [selectedField, setSelectedField] = useState(null);
  const [recipient, setRecipient] = useState(null);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const [lastFocus, setLastFocus] = useState("body");

  const publishedLetterheads = letterheads.filter((l) => l.status === "published");
  const letterhead = letterheads.find((l) => l.id === form.letterhead_id) || letterheads.find((l) => l.is_default) || publishedLetterheads[0] || null;
  const colW = columnWidthMm(letterhead?.theme);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const sampleValues = useMemo(() => sampleValuesFor(form.variables), [form.variables]);
  const { preview } = usePublishedPreview({ template: form, letterhead, recipient, campaignValues: sampleValues });
  const validation = useMemo(() => validateTemplate(form, preview), [form, preview]);

  const insertableVariables = useMemo(
    () => [...form.variables.map((v) => ({ key: normalizeVariableKey(v.key), label: v.label || v.key })), ...SYSTEM_VARIABLES],
    [form.variables],
  );

  const insertVariable = (key) => {
    if (lastFocus === "title" && titleRef.current) {
      const el = titleRef.current;
      const start = el.selectionStart ?? form.title_template.length;
      const end = el.selectionEnd ?? start;
      const token = `{{${key}}}`;
      set({ title_template: form.title_template.slice(0, start) + token + form.title_template.slice(end) });
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
      return;
    }
    if (mode === "compose") {
      editorRef.current?.insertVariable(key);
    } else {
      // Đang ở bản in: chuyển về Soạn rồi chèn khi editor hiện lại.
      setMode("compose");
      requestAnimationFrame(() => editorRef.current?.insertVariable(key));
    }
  };

  const updateSlot = (next) => set({ layout: { ...form.layout, slots: form.layout.slots.map((s) => (s.id === next.id ? next : s)) } });
  const updateSlotBox = (id, box) => set({ layout: { ...form.layout, slots: form.layout.slots.map((s) => (s.id === id ? { ...s, box } : s)) } });
  const swapSides = () =>
    set({ layout: { ...form.layout, slots: form.layout.slots.map((s) => ({ ...s, column: s.column === "left" ? "right" : "left" })) } });
  const resetSlots = () => set({ layout: { ...normalizeLayout(null), fields: form.layout.fields, illustrative_label: form.layout.illustrative_label } });

  const fields = form.layout.fields || [];
  const anchoredIds = useMemo(() => collectFieldAnchors(form.body_delta), [form.body_delta]);
  const setFields = (next) => set({ layout: { ...form.layout, fields: next } });
  const addField = (type) => {
    const field = newField(type, fields);
    setFields([...fields, field]);
    setSelectedField(field.id);
    if (field.anchor.kind === "flow" && mode === "compose") editorRef.current?.insertFieldAnchor(field.id);
  };
  const updateField = (next) => setFields(fields.map((f) => (f.id === next.id ? next : f)));
  const removeField = (id) => {
    editorRef.current?.removeFieldAnchor(id);
    setFields(fields.filter((f) => f.id !== id));
    setSelectedField(null);
  };
  const insertFieldAnchor = (id) => {
    const place = () => {
      editorRef.current?.removeFieldAnchor(id);
      editorRef.current?.insertFieldAnchor(id);
    };
    if (mode === "compose") place();
    else {
      setMode("compose");
      requestAnimationFrame(place);
    }
  };

  const save = async (status) => {
    if (status === "published" && validation.errors.length) {
      toast.error(validation.errors[0]);
      setMode("print");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Vui lòng đặt tên mẫu");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        variables: form.variables.map((v) => ({ ...v, key: normalizeVariableKey(v.key) })),
        status,
        updated_date: new Date().toISOString(),
      };
      if (row?.id) {
        const bump = status === "published" && row.status === "published" ? 1 : 0;
        await base44.entities.DocumentTemplate.update(row.id, { ...payload, version: (row.version || 1) + bump });
      } else {
        await base44.entities.DocumentTemplate.create({ ...payload, body: "", version: 1, created_by: adminUser?.email || adminUser?.id || null });
      }
      toast.success(status === "published" ? "Đã xuất bản mẫu" : "Đã lưu nháp");
      onClose();
    } catch (e) {
      toast.error(`Lưu thất bại: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const slot = form.layout.slots.find((s) => s.id === selectedSlot);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft className="w-3.5 h-3.5" /> Danh sách mẫu
        </Button>
        <div className="flex gap-1.5 flex-wrap">
          {row?.status === "published" && !isLegacy(row) && (
            <Button variant="secondary" onClick={() => onDispatch?.(row.id)} disabled={saving}>
              <Send className="w-3.5 h-3.5" /> Phát hành
            </Button>
          )}
          {row?.status === "published" && (
            <Button variant="danger" onClick={() => save("archived")} disabled={saving}>Lưu trữ</Button>
          )}
          <Button variant="secondary" onClick={() => save("draft")} disabled={saving || row?.status === "published"} title={row?.status === "published" ? "Mẫu đã xuất bản - lưu thay đổi bằng nút Xuất bản" : undefined}>
            Lưu nháp
          </Button>
          <Button onClick={() => save("published")} disabled={saving}>
            {row?.status === "published" ? `Xuất bản v${(row.version || 1) + 1}` : "Xuất bản"}
          </Button>
        </div>
      </div>

      {row && isLegacy(row) && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-[10.5px] text-orange-800">
          Mẫu cũ (Giai đoạn 1) đã được chuyển sang trình soạn mới. Kiểm tra lại nội dung và khai báo biến trước khi xuất bản.
        </div>
      )}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-[10.5px] text-orange-800 space-y-0.5">
          {validation.errors.map((e) => (
            <p key={e}>⛔ {e}</p>
          ))}
          {validation.warnings.map((w) => (
            <p key={w}>⚠️ {w}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        <aside className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-2 lg:max-h-[75vh] lg:overflow-y-auto order-2 lg:order-1">
          <p className="text-[11px] font-bold text-gray-800 mb-2 px-1">Biến động</p>
          <VariablesPanel variables={form.variables} onChange={(variables) => set({ variables })} onInsert={insertVariable} />
        </aside>

        <main className="lg:col-span-6 space-y-2 order-1 lg:order-2">
          <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tên mẫu">
                <TextInput value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Thông báo điều chỉnh phí" />
              </Field>
              <Field label="Danh mục">
                <TextInput list="esign-categories" value={form.category} onChange={(e) => set({ category: e.target.value })} />
                <datalist id="esign-categories">
                  {CATEGORY_SUGGESTIONS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Field label="Tiêu đề văn bản" hint="Có thể chèn biến, vd {{notice_subject}}. Bấm vào ô rồi chọn biến bên trái.">
              <TextInput ref={titleRef} value={form.title_template} onFocus={() => setLastFocus("title")} onChange={(e) => set({ title_template: e.target.value })} placeholder="THÔNG BÁO V/v …" />
            </Field>
          </div>

          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1 w-fit">
            {[
              ["compose", "Soạn"],
              ["print", "Xem trước bản in"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`px-3 py-1 rounded-md text-[11px] font-semibold ${mode === id ? "bg-[#948154] text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={mode === "compose" ? "" : "hidden"} onFocusCapture={() => setLastFocus("body")}>
            <QuillBodyEditor
              ref={editorRef}
              docKey={row?.id || "new"}
              initialDelta={form.body_delta}
              onChange={(body_delta) => set({ body_delta })}
              variables={insertableVariables}
            />
            <p className="text-[10px] text-gray-400 mt-1">Gõ {"{{"} để chèn biến. Header, Quốc hiệu, Footer và khung ký lấy từ Khung văn bản - xem ở chế độ "Xem trước bản in".</p>
          </div>

          {mode === "print" && (
            <div className="space-y-2">
              <RecipientPicker value={recipient} onChange={setRecipient} />
              {preview ? (
                <LetterheadRenderer
                  layout={preview.layout}
                  renderPageOverlay={(page) => (
                    <>
                      <SlotDragOverlay page={page} slots={form.layout.slots} selectedId={selectedSlot} onSelect={setSelectedSlot} onChangeBox={updateSlotBox} colW={colW} />
                      <FieldDragOverlay page={page} fields={fields} selectedId={selectedField} onSelect={setSelectedField} onChangeField={updateField} />
                    </>
                  )}
                />
              ) : (
                <div className="aspect-[210/297] rounded-lg bg-white border border-gray-200 animate-pulse" />
              )}
              <p className="text-[10px] text-gray-400">Kéo khung ký / trường để đổi vị trí, kéo góc dưới-phải để đổi kích thước. Giá trị biến tuỳ chỉnh đang là dữ liệu mẫu.</p>
            </div>
          )}
        </main>

        <aside className="lg:col-span-3 space-y-3 order-3">
          <Section title="Mẫu">
            <Field label="Khung văn bản">
              <select
                value={form.letterhead_id || ""}
                onChange={(e) => set({ letterhead_id: e.target.value || null })}
                className="w-full h-9 px-2.5 rounded-lg border border-gray-300 text-[12px]"
              >
                <option value="">Khung mặc định</option>
                {publishedLetterheads.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </Field>
            <Toggle checked={form.requires_signature} onChange={(v) => set({ requires_signature: v })} label="Yêu cầu người nhận ký" />
            <Toggle
              checked={form.layout.illustrative_label !== false}
              onChange={(v) => set({ layout: { ...form.layout, illustrative_label: v } })}
              label='Ghi "Chữ ký minh hoạ"'
            />
            <Field label="Lưu trữ PDF">
              <RetentionSelect value={form.retention_days} onChange={(retention_days) => set({ retention_days })} inheritLabel="Theo mặc định trong Cài đặt" />
            </Field>
          </Section>
          <Section
            title="Khung ký"
            actions={
              <div className="flex gap-1">
                <Button variant="ghost" className="h-7 px-2 text-[10.5px]" onClick={swapSides}>Đổi bên</Button>
                <Button variant="ghost" className="h-7 px-2 text-[10.5px]" onClick={resetSlots}>Mặc định</Button>
              </div>
            }
          >
            <div className="flex gap-1">
              {form.layout.slots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(s.id);
                    setMode("print");
                  }}
                  className={`flex-1 px-2 py-1 rounded-md text-[10.5px] font-semibold border ${selectedSlot === s.id ? "border-[#948154] bg-[#948154]/10 text-[#7d6c45]" : "border-gray-200 text-gray-500"}`}
                >
                  {s.role === "issuer" ? "Bên phát hành" : "Người nhận"}
                </button>
              ))}
            </div>
            <SlotInspector slot={slot} onChange={updateSlot} colW={colW} />
          </Section>
          <Section title="Trường người nhận điền">
            <FieldsPanel
              fields={fields}
              selectedId={selectedField}
              anchoredIds={anchoredIds}
              onSelect={setSelectedField}
              onAdd={addField}
              onChange={updateField}
              onRemove={removeField}
              onInsertAnchor={insertFieldAnchor}
            />
          </Section>
          {preview && (
            <p className="text-[10px] text-gray-400 px-1">
              Bản in hiện tại: {preview.layout.pageCount} trang A4{preview.layout.pageCount > 10 ? " (vượt giới hạn 10 trang)" : ""}.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
