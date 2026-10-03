import React from "react";

/** Ô nhập nhỏ dùng chung cho các màn cấu hình định giá Vinhomes. */
export function NumInput({ value, onChange, step = "0.01", className = "", ...rest }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={`min-w-0 w-full px-2 py-1 rounded-md border border-gray-200 text-[11px] font-mono text-right focus:outline-none focus:border-[#948154] ${className}`}
      {...rest}
    />
  );
}

export function Labeled({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] text-gray-600">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="text-[9px] text-gray-400">{hint}</span>}
    </label>
  );
}

export function Section({ title, hint, children, right }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11.5px] font-bold text-gray-900">{title}</p>
          {hint && <p className="text-[9.5px] text-gray-500 leading-snug">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Errors({ errors }) {
  if (!errors?.length) return null;
  return (
    <ul className="text-[10.5px] text-red-700 bg-red-50 rounded-lg px-3 py-2 list-disc list-inside space-y-0.5">
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

export function PrimaryButton({ children, busy, ...rest }) {
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={`px-3 py-1.5 rounded-lg bg-[#948154] hover:bg-[#837046] text-white text-[11px] font-bold cursor-pointer disabled:opacity-50 ${rest.className || ""}`}
    >
      {busy ? "Đang lưu..." : children}
    </button>
  );
}
