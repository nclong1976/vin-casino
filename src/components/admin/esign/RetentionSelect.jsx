import React from "react";
import { inputClass } from "./ui";

/**
 * Chọn thời gian lưu trữ PDF (spec 4.10). Giá trị: null = theo cấp trên
 * (mẫu → mặc định), 0 = vĩnh viễn, số dương = số ngày.
 */
export const RETENTION_PRESETS = [
  { days: 30, label: "30 ngày" },
  { days: 90, label: "90 ngày" },
  { days: 365, label: "1 năm" },
  { days: 1825, label: "5 năm" },
  { days: 3650, label: "10 năm" },
  { days: 0, label: "Vĩnh viễn" },
];

export function retentionLabel(days) {
  if (days === null || days === undefined) return "Theo mặc định";
  const preset = RETENTION_PRESETS.find((p) => p.days === days);
  return preset ? preset.label : `${days} ngày`;
}

export default function RetentionSelect({ value, onChange, inheritLabel = "Theo mặc định", allowInherit = true }) {
  const isPreset = value === null || value === undefined || RETENTION_PRESETS.some((p) => p.days === value);
  const selectValue = value === null || value === undefined ? "inherit" : isPreset ? String(value) : "custom";

  return (
    <div className="space-y-1.5">
      <select
        className={inputClass}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "inherit") onChange(null);
          else if (v === "custom") onChange(isPreset && value ? value : 180);
          else onChange(Number(v));
        }}
      >
        {allowInherit && <option value="inherit">{inheritLabel}</option>}
        {RETENTION_PRESETS.map((p) => (
          <option key={p.days} value={String(p.days)}>
            {p.label}
          </option>
        ))}
        <option value="custom">Tuỳ chỉnh…</option>
      </select>
      {selectValue === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={value ?? ""}
            onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
          <span className="text-[11px] text-gray-500 shrink-0">ngày</span>
        </div>
      )}
      {typeof value === "number" && value > 0 && value < 365 && (
        <p className="text-[10px] text-orange-600">Ngắn hơn mặc định 1 năm - kiểm tra quy định lưu trữ với loại văn bản này.</p>
      )}
    </div>
  );
}
