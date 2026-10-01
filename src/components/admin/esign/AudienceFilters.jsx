import React, { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { toast } from "sonner";
import { previewGroup } from "@/lib/esignApi";
import { Field, TextInput, Toggle } from "./ui";
import { EMPTY_FILTERS, cleanFilters, fmtMoney } from "@/lib/audienceFilters";

export { EMPTY_FILTERS, cleanFilters, describeFilters } from "@/lib/audienceFilters";



/** Nhóm chip có tiêu đề - không dùng <label> vì sẽ "bấm hộ" nút đầu tiên. */
function ChipGroup({ label, ...props }) {
  return (
    <div role="group" aria-label={label}>
      <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">{label}</span>
      <Chips {...props} />
    </div>
  );
}

function Chips({ options, selected = [], onToggle, empty }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const value = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        const on = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className={`px-2 py-1 rounded-full text-[10.5px] border ${on ? "bg-[#948154] text-white border-[#948154]" : "border-gray-300 text-gray-600"}`}
          >
            {label}
          </button>
        );
      })}
      {options.length === 0 && <span className="text-[10.5px] text-gray-400">{empty}</span>}
    </div>
  );
}

/**
 * Bộ lọc người nhận (spec hợp đồng mục 2.4 "Lọc hàng loạt") - dùng cho nhóm
 * động và bước Người nhận khi phát hành. Lọc thật chạy ở server
 * (esign_user_matches_filters); đây chỉ hiển thị + xem trước 20 người.
 */
export default function AudienceFilters({ filters, onChange, tiers = [], vips = [], projects = [], onPreview }) {
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  const [preview, setPreview] = useState(null);
  const set = (patch) => onChange({ ...f, ...patch });
  const toggleIn = (key, value) => {
    const list = f[key] || [];
    set({ [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] });
  };

  const key = JSON.stringify(f);
  useEffect(() => {
    setPreview(null);
    const t = setTimeout(() => {
      previewGroup(cleanFilters(f))
        .then((p) => {
          setPreview(p);
          onPreview?.(p);
        })
        .catch((e) => toast.error(`Không xem trước được: ${e.message}`));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="space-y-3">
      <ChipGroup label="Hạng thành viên (bỏ trống = tất cả)" options={tiers} selected={f.membership_tier} onToggle={(v) => toggleIn("membership_tier", v)} empty="Chưa có dữ liệu hạng" />
      <ChipGroup label="Cấp VIP (bỏ trống = tất cả)" options={vips} selected={f.vip_level} onToggle={(v) => toggleIn("vip_level", v)} empty="Chưa có dữ liệu VIP" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tham gia từ ngày">
          <TextInput type="date" value={f.created_from || ""} onChange={(e) => set({ created_from: e.target.value })} />
        </Field>
        <Field label="Đến ngày">
          <TextInput type="date" value={f.created_to || ""} onChange={(e) => set({ created_to: e.target.value })} />
        </Field>
      </div>
      <Field label="Tổng đã nạp tối thiểu (VNĐ)" hint="Tổng nạp = tiền quản trị viên cộng trực tiếp và phê duyệt.">
        <TextInput
          inputMode="numeric"
          value={fmtMoney(f.min_total_deposited)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            set({ min_total_deposited: digits ? Number(digits) : "" });
          }}
          placeholder="Không giới hạn"
        />
      </Field>
      <ChipGroup
        label="Đang đầu tư dự án (bỏ trống = không lọc)"
        options={projects.map((p) => ({ value: p.id, label: p.title || p.name || p.id }))}
        selected={f.project_ids}
        onToggle={(v) => toggleIn("project_ids", v)}
        empty="Chưa có dự án"
      />
      <Toggle checked={!!f.active_investment} onChange={(v) => set({ active_investment: v })} label="Chỉ tính khoản đầu tư chưa tất toán" />
      <Toggle checked={f.exclude_locked !== false} onChange={(v) => set({ exclude_locked: v })} label="Bỏ tài khoản bị khoá" />
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-2">
        <p className="text-[11.5px] font-semibold text-gray-800">
          <Filter className="w-3.5 h-3.5 inline mr-1" />
          Khớp {preview ? preview.count : "…"} người
          {preview?.sample?.length ? <span className="font-normal text-gray-500"> · {Math.min(preview.sample.length, 20)} người đầu</span> : null}
        </p>
        <ul className="mt-1 text-[10.5px] text-gray-600 space-y-0.5 max-h-48 overflow-y-auto">
          {(preview?.sample || []).map((u) => (
            <li key={u.id}>
              {u.full_name || "—"}{" "}
              <span className="text-gray-400">
                · {u.email} · {u.membership_tier || "—"} · nạp {fmtMoney(u.total_deposited || 0)} đ
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
