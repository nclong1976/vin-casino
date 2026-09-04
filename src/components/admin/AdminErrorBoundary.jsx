import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default class AdminErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[AdminErrorBoundary]", error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-white rounded-2xl p-8 border border-red-200 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-[13px] font-bold text-gray-700">Đã xảy ra lỗi khi hiển thị mục này</p>
          <p className="text-[11px] text-gray-400">Dữ liệu ở các mục khác vẫn an toàn. Vui lòng thử lại.</p>
          {this.state.error?.message && (
            <p className="text-[10px] text-red-400 font-mono bg-red-50 rounded-lg px-2 py-1.5 break-all text-left">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#948154] text-white text-[11px] font-bold hover:bg-[#7d6c47] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
