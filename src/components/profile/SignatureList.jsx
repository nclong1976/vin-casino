import React from "react";

export default function SignatureList({ sigs, loading }) {
  if (loading)
    return (
      <div className="text-center py-4 text-[11px] text-gray-400">Đang tải...</div>
    );
  if (sigs.length === 0)
    return (
      <div className="bg-white rounded-xl p-4 text-center text-[11px] text-gray-400 shadow-sm">
        Chưa có chữ ký nào
      </div>
    );

  return (
    <div className="space-y-2">
      {sigs.map((s) => (
        <div
          key={s.id}
          className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3"
        >
          <div className="w-20 h-12 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
            {s.type === "draw" ? (
              <img
                src={s.content}
                alt=""
                className="w-full h-full object-contain"
              />
            ) : (
              <span
                style={{ fontFamily: "'Great Vibes', cursive" }}
                className="text-[16px] text-[#16100b] truncate px-1"
              >
                {s.content}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-black">
              {s.type === "draw" ? "Chữ ký vẽ tay" : "Chữ ký gõ tên"}
            </p>
            <p className="text-[9px] text-gray-400">
              {new Date(s.created_date).toLocaleDateString("vi-VN")}
            </p>
          </div>
          <span className="text-[8px] font-medium px-2 py-0.5 rounded-full bg-[#948154]/10 text-[#948154] shrink-0">
            {s.type === "draw" ? "VẼ" : "GÕ"}
          </span>
        </div>
      ))}
    </div>
  );
}