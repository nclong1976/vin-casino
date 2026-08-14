import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Calendar, Eye, Share2, Tag, ChevronLeft, Bookmark, ThumbsUp, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function NewsDetailModal({ article, onClose, onSelectArticle }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(128);
  const [saved, setSaved] = useState(false);

  if (!article) return null;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: article.title,
        text: article.excerpt,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Đã sao chép liên kết bài viết!");
    }
  };

  const toggleLike = () => {
    setLiked(!liked);
    setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
    toast.success(liked ? "Đã bỏ thích bài viết" : "Đã thích bài viết!");
  };

  const toggleSave = () => {
    setSaved(!saved);
    toast.success(saved ? "Đã bỏ lưu bài viết" : "Đã lưu bài viết vào thư viện!");
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-sm font-heading"
      >
        <motion.div
          initial={{ scale: 0.92, y: 30, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 30, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-[480px] sm:max-w-[420px] bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col border border-amber-900/10"
        >
          {/* Top Floating Action Bar */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSave}
                className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition cursor-pointer ${
                  saved ? "bg-amber-500 text-white" : "bg-black/40 text-white hover:bg-black/60"
                }`}
              >
                <Bookmark className="w-4 h-4" />
              </button>
              <button
                onClick={handleShare}
                className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Banner Hero Image */}
          <div className="relative h-[190px] sm:h-[220px] overflow-hidden shrink-0">
            <img src={article.image} alt={article.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 text-white">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#948154] text-white text-[9px] font-bold tracking-wider uppercase mb-1.5 shadow">
                {article.category}
              </span>
              <h1 className="text-[15px] sm:text-[17px] font-bold leading-snug line-clamp-2 text-amber-50 drop-shadow">
                {article.title}
              </h1>
            </div>
          </div>

          {/* Scrollable Article Body */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-gray-800 text-[12px] leading-relaxed">
            {/* Metadata Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-100 text-[10.5px] text-gray-500 font-medium">
              <div className="flex items-center gap-2">
                <span className="font-bold text-black">{article.author || "VinClub"}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#948154]" />
                  {article.date || "12/08/2026"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {article.time}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {article.views || "1.2k"} lượt xem
                </span>
              </div>
            </div>

            {/* Excerpt Lead */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-l-4 border-[#948154]">
              <p className="text-[12.5px] font-semibold text-amber-950 leading-relaxed italic">
                "{article.excerpt}"
              </p>
            </div>

            {/* Main Sections */}
            {article.sections && article.sections.length > 0 ? (
              article.sections.map((sec, idx) => {
                if (sec.type === "paragraph") {
                  return (
                    <p key={idx} className="text-gray-700 leading-relaxed text-[12px]">
                      {sec.text}
                    </p>
                  );
                }
                if (sec.type === "highlight") {
                  return (
                    <div key={idx} className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 space-y-2">
                      <h4 className="text-[12px] font-bold text-amber-900 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#948154]" />
                        {sec.title}
                      </h4>
                      <ul className="space-y-1.5 text-[11px] text-amber-950">
                        {sec.items?.map((item, itemIdx) => (
                          <li key={itemIdx} className="flex items-start gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#948154] mt-1.5 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }
                if (sec.type === "image") {
                  return (
                    <div key={idx} className="space-y-1 my-2">
                      <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100">
                        <img src={sec.url} alt={sec.caption || "Hình ảnh bài viết"} className="w-full h-auto object-cover max-h-[220px]" />
                      </div>
                      {sec.caption && (
                        <p className="text-[10px] text-gray-400 italic text-center font-medium">
                          {sec.caption}
                        </p>
                      )}
                    </div>
                  );
                }
                if (sec.type === "quote") {
                  return (
                    <blockquote key={idx} className="p-3 rounded-xl bg-gray-50 border-l-2 border-gray-400 text-gray-700 italic text-[11.5px]">
                      "{sec.text}"
                    </blockquote>
                  );
                }
                return null;
              })
            ) : (
              <p className="text-gray-700 leading-relaxed text-[12px]">
                {article.excerpt}
              </p>
            )}

            {/* Tags */}
            {article.tags && article.tags.length > 0 && (
              <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-1.5 items-center">
                <Tag className="w-3.5 h-3.5 text-gray-400" />
                {article.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-md bg-gray-100 text-[10px] font-medium text-gray-600">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Social Engagement Bar */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100 mt-4">
              <button
                onClick={toggleLike}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                  liked ? "bg-amber-500 text-white shadow" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                <span>{likeCount} Hữu ích</span>
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-gray-700 border border-gray-200 text-[11px] font-bold hover:bg-gray-100 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-[#948154]" />
                <span>Chia sẻ</span>
              </button>
            </div>
          </div>

          {/* Footer Action Button */}
          <div className="p-3.5 bg-white border-t border-gray-100 shrink-0 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold text-[12px] hover:bg-gray-50 transition cursor-pointer"
            >
              Đóng bài viết
            </button>
            <button
              onClick={() => {
                onClose();
                toast.info("Đang chuyển hướng đến các cơ hội đầu tư liên quan...");
              }}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#948154] to-[#78663d] text-white font-bold text-[12px] shadow hover:brightness-110 transition cursor-pointer flex items-center justify-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Đầu tư ngay</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
