import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import SignaturePad from "@/components/signature/SignaturePad";

export default function SignaturePicker({ value, onChange }) {
  const [tab, setTab] = useState("draw");
  const [saved, setSaved] = useState([]);
  const padRef = useRef(null);

  useEffect(() => {
    base44.entities.Signature.list("-created_date", 12).then(setSaved).catch(() => []);
  }, []);

  const tabs = [
    { id: "draw", label: "Vẽ" },
    { id: "typed", label: "Gõ tên" },
    { id: "saved", label: "Đã lưu" },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-2 bg-gray-100 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${
              tab === t.id ? "bg-white text-[#948154] shadow-sm" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "draw" && (
        <SignaturePad
          ref={padRef}
          onChange={(data) => onChange(data ? { type: "draw", content: data } : null)}
        />
      )}

      {tab === "typed" && (
        <div>
          <input
            value={value?.type === "typed" ? value.content : ""}
            onChange={(e) => onChange({ type: "typed", content: e.target.value })}
            placeholder="Nhập họ tên của bạn"
            className="w-full h-10 px-3 rounded-lg border border-gray-300 outline-none text-[12px] focus:border-[#948154]"
          />
          {value?.type === "typed" && value.content && (
            <div className="mt-2 h-16 rounded-lg border border-dashed border-gray-300 flex items-center justify-center bg-white">
              <span
                style={{ fontFamily: "'Great Vibes', cursive" }}
                className="text-[22px] text-[#16100b]"
              >
                {value.content}
              </span>
            </div>
          )}
        </div>
      )}

      {tab === "saved" && (
        <div>
          {saved.length === 0 ? (
            <p className="text-[10px] text-gray-400 text-center py-4">
              Chưa có chữ ký đã lưu nào.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {saved.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onChange({ type: s.type, content: s.content })}
                  className={`h-14 rounded-lg border bg-white flex items-center justify-center overflow-hidden ${
                    value?.content === s.content
                      ? "border-[#948154] ring-1 ring-[#948154]"
                      : "border-gray-200"
                  }`}
                >
                  {s.type === "draw" ? (
                    <img src={s.content} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span
                      style={{ fontFamily: "'Great Vibes', cursive" }}
                      className="text-[14px] text-[#16100b] truncate px-1"
                    >
                      {s.content}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}