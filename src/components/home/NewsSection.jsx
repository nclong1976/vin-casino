import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Eye } from "lucide-react";
import NewsDetailModal from "@/components/news/NewsDetailModal";
import { base44 } from "@/api/base44Client";
import { sortNewsList } from "@/constants/newsData";

export default function NewsSection() {
  const [newsData, setNewsData] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);

  useEffect(() => {
    base44.entities.News.list("-created_date", 200).then((items) => setNewsData(sortNewsList(items))).catch(() => {});
    const unsubscribe = base44.entities.News.subscribe((items) => {
      if (Array.isArray(items)) setNewsData(sortNewsList(items));
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 22 }}
      className="px-3.5 mt-6"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-[3px] h-4 bg-[#948154] rounded-full" />
          <h2 className="text-[13px] font-bold text-[#3a352e]">Tin tức thị trường</h2>
        </div>
        <Link to="/news" className="flex items-center gap-0.5 text-[10px] text-[#948154] font-semibold hover:underline">
          Xem tất cả <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* News Cards - Horizontal Scroll */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-3.5 px-3.5 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
        {newsData.slice(0, 5).map((n) => (
          <motion.div
            key={n.id || n.title}
            whileTap={{ scale: 0.97 }}
            onClick={() => setSelectedArticle(n)}
            className="shrink-0 w-[210px] bg-white rounded-2xl overflow-hidden shadow-md border border-gray-100 hover:border-[#948154]/40 transition cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Image */}
              <div className="relative w-full h-[115px] overflow-hidden">
                <img
                  src={n.image}
                  alt={n.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#948154] text-white text-[8px] font-bold shadow">
                  {n.category}
                </span>
                <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/50 to-transparent" />
              </div>

              {/* Content */}
              <div className="p-3">
                <h3 className="text-[12px] font-bold text-black leading-tight line-clamp-2">{n.title}</h3>
                <p className="text-[9.5px] text-gray-500 leading-snug mt-1 line-clamp-2">{n.excerpt}</p>
              </div>
            </div>

            <div className="p-3 pt-0">
              <div className="flex items-center justify-between mt-1 pt-2 border-t border-gray-100 text-[8.5px] text-gray-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-[#948154]" />
                  <span>{n.time}</span>
                </div>
                <span className="flex items-center gap-0.5">
                  <Eye className="w-2.5 h-2.5 text-gray-300" />
                  {n.views}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Detail Modal */}
      {selectedArticle && (
        <NewsDetailModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </motion.section>
  );
}
