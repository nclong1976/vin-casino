import React from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { ShieldAlert, ArrowLeft, LogIn } from "lucide-react";

export default function AdminRoute({ children }) {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3 font-heading">
        <div className="w-9 h-9 border-4 border-[#948154] border-t-transparent rounded-full animate-spin" />
        <p className="text-[12px] font-bold text-gray-500">Đang xác thực quyền Quản trị viên...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  let localRole = null;
  try {
    const rawLocal = localStorage.getItem("base44_local_user");
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      localRole = parsed.role;
    }
  } catch (e) {}

  const emailLower = (user?.email || "").toLowerCase();
  const usernameLower = (user?.username || "").toLowerCase();

  const isAdmin = Boolean(
    user?.role === "admin" ||
    user?.role === "ADMIN" ||
    localRole === "admin" ||
    user?.is_super_admin ||
    emailLower.includes("admin") ||
    emailLower === "nclong1976@gmail.com" ||
    emailLower === "leo1102@vinclub.com" ||
    usernameLower === "nclong" ||
    usernameLower === "admin"
  );

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-heading">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 shadow-xl border border-gray-100 text-center space-y-4">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-[16px] font-extrabold text-black">Yêu cầu Quyền Quản trị viên</h2>
            <p className="text-[11.5px] text-gray-500 leading-relaxed">
              Tài khoản hiện tại (<span className="font-semibold text-gray-800">{user?.email || "Khách"}</span>) chưa được cấp quyền truy cập Bảng quản trị.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              to="/login"
              className="w-full py-3 rounded-2xl bg-[#948154] hover:bg-[#837045] text-white text-[12px] font-bold shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <LogIn className="w-4 h-4" /> Đăng nhập bằng tài khoản Quản trị
            </Link>
            <Link
              to="/"
              className="w-full py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" /> Quay lại Trang chủ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
