import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { normalizeVariableKey } from "@/shared/docLayout";
import { Button, Select, TextInput, inputClass } from "./ui";

/** Biến hệ thống luôn có sẵn (spec 5.1) - chỉ dùng được, không sửa. */
export const SYSTEM_VARIABLES = [
  { key: "user_name", label: "Họ tên người nhận" },
  { key: "user_email", label: "Email" },
  { key: "user_phone", label: "Số điện thoại" },
  { key: "user_identifier", label: "Mã hội viên" },
  { key: "id_card_number", label: "Số CCCD (che bớt)" },
  { key: "membership_tier", label: "Hạng thành viên" },
  { key: "vip_level", label: "Cấp VIP" },
  { key: "date", label: "Ngày phát hành" },
  { key: "date_long", label: "Ngày phát hành (đầy đủ)" },
  { key: "doc_no", label: "Số văn bản" },
  { key: "due_date", label: "Hạn ký" },
  { key: "issuer_name", label: "Người đại diện" },
  { key: "issuer_title", label: "Chức vụ đại diện" },
];

export const VARIABLE_TYPES = [
  { value: "text", label: "Chữ 1 dòng" },
  { value: "richtext", label: "Văn bản nhiều dòng" },
  { value: "date", label: "Ngày" },
  { value: "money", label: "Số tiền" },
  { value: "number", label: "Số" },
];

export const VARIABLE_SCOPES = [
  { value: "campaign", label: "Nhập 1 lần cho cả đợt" },
  { value: "recipient", label: "Riêng từng người nhận" },
];

function Chip({ v, onInsert }) {
  return (
    <button
      type="button"
      // Không lấy focus: giữ nguyên con trỏ trong ô đang soạn (tiêu đề/nội dung).
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onInsert(v.key)}
      title={`Chèn {{${v.key}}}`}
      className="w-full text-left px-2 py-1 rounded-md hover:bg-[#948154]/10 group"
    >
      <span className="text-[11px] text-gray-800 group-hover:text-[#7d6c45]">{v.label || v.key}</span>
      <span className="block text-[9.5px] font-mono text-gray-400">{`{{${v.key}}}`}</span>
    </button>
  );
}

/** Cột trái của trình soạn mẫu: biến hệ thống + biến tuỳ chỉnh (thêm/sửa/xoá). */
export default function VariablesPanel({ variables, onChange, onInsert }) {
  const [draft, setDraft] = useState({ key: "", label: "", type: "text", scope: "campaign", required: true });

  const update = (i, patch) => onChange(variables.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const remove = (i) => onChange(variables.filter((_, idx) => idx !== i));
  const add = () => {
    const key = normalizeVariableKey(draft.key || draft.label);
    if (!key) return;
    onChange([...variables, { ...draft, key, label: draft.label || key }]);
    setDraft({ key: "", label: "", type: "text", scope: "campaign", required: true });
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Hệ thống</p>
        <div className="space-y-0.5">
          {SYSTEM_VARIABLES.map((v) => (
            <Chip key={v.key} v={v} onInsert={onInsert} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Tuỳ chỉnh</p>
        <div className="space-y-2">
          {variables.map((v, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-2 space-y-1.5">
              <div className="flex items-center gap-1">
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(normalizeVariableKey(v.key))} className="flex-1 text-left" title="Chèn vào nội dung">
                  <span className="text-[11px] font-semibold text-gray-800">{v.label || v.key}</span>
                  <span className="block text-[9.5px] font-mono text-gray-400">{`{{${normalizeVariableKey(v.key)}}}`}</span>
                </button>
                <button type="button" onClick={() => remove(i)} className="p-1 text-gray-400 hover:text-red-500" aria-label={`Xoá biến ${v.key}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <TextInput value={v.label || ""} onChange={(e) => update(i, { label: e.target.value })} placeholder="Nhãn hiển thị" className="h-8" />
              <Select value={v.type || "text"} onChange={(e) => update(i, { type: e.target.value })} className="h-8">
                {VARIABLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
              <Select value={v.scope || "campaign"} onChange={(e) => update(i, { scope: e.target.value })} className="h-8">
                {VARIABLE_SCOPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
              <label className="flex items-center gap-1.5 text-[10.5px] text-gray-600">
                <input type="checkbox" checked={!!v.required} onChange={(e) => update(i, { required: e.target.checked })} /> Bắt buộc nhập
              </label>
            </div>
          ))}

          <div className="rounded-lg border border-dashed border-gray-300 p-2 space-y-1.5">
            <input className={`${inputClass} h-8`} value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Nhãn, vd: Nội dung thông báo" />
            <input
              className={`${inputClass} h-8 font-mono`}
              value={draft.key}
              onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
              placeholder={`Mã: ${normalizeVariableKey(draft.label) || "notice_content"}`}
            />
            <Select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))} className="h-8">
              {VARIABLE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
            <Button variant="secondary" className="w-full h-8" onClick={add} disabled={!normalizeVariableKey(draft.key || draft.label)}>
              <Plus className="w-3.5 h-3.5" /> Thêm biến
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
