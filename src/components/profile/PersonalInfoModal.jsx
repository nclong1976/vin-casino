import React, { useEffect, useState } from "react";
import { X, Phone, User as UserIcon, Fingerprint, Pencil, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";

/** Ẩn toàn bộ giá trị, chỉ để lộ 4 ký tự cuối - vd "0901234567" -> "••••••1234". */
function maskKeepLast4(value) {
  const str = String(value || "").trim();
  if (str.length <= 4) return str;
  return "•".repeat(str.length - 4) + str.slice(-4);
}

export default function PersonalInfoModal({ open, onClose }) {
  const { user } = useAuth();

  const [phone, setPhone] = useState("");
  const [idCardNumber, setIdCardNumber] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    const hasSavedInfo = !!(user.phone && user.id_card_number);
    setPhone(user.phone || "");
    setIdCardNumber(user.id_card_number || "");
    // Lần đầu chưa có dữ liệu -> vào thẳng form nhập, đã có rồi -> hiện bản ẩn trước.
    setEditing(!hasSavedInfo);
  }, [open, user]);

  const handleSave = async (e) => {
    e.preventDefault();
    const cleanPhone = phone.trim();
    const cleanIdCard = idCardNumber.trim().toUpperCase();

    if (!/^\d{8,15}$/.test(cleanPhone)) {
      toast.error("Số điện thoại không hợp lệ (chỉ gồm 8-15 chữ số)");
      return;
    }
    if (cleanIdCard.length < 8 || cleanIdCard.length > 12) {
      toast.error("Số CCCD/Hộ chiếu không hợp lệ (8-12 ký tự)");
      return;
    }

    setSaving(true);
    try {
      await base44.entities.User.update(user.id, {
        phone: cleanPhone,
        id_card_number: cleanIdCard,
      });
      // KHÔNG gọi checkUserAuth() ở đây - đó là hàm re-auth toàn cục (bật
      // isLoadingAuth, tải lại session) chỉ dành cho lúc khởi động app/
      // khôi phục phiên (xem ProtectedRoute.jsx), gọi nó giữa 1 thao tác
      // trong modal đã gây crash toàn app ("useAuth must be used within an
      // AuthProvider") do đụng độ với chu kỳ unmount/remount của
      // AuthenticatedApp. State cục bộ dưới đây đã đủ để modal hiển thị
      // đúng ngay lập tức; lần tải trang kế tiếp sẽ tự lấy đúng từ Postgres
      // qua hydrateUserOnNewDevice().
      toast.success("Đã lưu thông tin cá nhân");
      setPhone(cleanPhone);
      setIdCardNumber(cleanIdCard);
      setEditing(false);
    } catch (err) {
      toast.error("Không thể lưu thông tin, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const fullName = user.full_name || user.name || "Chưa cập nhật";
  const loginId = user.identifier || user.email || "—";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-[14px] font-bold text-black flex items-center gap-1.5">
                <UserIcon className="w-4 h-4 text-[#948154]" /> Thông tin cá nhân
              </h2>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              {/* Họ tên & ID - tự động, không cho sửa */}
              <div>
                <label className="text-[10px] font-medium text-gray-600 block mb-1">Họ và tên</label>
                <div className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-black">
                  {fullName}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-600 block mb-1">ID (Tên đăng nhập)</label>
                <div className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-mono font-semibold text-black">
                  {loginId}
                </div>
              </div>

              {editing ? (
                <form onSubmit={handleSave} className="space-y-3.5">
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 block mb-1">Số điện thoại</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="0901234567"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 block mb-1">Số CCCD/Hộ chiếu</label>
                    <input
                      type="text"
                      value={idCardNumber}
                      onChange={(e) => setIdCardNumber(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                      placeholder="Nhập số CCCD hoặc Hộ chiếu"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
                    />
                  </div>

                  <div className="flex items-start gap-1.5 p-2.5 rounded-xl bg-blue-50 border border-blue-100 text-[10px] text-blue-700 leading-relaxed">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Sau khi lưu, số điện thoại và CCCD/Hộ chiếu sẽ chỉ hiển thị 4 số cuối trên màn hình của bạn để bảo mật.
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-2.5 rounded-xl bg-[#948154] text-white text-[12px] font-bold shadow-md hover:bg-[#837045] active:scale-95 transition-all disabled:opacity-60"
                  >
                    {saving ? "Đang lưu..." : "Lưu"}
                  </button>
                </form>
              ) : (
                <div className="space-y-3.5">
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 block mb-1 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> Số điện thoại
                    </label>
                    <div className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-mono font-semibold text-black tracking-wider">
                      {maskKeepLast4(phone)}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 block mb-1 flex items-center gap-1">
                      <Fingerprint className="w-3 h-3" /> Số CCCD/Hộ chiếu
                    </label>
                    <div className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-mono font-semibold text-black tracking-wider">
                      {maskKeepLast4(idCardNumber)}
                    </div>
                  </div>

                  <button
                    onClick={() => setEditing(true)}
                    className="w-full py-2.5 rounded-xl border border-[#948154] text-[#948154] text-[12px] font-bold flex items-center justify-center gap-1.5 hover:bg-[#948154]/5 active:scale-95 transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Chỉnh sửa thông tin
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
