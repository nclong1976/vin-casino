import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileBadge, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { validateLetterhead } from "@/lib/esignValidation";
import { DEFAULT_THEME, LOGO_SIZE_MM } from "@/shared/docLayout";
import LetterheadRenderer from "@/components/documents/LetterheadRenderer";
import ImageUploadField from "./ImageUploadField";
import { SAMPLE_TEMPLATE, usePublishedPreview } from "./preview";
import { Badge, Button, EmptyState, Field, Section, STATUS_BADGE, TextInput, Toggle } from "./ui";

const EMPTY_LETTERHEAD = {
  name: "",
  header: { logo_url: null, org_name: "", org_sub: "", show_national_motto: true, doc_no_pattern: "VC/{{yyyy}}/{{seq}}", place: "Hà Nội" },
  footer: { lines: [], show_page_number: true, show_hash: true, show_qr: true },
  issuer: { name: "", title: "", seal_url: null, signature_url: null },
  theme: { ...DEFAULT_THEME },
};

const EDITABLE_KEYS = ["name", "header", "footer", "issuer", "theme"];

function pickEditable(row) {
  const out = JSON.parse(JSON.stringify(EMPTY_LETTERHEAD));
  for (const key of EDITABLE_KEYS) {
    if (key === "name") out.name = row?.name || "";
    else out[key] = { ...out[key], ...(row?.[key] || {}) };
  }
  return out;
}

/**
 * Thư viện Khung văn bản (spec 6.1): Header thương hiệu + Quốc hiệu + Footer
 * + người đại diện/con dấu/chữ ký bên phát hành (chèn tự động vào mọi văn
 * bản khi phát hành - quyết định D1).
 */
export default function LetterheadLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { id|null, form }

  const load = () =>
    base44.entities.DocumentLetterhead.list("-created_date", 100)
      .then(setItems)
      .catch(() => toast.error("Không tải được danh sách Khung văn bản"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const unsub = base44.entities.DocumentLetterhead.subscribe(() => load());
    return () => unsub?.();
  }, []);

  if (editing) {
    return (
      <LetterheadEditor
        initial={editing}
        items={items}
        onClose={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  const sorted = [...items].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500">Khung dùng chung cho mọi văn bản: Header, Quốc hiệu, Footer và chữ ký/con dấu bên phát hành.</p>
        <Button onClick={() => setEditing({ id: null, form: pickEditable(null) })}>
          <Plus className="w-3.5 h-3.5" /> Tạo khung
        </Button>
      </div>

      {loading ? (
        <p className="text-[11px] text-gray-400 py-6 text-center">Đang tải…</p>
      ) : sorted.length === 0 ? (
        <EmptyState icon={FileBadge} title="Chưa có Khung văn bản" description="Tạo khung đầu tiên để bắt đầu soạn mẫu." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sorted.map((lh) => {
            const st = STATUS_BADGE[lh.status] || STATUS_BADGE.draft;
            return (
              <button
                key={lh.id}
                type="button"
                onClick={() => setEditing({ id: lh.id, form: pickEditable(lh), row: lh })}
                className="text-left bg-white rounded-xl border border-gray-200 p-3 hover:border-[#948154] transition-colors"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12.5px] font-bold text-gray-900">{lh.name || "(chưa đặt tên)"}</span>
                  {lh.is_default && (
                    <Badge color="gold">
                      <Star className="w-2.5 h-2.5 mr-0.5" /> Mặc định
                    </Badge>
                  )}
                  <Badge color={st.color}>{st.label}</Badge>
                  <span className="text-[9.5px] text-gray-400">v{lh.version || 1}</span>
                </div>
                <p className="text-[10.5px] text-gray-500 mt-1">
                  {lh.header?.org_name || "—"} · Đại diện: {lh.issuer?.name || "—"}
                </p>
                <div className="flex gap-1 mt-2">
                  {[lh.header?.logo_url, lh.issuer?.seal_url, lh.issuer?.signature_url].filter(Boolean).map((src) => (
                    <img key={src} src={src} alt="" className="h-8 w-12 object-contain rounded border border-gray-100" />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LetterheadEditor({ initial, items, onClose }) {
  const { user: adminUser } = useAuth();
  const [form, setForm] = useState(initial.form);
  const [saving, setSaving] = useState(false);
  const row = initial.row;
  const id = initial.id;

  const set = (section, patch) => setForm((f) => ({ ...f, [section]: { ...f[section], ...patch } }));
  const { preview } = usePublishedPreview({ template: SAMPLE_TEMPLATE, letterhead: form });
  const validation = useMemo(() => validateLetterhead(form), [form]);

  const save = async (status) => {
    if (status === "published" && validation.errors.length) {
      toast.error(validation.errors[0]);
      return;
    }
    if (!form.name.trim()) {
      toast.error("Vui lòng đặt tên Khung văn bản");
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        ...form,
        footer: { ...form.footer, lines: (form.footer.lines || []).map((l) => l.trim()).filter(Boolean) },
        status,
        updated_date: now,
      };
      if (id) {
        const bump = status === "published" && row?.status === "published" ? 1 : 0;
        await base44.entities.DocumentLetterhead.update(id, { ...payload, version: (row?.version || 1) + bump });
      } else {
        await base44.entities.DocumentLetterhead.create({
          ...payload,
          is_default: items.length === 0,
          version: 1,
          created_by: adminUser?.email || adminUser?.id || null,
        });
      }
      toast.success(status === "published" ? "Đã xuất bản Khung văn bản" : "Đã lưu nháp");
      onClose();
    } catch (e) {
      toast.error(`Lưu thất bại: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async () => {
    if (!id || row?.status !== "published") {
      toast.error("Chỉ khung đã xuất bản mới đặt làm mặc định được");
      return;
    }
    setSaving(true);
    try {
      // Bỏ mặc định cũ TRƯỚC (unique index chỉ cho phép 1 dòng is_default).
      for (const other of items.filter((x) => x.is_default && x.id !== id)) {
        await base44.entities.DocumentLetterhead.update(other.id, { is_default: false });
      }
      await base44.entities.DocumentLetterhead.update(id, { is_default: true });
      toast.success("Đã đặt làm khung mặc định");
      onClose();
    } catch (e) {
      toast.error(`Không đặt được mặc định: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (row?.is_default) {
      toast.error("Không lưu trữ được khung mặc định - hãy đặt khung khác làm mặc định trước");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.DocumentLetterhead.update(id, { status: "archived", updated_date: new Date().toISOString() });
      toast.success("Đã lưu trữ");
      onClose();
    } catch (e) {
      toast.error(`Lỗi: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft className="w-3.5 h-3.5" /> Danh sách khung
        </Button>
        <div className="flex gap-1.5 flex-wrap">
          {id && !row?.is_default && row?.status === "published" && (
            <Button variant="secondary" onClick={makeDefault} disabled={saving}>
              <Star className="w-3.5 h-3.5" /> Đặt mặc định
            </Button>
          )}
          {id && row?.status !== "archived" && !row?.is_default && (
            <Button variant="danger" onClick={archive} disabled={saving}>Lưu trữ</Button>
          )}
          <Button variant="secondary" onClick={() => save("draft")} disabled={saving || row?.status === "published"} title={row?.status === "published" ? "Khung đã xuất bản - lưu thay đổi bằng nút Xuất bản" : undefined}>
            Lưu nháp
          </Button>
          <Button onClick={() => save("published")} disabled={saving}>
            {row?.status === "published" ? `Xuất bản v${(row?.version || 1) + 1}` : "Xuất bản"}
          </Button>
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-[10.5px] text-orange-800">
          <b>Cần bổ sung trước khi xuất bản:</b> {validation.errors.join(" · ")}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        <div className="space-y-3">
          <Section title="Thông tin chung">
            <Field label="Tên khung">
              <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Khung chuẩn VinClub 2026" />
            </Field>
          </Section>

          <Section title="Header" description="Cột trái: đơn vị phát hành. Cột phải: Quốc hiệu, tiêu ngữ, địa danh + ngày.">
            <ImageUploadField label="Logo (tuỳ chọn)" value={form.header.logo_url} onChange={(url) => set("header", { logo_url: url })} removeBackgroundByDefault={false} />
            {form.header.logo_url && (
              <LogoSizeControl value={form.header.logo_size_mm} onChange={(logo_size_mm) => set("header", { logo_size_mm })} />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tên đơn vị">
                <TextInput value={form.header.org_name} onChange={(e) => set("header", { org_name: e.target.value })} placeholder="VinClub" />
              </Field>
              <Field label="Dòng phụ">
                <TextInput value={form.header.org_sub} onChange={(e) => set("header", { org_sub: e.target.value })} placeholder="Ban điều hành" />
              </Field>
              <Field label="Mẫu số văn bản" hint="{{yyyy}} năm, {{mm}} tháng, {{dd}} ngày, {{seq}} số thứ tự">
                <TextInput value={form.header.doc_no_pattern} onChange={(e) => set("header", { doc_no_pattern: e.target.value })} />
              </Field>
              <Field label="Địa danh">
                <TextInput value={form.header.place} onChange={(e) => set("header", { place: e.target.value })} />
              </Field>
            </div>
            <Toggle checked={form.header.show_national_motto !== false} onChange={(v) => set("header", { show_national_motto: v })} label="Hiện Quốc hiệu - Tiêu ngữ" />
          </Section>

          <Section title="Bên phát hành" description="Chữ ký và con dấu được chèn tự động vào khung ký bên phải khi phát hành.">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Người đại diện">
                <TextInput value={form.issuer.name} onChange={(e) => set("issuer", { name: e.target.value })} placeholder="Họ tên" />
              </Field>
              <Field label="Chức vụ">
                <TextInput value={form.issuer.title} onChange={(e) => set("issuer", { title: e.target.value })} placeholder="Tổng giám đốc" />
              </Field>
            </div>
            <ImageUploadField label="Chữ ký đại diện" hint="Ảnh chữ ký trên nền trắng - hệ thống tự xoá nền." value={form.issuer.signature_url} onChange={(url) => set("issuer", { signature_url: url })} />
            <ImageUploadField label="Con dấu" hint="Nên dùng PNG nền trong suốt." value={form.issuer.seal_url} onChange={(url) => set("issuer", { seal_url: url })} />
          </Section>

          <Section title="Footer">
            <Field label="Các dòng footer" hint="Mỗi dòng một thông tin (hotline, địa chỉ…). Có thể dùng {{doc_no}}.">
              <textarea
                rows={3}
                value={(form.footer.lines || []).join("\n")}
                onChange={(e) => set("footer", { lines: e.target.value.split("\n") })}
                className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-[12px] outline-none focus:border-[#948154]"
              />
            </Field>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Toggle checked={form.footer.show_page_number !== false} onChange={(v) => set("footer", { show_page_number: v })} label="Số trang" />
              <Toggle checked={!!form.footer.show_hash} onChange={(v) => set("footer", { show_hash: v })} label="Mã SHA-256" />
              <Toggle checked={!!form.footer.show_qr} onChange={(v) => set("footer", { show_qr: v })} label="Mã QR kiểm tra" />
            </div>
          </Section>

          <Section title="Trình bày">
            <div className="grid grid-cols-2 gap-2">
              <Field label={`Cỡ chữ thân văn bản: ${form.theme.font_size_pt} pt`}>
                <input type="range" min="11" max="14" step="0.5" value={form.theme.font_size_pt} onChange={(e) => set("theme", { font_size_pt: Number(e.target.value) })} className="w-full accent-[#948154]" />
              </Field>
              <Field label={`Giãn dòng: ${form.theme.line_height}`}>
                <input type="range" min="1.2" max="1.8" step="0.05" value={form.theme.line_height} onChange={(e) => set("theme", { line_height: Number(e.target.value) })} className="w-full accent-[#948154]" />
              </Field>
            </div>
          </Section>
        </div>

        <div className="lg:sticky lg:top-28">
          <p className="text-[10.5px] font-semibold text-gray-500 mb-1">Xem trước (nội dung minh hoạ)</p>
          {preview ? <LetterheadRenderer layout={preview.layout} /> : <div className="aspect-[210/297] rounded-lg bg-white border border-gray-200 animate-pulse" />}
        </div>
      </div>
    </div>
  );
}

const LOGO_PRESETS = [
  ["Nhỏ", 12],
  ["Vừa", 18],
  ["Lớn", 26],
];

/** Cỡ logo: 3 nút chọn nhanh + thanh trượt (chiều cao logo, mm). */
function LogoSizeControl({ value, onChange }) {
  const size = value ?? LOGO_SIZE_MM.legacy;
  return (
    <div className="rounded-lg border border-gray-200 p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold text-gray-600">Cỡ logo: {size} mm</span>
        <div className="flex gap-1">
          {LOGO_PRESETS.map(([label, mm]) => (
            <button
              key={mm}
              type="button"
              onClick={() => onChange(mm)}
              className={`px-2 py-0.5 rounded-md text-[10.5px] border ${size === mm ? "bg-[#948154] text-white border-[#948154]" : "border-gray-300 text-gray-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <input
        type="range"
        min={LOGO_SIZE_MM.min}
        max={LOGO_SIZE_MM.max}
        step="1"
        value={size}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Cỡ logo"
        className="w-full accent-[#948154]"
      />
      <p className="text-[9.5px] text-gray-400">Logo giữ nguyên tỉ lệ; logo ngang được rộng tối đa gấp 3 chiều cao. Văn bản đã gửi không bị đổi.</p>
    </div>
  );
}
