import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdminUser } from "@/lib/isAdminUser";
import { ADMIN_PERMISSION_LABELS, ALL_ADMIN_PERMISSIONS } from "@/lib/adminPermissions";

/**
 * Quản lý phân quyền từng tài khoản admin (RBAC). CHỈ super admin/chủ sở hữu
 * mới thấy và sửa được (Postgres cũng chặn: protect_privileged_user_fields chỉ
 * cho super admin đổi cột admin_permissions). Bật/tắt từng quyền cho từng admin.
 */
export default function AdminPermissionsManager() {
  const { user: currentAdmin } = useAuth();
  const canManage = isSuperAdminUser(currentAdmin);

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const fetchAdmins = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, role, is_super_admin, admin_permissions")
        .or("role.eq.admin,role.eq.ADMIN,is_super_admin.eq.true")
        .order("full_name", { ascending: true });
      if (error) throw error;
      setAdmins(data || []);
    } catch (err) {
      console.error("Error fetching admins:", err);
      toast.error("Không thể tải danh sách admin");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const togglePermission = async (admin, key) => {
    if (savingId) return;
    const current = Array.isArray(admin.admin_permissions) ? admin.admin_permissions : [];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];

    setSavingId(admin.id);
    try {
      const { error } = await supabase
        .from("users")
        .update({ admin_permissions: next })
        .eq("id", admin.id);
      if (error) throw error;
      setAdmins((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, admin_permissions: next } : a))
      );
      toast.success("Đã cập nhật quyền");
    } catch (err) {
      console.error("Error updating permissions:", err);
      toast.error("Không thể cập nhật quyền (chỉ chủ sở hữu mới sửa được)");
    } finally {
      setSavingId(null);
    }
  };

  if (!canManage) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-[#948154]" />
        <h3 className="font-bold text-gray-900">Phân quyền admin</h3>
      </div>
      <p className="text-[11px] text-gray-500 mb-4">
        Bật/tắt từng quyền cho mỗi tài khoản admin. Super admin có toàn quyền và
        không thể chỉnh. Thay đổi có hiệu lực ở lần tải lại Bảng quản trị kế tiếp
        của admin đó.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang tải...
        </div>
      ) : admins.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">Chưa có tài khoản admin nào</div>
      ) : (
        <div className="space-y-4">
          {admins.map((admin) => {
            const isSuper = !!admin.is_super_admin;
            const perms = Array.isArray(admin.admin_permissions) ? admin.admin_permissions : [];
            return (
              <div key={admin.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm text-gray-900">
                      {admin.full_name || admin.email || admin.id}
                    </div>
                    <div className="text-[10.5px] text-gray-500">{admin.email}</div>
                  </div>
                  {isSuper && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      Super admin · Toàn quyền
                    </span>
                  )}
                </div>

                {!isSuper && (
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_ADMIN_PERMISSIONS.map((key) => {
                      const on = perms.includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() => togglePermission(admin, key)}
                          disabled={savingId === admin.id}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition flex items-center gap-1 disabled:opacity-50 ${
                            on
                              ? "bg-[#948154] text-white border-[#948154]"
                              : "bg-white text-gray-600 border-gray-300 hover:border-[#948154]"
                          }`}
                        >
                          {on && <Check className="w-3 h-3" />}
                          {ADMIN_PERMISSION_LABELS[key]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
