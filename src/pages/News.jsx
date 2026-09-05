import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, TrendingUp, BookOpen, Search, ArrowRight } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import BottomNav from "@/components/BottomNav";
import MarketSearchBar from "@/components/shared/MarketSearchBar";
import { NEWS_CATEGORIES, sortNewsList } from "@/constants/newsData";
import NewsDetailModal from "@/components/news/NewsDetailModal";
import { base44 } from "@/api/base44Client";

export default function News() {
  const [newsData, setNewsData] = useState([]);
  const [activeCat, setActiveCat] = useState("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);

  const location = useLocation();

  // Tải tin tức từ entity News (do admin quản lý) thay vì hằng số tĩnh
  useEffect(() => {
    base44.entities.News.list("-created_date", 200).then((items) => setNewsData(sortNewsList(items))).catch(() => {});
    const unsubscribe = base44.entities.News.subscribe((items) => {
      if (Array.isArray(items)) setNewsData(sortNewsList(items));
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, []);

  // Auto-open article if URL has ?id=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const articleId = params.get("id");
    if (articleId) {
      const found = newsData.find((item) => item.id === articleId);
      if (found) {
        setSelectedArticle(found);
      }
    }
  }, [location.search, newsData]);

  const filtered = newsData.filter((n) => {
    const matchCat = activeCat === "Tất cả" || n.category === activeCat;
    const matchQuery =
      !searchQuery ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchQuery;
  });

  const featured = filtered.find((n) => n.featured) || filtered[0];

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading pb-24">
      <PageHeader title="Tin Tức & Thị Trường" />

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Market Search Bar */}
        <MarketSearchBar placeholder="Tìm tin tức Vinpearl, BĐS, cổ phiếu..." />

        {/* Categories */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
          {NEWS_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                activeCat === cat
                  ? "bg-[#948154] text-white shadow"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-[#948154]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Featured Hero Article */}
        {featured && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setSelectedArticle(featured)}
            className="bg-white rounded-2xl overflow-hidden shadow-md border border-gray-100 hover:border-[#948154]/50 transition cursor-pointer group"
          >
            <div className="relative w-full h-[155px] overflow-hidden">
              <img
                src={featured.image}
                alt={featured.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#D32F2F] text-white text-[8px] font-bold flex items-center gap-0.5 shadow">
                <TrendingUp className="w-2.5 h-2.5" /> NỔI BẬT
              </span>
              <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#948154] text-white text-[8px] font-bold shadow">
                {featured.category}
              </span>
              <div className="absolute bottom-2 left-3 right-3 text-white">
                <h3 className="text-[13px] font-bold leading-tight line-clamp-2 drop-shadow">
                  {featured.title}
                </h3>
              </div>
            </div>
            <div className="p-3">
              <p className="text-[10px] text-gray-500 leading-snug line-clamp-2">{featured.excerpt}</p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-[9px] text-gray-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-[#948154]" />
                  <span>{featured.time}</span>
                  <span>•</span>
                  <span>{featured.author}</span>
                </div>
                <span className="text-[#948154] font-bold flex items-center gap-0.5">
                  Đọc tiếp <ArrowRight className="w-2.5 h-2.5" />
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Article List Title */}
        <div className="flex items-center justify-between pt-1">
          <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
            Bài viết mới nhất ({filtered.length})
          </h4>
        </div>

        {/* Articles List */}
        <div className="space-y-2.5">
          {filtered
            .filter((n) => n !== featured)
            .map((n, i) => (
              <motion.div
                key={n.id || n.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelectedArticle(n)}
                className="bg-white rounded-2xl p-2.5 shadow-sm border border-gray-100 flex gap-3 hover:border-[#948154]/40 transition cursor-pointer group"
              >
                <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
                  <img
                    src={n.image}
                    alt={n.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.2 rounded bg-black/60 text-amber-300 text-[7px] font-bold backdrop-blur">
                    {n.category}
                  </span>
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <div>
                    <h4 className="text-[11.5px] font-bold text-black leading-tight line-clamp-2 group-hover:text-[#948154] transition-colors">
                      {n.title}
                    </h4>
                    <p className="text-[9.5px] text-gray-400 leading-snug line-clamp-1 mt-0.5">
                      {n.excerpt}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[8.5px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-gray-300" />
                      {n.time}
                    </span>
                    <span className="flex items-center gap-0.5 text-[#948154] font-semibold">
                      <BookOpen className="w-2.5 h-2.5" /> Đọc bài
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-[12px] font-bold text-gray-600">Không tìm thấy tin tức phù hợp</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Vui lòng thử từ khóa khác hoặc chuyển danh mục</p>
          </div>
        )}
      </div>

      {/* Article Detail Reader Modal */}
      {selectedArticle && (
        <NewsDetailModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}

      <BottomNav />
    </main>
  );
}
