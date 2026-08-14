import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { PenTool, Type, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import SignatureHeader from "@/components/signature/SignatureHeader";
import SignaturePad from "@/components/signature/SignaturePad";
import BottomNav from "@/components/BottomNav";

export default function Signature() {
  const [mode, setMode] = useState("draw");
  const [typedName, setTypedName] = useState("");
  const [label, setLabel] = useState("");
  const [drawData, setDrawData] = useState(null);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const padRef = useRef(null);

  const load = async (userId) => {
    try {
      const list = userId
        ? await base44.entities.Signature.filter({ user_id: userId }, "-created_date", 50)
        : await base44.entities.Signature.list("-created_date", 50);
      setSaved(list);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    base44.auth.me().then((me) => {
      setUser(me);
      load(me?.id);
    }).catch(() => load());
  }, []);

  const canSave = mode === "draw" ? !!drawData : typedName.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) {
      toast.error(mode === "draw" ? "Vui lòng ký trước khi lưu" : "Vui lòng nhập họ tên");
      return;
    }
    setSaving(true);
    try {
      const content = mode === "draw" ? drawData : typedName.trim();
      await base44.entities.Signature.create({
        type: mode,
        content,
        label: label.trim() || (mode === "draw" ? "Chữ ký vẽ tay" : typedName.trim()),
        user_id: user?.id,
      });
      toast.success("Đã lưu chữ ký");
      setLabel("");
      setTypedName("");
      setDrawData(null);
      padRef.current?.clear();
      load(user?.id);
    } catch (e) {
      toast.error("Không thể lưu chữ ký");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.Signature.delete(id);
      setSaved((s) => s.filter((x) => x.id !== id));
      toast.success("Đã xóa chữ ký");
    } catch (e) {
      toast.error("Không thể xóa");
    }
  };

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <SignatureHeader />

      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Mode toggle */}
        <div className="flex p-1 bg-gray-200/60 rounded-xl">
          <button
            onClick={() => setMode("draw")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium transition ${
              mode === "draw" ? "bg-white text-[#948154] shadow" : "text-gray-500"
            }`}
          >
            <PenTool className="w-4 h-4" /> Vẽ tay
          </button>
          <button
            onClick={() => setMode("typed")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium transition ${
              mode === "typed" ? "bg-white text-[#948154] shadow" : "text-gray-500"
            }`}
          >
            <Type className="w-4 h-4" /> Gõ tên
          </button>
        </div>

        {/* Signature card */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          {mode === "draw" ? (
            <SignaturePad ref={padRef} onChange={setDrawData} />
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-gray-700">Họ và tên</label>
                <input
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="mt-1 w-full h-11 px-3 rounded-lg border border-gray-300 focus:border-[#948154] outline-none text-[13px]"
                />
              </div>
              <div className="h-28 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50/50 overflow-hidden">
                {typedName.trim() ? (
                  <span
                    style={{ fontFamily: "'Great Vibes', cursive" }}
                    className="text-[34px] text-[#16100b] leading-none"
                  >
                    {typedName}
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-400">Xem trước chữ ký tại đây</span>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-gray-700">Nhãn (tùy chọn)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="VD: Chữ ký giao dịch"
              className="mt-1 w-full h-11 px-3 rounded-lg border border-gray-300 focus:border-[#948154] outline-none text-[13px]"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[13px] font-semibold flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" /> {saving ? "Đang lưu..." : "Lưu chữ ký"}
          </button>
        </div>

        {/* Saved signatures */}
        <div>
          <h2 className="text-[13px] font-bold text-black mb-2">Chữ ký đã lưu</h2>
          {loading ? (
            <div className="text-center py-6 text-[11px] text-gray-400">Đang tải...</div>
          ) : saved.length === 0 ? (
            <div className="text-center py-6 text-[11px] text-gray-400">Chưa có chữ ký nào</div>
          ) : (
            <div className="space-y-2">
              {saved.map((s) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm"
                >
                  <div className="w-20 h-14 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                    {s.type === "draw" ? (
                      <img src={s.content} alt={s.label} className="w-full h-full object-contain" />
                    ) : (
                      <span
                        style={{ fontFamily: "'Great Vibes', cursive" }}
                        className="text-[20px] text-[#16100b] truncate px-1"
                      >
                        {s.content}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-black truncate">{s.label}</p>
                    <p className="text-[10px] text-gray-400">
                      {s.type === "draw" ? "Vẽ tay" : "Gõ tên"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-2 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}