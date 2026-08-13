import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Sparkles,
  Globe,
  ExternalLink,
  Loader2,
  X,
  TrendingUp,
  Newspaper,
  Copy,
  Check,
  RefreshCw,
  Info
} from "lucide-react";
import Markdown from "react-markdown";

const SUGGESTIONS = [
  { label: "Cổ phiếu VIC & VHM", query: "Diễn biến cổ phiếu Vingroup VIC và Vinhomes VHM hôm nay" },
  { label: "Giá VinFast (VFS)", query: "Giá cổ phiếu VinFast VFS trên sàn Nasdaq mới nhất" },
  { label: "VN-Index & Thị trường", query: "Tình hình thị trường chứng khoán Việt Nam VN-Index hôm nay" },
  { label: "BĐS Nghỉ dưỡng 2026", query: "Tin tức thị trường bất động sản nghỉ dưỡng Vinpearl mới nhất" },
];

export default function MarketSearchBar({ defaultQuery = "", placeholder = "Tra cứu tin tức thị trường & cổ phiếu (Google Grounding)...", darkTheme = false }) {
  const [query, setQuery] = useState(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSearch = async (searchTerm) => {
    const term = searchTerm || query;
    if (!term.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/market-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: term.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không thể tải dữ liệu tìm kiếm.");
      }

      setResult(data);
    } catch (err) {
      console.error("Search error:", err);
      setError(err.message || "Đã xảy ra lỗi trong quá trình tra cứu.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleCopy = () => {
    if (!result?.text) return;
    navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full space-y-2.5">
      {/* Search Bar Input Container */}
      <div className="relative group">
        <div className={`flex items-center gap-2 rounded-2xl p-1.5 transition-all border shadow-sm ${
          darkTheme 
            ? "bg-[#161b22] border-gray-800 focus-within:border-[#948154]" 
            : "bg-white border-gray-200 focus-within:border-[#948154] focus-within:ring-2 focus-within:ring-[#948154]/20"
        }`}>
          <div className="pl-2.5 flex items-center gap-1.5 text-[#948154] shrink-0">
            <Search className="w-4 h-4" />
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={`w-full text-[11px] bg-transparent focus:outline-none placeholder:text-gray-400 font-medium ${
              darkTheme ? "text-white" : "text-gray-900"
            }`}
          />

          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResult(null);
                setError(null);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"
              title="Xóa"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all shrink-0 ${
              loading || !query.trim()
                ? "bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-[#948154] to-[#c2b080] text-white shadow-md hover:opacity-90 active:scale-95"
            }`}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tra cứu</span>
              </>
            )}
          </button>
        </div>

        {/* Search Grounding Indicator Badge */}
        <div className="flex items-center justify-between px-1.5 mt-1 text-[9px] text-gray-400">
          <span className="flex items-center gap-1">
            <Globe className="w-2.5 h-2.5 text-[#948154]" />
            Powered by <strong className="text-[#948154]">Google Search Grounding</strong>
          </span>
          <span className="text-[8px] italic opacity-80">Cập nhật theo thời gian thực</span>
        </div>
      </div>

      {/* Suggested Quick Search Chips */}
      {!result && !loading && (
        <div className="space-y-1">
          <p className={`text-[9px] font-semibold tracking-wider uppercase px-0.5 ${
            darkTheme ? "text-gray-400" : "text-gray-500"
          }`}>
            Gợi ý tra cứu nhanh:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQuery(item.query);
                  handleSearch(item.query);
                }}
                className={`text-[9.5px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1 ${
                  darkTheme
                    ? "bg-[#1c2128] border-gray-700 text-gray-300 hover:border-[#948154] hover:text-[#948154]"
                    : "bg-white border-gray-200 text-gray-600 hover:border-[#948154] hover:text-[#948154] shadow-2xs"
                }`}
              >
                <TrendingUp className="w-2.5 h-2.5 text-[#948154]" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State Skeleton */}
      {loading && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-2xl border ${
            darkTheme ? "bg-[#161b22] border-gray-800" : "bg-white border-gray-100"
          } shadow-sm space-y-3`}
        >
          <div className="flex items-center gap-2 text-[#948154]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[11px] font-bold">Đang truy vấn Google Search & tổng hợp dữ liệu...</span>
          </div>
          <div className="space-y-1.5 animate-pulse">
            <div className={`h-3.5 rounded-md w-3/4 ${darkTheme ? "bg-gray-800" : "bg-gray-200"}`} />
            <div className={`h-3 rounded-md w-full ${darkTheme ? "bg-gray-800/60" : "bg-gray-100"}`} />
            <div className={`h-3 rounded-md w-5/6 ${darkTheme ? "bg-gray-800/60" : "bg-gray-100"}`} />
            <div className={`h-3 rounded-md w-2/3 ${darkTheme ? "bg-gray-800/60" : "bg-gray-100"}`} />
          </div>
        </motion.div>
      )}

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10.5px] flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-1.5">
            <Info className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => handleSearch()}
            className="px-2 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-300 font-semibold text-[9.5px]"
          >
            Thử lại
          </button>
        </motion.div>
      )}

      {/* Search Result Display */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={`p-3.5 rounded-2xl border ${
              darkTheme ? "bg-[#161b22] border-gray-800 text-gray-200" : "bg-white border-gray-100 text-gray-800"
            } shadow-md space-y-3`}
          >
            {/* Header Result Controls */}
            <div className="flex items-center justify-between border-b pb-2 border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-1.5 text-[#948154]">
                <Newspaper className="w-4 h-4" />
                <span className="text-[11px] font-bold">Kết quả tra cứu thực tế</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  title="Sao chép kết quả"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleSearch()}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  title="Làm mới"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setResult(null)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  title="Đóng kết quả"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Markdown Content */}
            <div className="text-[11px] leading-relaxed space-y-2 markdown-body overflow-x-auto">
              <Markdown>{result.text}</Markdown>
            </div>

            {/* Google Search Queries */}
            {result.searchQueries && result.searchQueries.length > 0 && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800/60">
                <p className="text-[8.5px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Từ khóa Google Search:
                </p>
                <div className="flex flex-wrap gap-1">
                  {result.searchQueries.map((q, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    >
                      "{q}"
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Grounding Sources (Google Search Links) */}
            {result.sources && result.sources.length > 0 && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-1 text-[9px] font-semibold text-[#948154] uppercase tracking-wider mb-1.5">
                  <Globe className="w-3 h-3" />
                  <span>Nguồn thông tin xác thực từ Google:</span>
                </div>
                <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
                  {result.sources.map((src, idx) => (
                    <a
                      key={idx}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between text-[10px] p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-[#948154]/10 transition-colors text-gray-700 dark:text-gray-300 group"
                    >
                      <span className="truncate pr-2 font-medium group-hover:text-[#948154]">
                        {src.title || src.uri}
                      </span>
                      <ExternalLink className="w-3 h-3 shrink-0 text-gray-400 group-hover:text-[#948154]" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
