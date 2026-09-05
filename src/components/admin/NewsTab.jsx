import React, { useState, useEffect } from "react";
import { Pencil, Check, X, Plus, Search, Newspaper, Star, Loader2, Trash2, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { NEWS_CATEGORIES, sortNewsList } from "@/constants/newsData";
import { toast } from "sonner";

const CATEGORY_OPTIONS = NEWS_CATEGORIES.filter((c) => c !== "Tất cả");

// slug đơn giản từ tiêu đề để làm id dễ đọc, không dấu, nối timestamp để tránh trùng.
const slugify = (title) =>
  (title || "bai-viet")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// "Ngày đăng" hiển thị cho người dùng (n.date, xem NewsDetailModal.jsx) được
// lưu dạng chuỗi "dd/mm/yyyy" (đúng định dạng today.toLocaleDateString("vi-VN")
// đang dùng khi tạo bài mới) - 3 hàm dưới đây chuyển đổi qua lại với "yyyy-mm-dd"
// mà <input type="date"> bắt buộc, không đổi định dạng lưu trữ hiện có.
const vnDateToIso = (vnDate) => {
  const [d, m, y] = String(vnDate || "").split("/");
  if (!d || !m || !y) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};
const isoDateToVn = (iso) => {
  const [y, m, d] = String(iso || "").split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
};
const todayIsoDate = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

// Lượt xem hiển thị cho người dùng chỉ là con số biên tập tĩnh (không có cơ
// chế đếm view thật ở đâu trong code) - đúng như 6 bài dữ liệu mẫu ban đầu
// đều được gán sẵn một số ở khoảng vài nghìn (newsData.js). Bài đăng thật
// đầu tiên qua form này lại bị mặc định "0" (chưa ai nhập gì) - nhìn như
// chưa ai xem, lạc lõng so với các bài mẫu bên cạnh. Sinh 1 số ngẫu nhiên
// hợp lý trong khoảng vài nghìn (khớp đúng khoảng 1.890-5.310 của 6 bài
// mẫu) làm mặc định cho bài MỚI thay vì "0".
const randomInitialViews = () => (1000 + Math.floor(Math.random() * 5000)).toLocaleString("en-US");

// Mọi danh sách Tin tức (NewsSection.jsx, News.jsx, NewsTab.jsx) đều sắp theo
// sort_order (xem sortNewsList trong constants/newsData.js) - KHÔNG theo
// field "date" (chuỗi hiển thị). Trước khi có cột sort_order riêng, "date"
// và thứ tự hiển thị luôn khớp nhau tự nhiên vì cả 2 đều bám created_date.
// Giờ cho phép sửa "date" độc lập, nên vẫn cần dời created_date theo ngày
// mới chọn - nếu không, backfill sort_order (chạy 1 lần lúc thêm cột, xem
// migration add_manual_sort_order_to_news) đã cố định thứ tự cũ, còn
// created_date thì KHÔNG còn được dùng để sắp xếp nữa nên sẽ không tự lệch
// theo, nhưng vẫn nên giữ 2 giá trị nhất quán cho mọi nơi khác đọc created_date
// (vd. genericListEntity fallback sort mặc định). Giữ nguyên giờ:phút:giây gốc,
// chỉ thay phần NGÀY.
const applyDatePart = (originalIso, isoDateOnly) => {
  const base = originalIso ? new Date(originalIso) : new Date();
  const [y, m, d] = String(isoDateOnly || "").split("-").map(Number);
  if (!y || !m || !d || Number.isNaN(base.getTime())) return base.toISOString();
  const combined = new Date(base);
  combined.setFullYear(y, m - 1, d);
  return combined.toISOString();
};

// Mặc định "chưa ai ghim tay" cho sort_order (xem sortNewsList - sắp giảm
// dần theo sort_order) = ÂM mốc thời gian của "Ngày đăng" (không phải
// created_date) - để bài có Ngày đăng CŨ hơn tự nhiên có sort_order LỚN
// hơn (số âm nhỏ hơn về độ lớn), tức tự xếp lên trên khi chưa ai bấm nút
// mũi tên. Nút mũi tên lên/xuống (moveNews) vẫn hoạt động y hệt sau đó -
// nó chỉ cần một trục số dùng chung để +1/-1 so với hàng xóm hiện tại,
// không quan tâm trục đó khởi tạo từ đâu.
const dateToDefaultSortOrder = (vnDate) => {
  const iso = vnDateToIso(vnDate);
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? -ms : 0;
};

export default function NewsTab() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetch = () => {
    base44.entities.News
      .list("-created_date", 200)
      .then((items) => setNews(sortNewsList(items)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch();
    const unsubscribe = base44.entities.News.subscribe((updatedItems) => {
      if (Array.isArray(updatedItems)) setNews(sortNewsList(updatedItems));
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Dời tin tức lên/xuống 1 vị trí - chỉ cần đổi sort_order của CHÍNH bài
  // đang di chuyển (vượt qua/ đứng sau đúng 1 người hàng xóm), không cần đổi
  // cả 2 bài như kiểu "hoán đổi" - nhiều bài tin cũ (tạo trước khi có cột
  // sort_order) đang bị TRÙNG giá trị sort_order do backfill từ cùng 1
  // created_date, hoán đổi 2 giá trị trùng nhau sẽ không tạo ra thay đổi gì
  // (nút bấm trông như không hoạt động). +1/-1 so với hàng xóm luôn đảm bảo
  // di chuyển thấy được, kể cả khi đang có nhiều bài trùng thứ tự.
  const moveNews = async (id, direction) => {
    const idx = news.findIndex((n) => n.id === id);
    if (idx === -1) return;
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= news.length) return;
    const neighborOrder = Number(news[neighborIdx].sort_order) || 0;
    const newOrder = direction === "up" ? neighborOrder + 1 : neighborOrder - 1;
    try {
      await base44.entities.News.update(id, { sort_order: newOrder });
      fetch();
    } catch (e) {
      toast.error("Không thể đổi thứ tự tin tức");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await base44.entities.News.delete(deleting.id);
      toast.success(`Đã xóa tin tức "${deleting.title}"`);
      setNews((prev) => prev.filter((x) => x.id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      toast.error("Không thể xóa tin tức");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSave = async (data) => {
    try {
      if (editing?.id) {
        await base44.entities.News.update(editing.id, data);
        toast.success(`Đã cập nhật tin tức "${data.title}"`);
      } else {
        await base44.entities.News.create({ ...data, id: `${slugify(data.title)}-${Date.now().toString().slice(-6)}` });
        toast.success(`Đã đăng tin tức mới "${data.title}"`);
      }
      setEditing(null);
      setShowAdd(false);
      fetch();
    } catch (e) {
      toast.error("Không thể lưu tin tức");
    }
  };

  const filtered = news.filter((n) => {
    const q = search.toLowerCase();
    return (n.title || "").toLowerCase().includes(q) || (n.category || "").toLowerCase().includes(q) || (n.author || "").toLowerCase().includes(q);
  });

  if (loading)
    return <div className="text-center py-8 text-[12px] text-gray-400">Đang tải danh sách tin tức...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-bold text-black flex items-center gap-1.5">
            <Newspaper className="w-4 h-4 text-[#948154]" /> Quản lý Tin tức ({news.length})
          </h2>
          <p className="text-[9.5px] text-gray-400">Đồng bộ trực tiếp với mục Tin tức trên ứng dụng người dùng</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowAdd(true); }}
          className="px-3 py-1.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[10.5px] font-bold flex items-center gap-1 shadow-xs shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Đăng tin mới
        </button>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tiêu đề, danh mục, tác giả..."
          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-[11px] focus:outline-none focus:border-[#948154]"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {search && (
        <p className="text-[9px] text-gray-400 -mt-1.5">
          Xóa ô tìm kiếm để sắp xếp lại thứ tự bài viết bằng nút mũi tên.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-[12px] text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
          Không tìm thấy tin tức phù hợp
        </div>
      ) : (
        filtered.map((n) => (
          <div key={n.id} className="bg-white rounded-xl p-3 shadow-xs border border-gray-100">
            <div className="flex items-start gap-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                <img src={n.image} alt={n.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <h3 className="text-[12px] font-bold text-black truncate">{n.title}</h3>
                  {n.featured && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                </div>
                <p className="text-[9.5px] text-gray-500 truncate mt-0.5">{n.excerpt}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                    {n.category}
                  </span>
                  <span className="text-[8.5px] text-gray-400">{n.author} • {n.date}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-gray-100">
              <button
                onClick={() => setEditing(n)}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10.5px] font-bold flex items-center gap-1 transition-all"
              >
                <Pencil className="w-3 h-3 text-[#948154]" /> Chỉnh sửa
              </button>
              <button
                onClick={() => setDeleting(n)}
                title="Xóa tin tức"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              {!search && (
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => moveNews(n.id, "up")}
                    disabled={news.findIndex((x) => x.id === n.id) === 0}
                    title="Đưa lên trên"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveNews(n.id, "down")}
                    disabled={news.findIndex((x) => x.id === n.id) === news.length - 1}
                    title="Đưa xuống dưới"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {(editing || showAdd) && (
        <NewsEditModal
          item={editing}
          onClose={() => { setEditing(null); setShowAdd(false); }}
          onSave={handleSave}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => !deleteLoading && setDeleting(null)}>
          <div className="w-full max-w-[320px] bg-white rounded-2xl shadow-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-[13px] font-bold">Xác nhận xóa tin tức</h3>
            </div>
            <p className="text-[11px] text-gray-600">
              Bạn có chắc muốn xóa vĩnh viễn bài viết <strong>"{deleting.title}"</strong>? Hành động này không thể hoàn tác.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setDeleting(null)}
                disabled={deleteLoading}
                className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11.5px] font-bold transition-all"
              >
                Hủy
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11.5px] font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewsEditModal({ item, onClose, onSave }) {
  // Nội dung chi tiết (sections) được rút gọn thành các đoạn văn (paragraph)
  // cách nhau bởi dòng trống để form nhập liệu đơn giản - các khối "highlight"/
  // "image"/"quote" có sẵn từ trước (nếu có) vẫn được GIỮ NGUYÊN khi lưu, chỉ
  // các đoạn "paragraph" mới bị ghi đè theo nội dung nhập lại ở đây.
  const initialParagraphs = (item?.sections || [])
    .filter((s) => s.type === "paragraph")
    .map((s) => s.text)
    .join("\n\n");
  const nonParagraphSections = (item?.sections || []).filter((s) => s.type !== "paragraph");

  const [form, setForm] = useState({
    title: item?.title || "",
    excerpt: item?.excerpt || "",
    category: item?.category || CATEGORY_OPTIONS[0],
    author: item?.author || "Ban Biên Tập VinClub",
    image: item?.image || "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1000&h=600&fit=crop",
    featured: item?.featured || false,
    tags: (item?.tags || []).join(", "),
    content: initialParagraphs,
    publishDate: vnDateToIso(item?.date) || todayIsoDate(),
  });

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast.error("Vui lòng nhập tiêu đề tin tức");
      return;
    }
    const paragraphSections = form.content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((text) => ({ type: "paragraph", text }));

    const today = new Date();
    onSave({
      title: form.title.trim(),
      excerpt: form.excerpt.trim(),
      category: form.category,
      author: form.author.trim() || "Ban Biên Tập VinClub",
      image: form.image.trim(),
      featured: form.featured,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      sections: [...paragraphSections, ...nonParagraphSections],
      date: isoDateToVn(form.publishDate) || today.toLocaleDateString("vi-VN"),
      created_date: applyDatePart(item?.created_date, form.publishDate),
      time: item?.time || "Vừa đăng",
      views: item?.views || randomInitialViews(),
      // Bài mới mặc định xếp theo đúng vị trí thời gian của "Ngày đăng" (cũ
      // hơn lên trên, mới hơn xuống dưới - xem dateToDefaultSortOrder) thay
      // vì luôn nhảy lên đầu như trước. Bài đang SỬA vẫn GIỮ NGUYÊN vị trí
      // thủ công hiện có - nếu tính lại từ ngày ở đây, mỗi lần admin chỉ
      // sửa lỗi chính tả cũng vô tình dời vị trí, xoá mất thứ tự đã ghim
      // tay bằng nút mũi tên lên/xuống.
      sort_order: item?.sort_order ?? dateToDefaultSortOrder(form.publishDate),
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-2" onClick={onClose}>
      <div className="w-full max-w-[325px] bg-white rounded-2xl max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-3.5 py-3 border-b border-gray-100">
          <h2 className="text-[13px] font-bold text-black flex items-center gap-1.5">
            <Newspaper className="w-4 h-4 text-[#948154]" />
            {item?.id ? "Chỉnh sửa tin tức" : "Đăng tin tức mới"}
          </h2>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">Tiêu đề (*):</label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Tiêu đề bài viết"
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">Ngày đăng:</label>
            <input
              type="date"
              value={form.publishDate}
              onChange={(e) => set("publishDate", e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
            />
            <p className="text-[9px] text-gray-400 mt-1">
              Hiển thị cho người dùng ở trang Tin tức. Với bài chưa từng dùng nút mũi tên lên/xuống bên dưới, ngày này cũng quyết định vị trí mặc định (cũ hơn lên trên).
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">Tóm tắt ngắn:</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              rows={2}
              placeholder="Câu tóm tắt hiển thị ở danh sách tin tức"
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">Danh mục:</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154] bg-white"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-700 block mb-1">Tác giả:</label>
              <input
                value={form.author}
                onChange={(e) => set("author", e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">URL Hình ảnh:</label>
            <input
              value={form.image}
              onChange={(e) => set("image", e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
            />
            {form.image && (
              <div className="mt-1.5 h-20 rounded-lg overflow-hidden border border-gray-200">
                <img src={form.image} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">Nội dung chi tiết (mỗi đoạn cách nhau bởi dòng trống):</label>
            <textarea
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              rows={6}
              placeholder={"Đoạn văn thứ nhất...\n\nĐoạn văn thứ hai..."}
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154] resize-none"
            />
            {nonParagraphSections.length > 0 && (
              <p className="text-[9px] text-amber-600 mt-1">
                Bài viết có {nonParagraphSections.length} khối nội dung đặc biệt (ảnh minh họa/trích dẫn/điểm nhấn) sẽ được giữ nguyên phía sau các đoạn văn ở trên.
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-700 block mb-1">Thẻ (cách nhau bởi dấu phẩy):</label>
            <input
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="VinClub, Đầu tư, 2026"
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
            />
          </div>

          <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-black">Tin nổi bật</p>
              <p className="text-[9px] text-gray-500">Hiển thị ưu tiên ở đầu trang Tin tức</p>
            </div>
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => set("featured", e.target.checked)}
              className="w-4 h-4 accent-[#948154] cursor-pointer"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[11px] font-bold shadow-md transition-all flex items-center justify-center gap-1.5 mt-2"
          >
            <Check className="w-4 h-4" /> {item?.id ? "Lưu thay đổi" : "Đăng tin tức"}
          </button>
        </div>
      </div>
    </div>
  );
}
