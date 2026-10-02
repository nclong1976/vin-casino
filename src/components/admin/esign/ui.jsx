import React, { forwardRef } from "react";
import { DOC_STATUS, displayStatus } from "@/lib/esignStatus";

/** Các khối giao diện nhỏ dùng chung cho tab "Văn bản" (ký điện tử). */

export function Section({ title, description, children, actions }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
      {(title || actions) && (
        <div className="flex items-start justify-between gap-2">
          <div>
            {title && <h3 className="text-[12.5px] font-bold text-gray-900">{title}</h3>}
            {description && <p className="text-[10.5px] text-gray-500 mt-0.5">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Khối thu gọn cho tuỳ chọn ít dùng - mặc định đóng, hiện tóm tắt bên phải tiêu đề. */
export function Collapsible({ title, summary, defaultOpen = false, children }) {
  return (
    <details open={defaultOpen} className="group bg-white rounded-xl border border-gray-200">
      <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer list-none select-none">
        <span className="text-gray-400 text-[10px] transition-transform group-open:rotate-90">▶</span>
        <span className="text-[12px] font-bold text-gray-800">{title}</span>
        {summary && <span className="ml-auto text-[10.5px] text-gray-500 truncate">{summary}</span>}
      </summary>
      <div className="px-3 pb-3 space-y-3">{children}</div>
    </details>
  );
}

/** Nút chọn dạng "viên thuốc" (segmented control). */
export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex gap-1 bg-gray-100 rounded-lg p-1">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`px-3 py-1 rounded-md text-[11px] font-semibold ${value === k ? "bg-white shadow text-[#7d6c45]" : "text-gray-500"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, error }) {
  return (
    <label className="block">
      <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">{label}</span>
      {children}
      {hint && !error && <span className="block text-[9.5px] text-gray-400 mt-0.5">{hint}</span>}
      {error && <span className="block text-[9.5px] text-red-500 mt-0.5">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full h-9 px-2.5 rounded-lg border border-gray-300 bg-white text-[12px] outline-none focus:border-[#948154] focus:ring-2 focus:ring-[#948154]/15 disabled:bg-gray-50";

export const TextInput = forwardRef(function TextInput(props, ref) {
  return <input ref={ref} {...props} className={`${inputClass} ${props.className || ""}`} />;
});

export function Select({ children, ...props }) {
  return (
    <select {...props} className={`${inputClass} ${props.className || ""}`}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`flex items-center gap-2 text-[11.5px] text-gray-700 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${checked ? "bg-[#948154]" : "bg-gray-300"}`}
      >
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${checked ? "left-[16px]" : "left-[2px]"}`} />
      </button>
      {label}
    </label>
  );
}

export function Button({ variant = "primary", className = "", children, ...props }) {
  const styles = {
    primary: "bg-[#948154] text-white hover:bg-[#7d6c45]",
    secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
    ghost: "text-gray-600 hover:bg-gray-100",
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-[11.5px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

const BADGE_COLORS = {
  gray: "bg-gray-100 text-gray-600",
  green: "bg-green-100 text-green-700",
  orange: "bg-orange-100 text-orange-700",
  blue: "bg-blue-100 text-blue-700",
  red: "bg-red-100 text-red-700",
  gold: "bg-[#948154]/15 text-[#7d6c45]",
};

export function Badge({ color = "gray", children }) {
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold ${BADGE_COLORS[color]}`}>{children}</span>;
}

export const STATUS_BADGE = {
  draft: { label: "Nháp", color: "gray" },
  published: { label: "Đã xuất bản", color: "green" },
  archived: { label: "Đã lưu trữ", color: "orange" },
};

/** Nhãn trạng thái văn bản đã phát hành (Đã gửi/Đã nhận/Đã xem/…). */
export function DocStatusBadge({ doc, status }) {
  const key = status || displayStatus(doc);
  const st = DOC_STATUS[key] || DOC_STATUS.sent;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9.5px] font-semibold whitespace-nowrap ${st.className}`}>
      <span aria-hidden="true">{st.icon}</span>
      {st.label}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-10 px-4 bg-white rounded-xl border border-dashed border-gray-300">
      {Icon && <Icon className="w-8 h-8 mx-auto text-gray-300" />}
      <p className="mt-2 text-[12.5px] font-semibold text-gray-700">{title}</p>
      {description && <p className="text-[11px] text-gray-500 mt-1">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Nền caro để thấy rõ vùng trong suốt của ảnh PNG. */
export const checkerboardStyle = {
  backgroundImage:
    "linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)",
  backgroundSize: "12px 12px",
  backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
};
