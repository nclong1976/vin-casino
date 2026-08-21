import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[AppErrorBoundary] Uncaught render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 bg-[#0c0a09] flex flex-col items-center justify-center gap-4 z-[99999] px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[15px] font-bold text-white">Đã xảy ra lỗi ngoài dự kiến</p>
            <p className="text-[12px] text-gray-400 max-w-xs">
              VinClub đã ghi nhận sự cố này. Vui lòng tải lại trang để tiếp tục sử dụng - dữ liệu tài khoản của bạn không bị ảnh hưởng.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#948154] hover:bg-[#837045] text-white text-[12px] font-bold transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Tải lại trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
