import React, { useEffect, useRef, useState } from "react";
import { UsersRound, Check } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { addGroupMembers } from "@/lib/esignApi";

/** Nút nhỏ trong danh sách hội viên: thêm người này vào một nhóm tĩnh. */
export default function AddToGroupButton({ userId, addedBy }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState(null);
  const [done, setDone] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    if (!groups) {
      base44.entities.UserGroup.filter({ kind: "static" }, "-created_date", 200)
        .then(setGroups)
        .catch(() => setGroups([]));
    }
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, groups]);

  const add = async (g) => {
    try {
      await addGroupMembers(g.id, [userId], addedBy);
      setDone((d) => [...d, g.id]);
      toast.success(`Đã thêm vào nhóm "${g.name}"`);
    } catch (e) {
      toast.error(`Không thêm được: ${e.message}`);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-xl bg-violet-50 hover:bg-violet-600 hover:text-white text-violet-700 border border-violet-200 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
        title="Thêm vào nhóm người dùng"
        aria-expanded={open}
      >
        <UsersRound className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 max-h-64 overflow-y-auto">
          <p className="px-3 py-1 text-[10px] font-bold uppercase text-gray-400">Thêm vào nhóm tĩnh</p>
          {groups === null && <p className="px-3 py-2 text-[11px] text-gray-400">Đang tải…</p>}
          {groups?.length === 0 && <p className="px-3 py-2 text-[11px] text-gray-400">Chưa có nhóm tĩnh - tạo ở tab Văn bản → Nhóm người dùng.</p>}
          {groups?.map((g) => (
            <button key={g.id} type="button" onClick={() => add(g)} disabled={done.includes(g.id)} className="w-full flex items-center gap-2 text-left px-3 py-1.5 hover:bg-gray-50 text-[11.5px] disabled:opacity-60">
              <span className="w-2 h-2 rounded-full" style={{ background: g.color }} />
              <span className="flex-1 truncate">{g.name}</span>
              {done.includes(g.id) && <Check className="w-3.5 h-3.5 text-green-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
