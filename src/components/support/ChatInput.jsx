import React, { useState, useRef, useEffect } from "react";
import { Paperclip, Send, X, FileText, Film } from "lucide-react";
import { toast } from "sonner";

const QUICK_TOPICS = [
  "Hướng dẫn Nạp / Rút tiền",
  "Tư vấn định giá Đất nền",
  "Đặt lịch Cố vấn Pháp lý",
  "Quyền lợi Thẻ Hội viên VinClub",
  "Hỗ trợ nạp tiền qua CSKH"
];

const previewType = (file) => {
  const t = file.type || "";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  return "file";
};

export default function ChatInput({ onSend, sending }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto resize textarea height based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  }, [text]);

  const pickFiles = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      setFiles((f) => [...f, ...selected]);
      toast.success(`Đã chọn ${selected.length} tệp đính kèm`);
    }
    e.target.value = "";
  };

  const removeFile = (idx) => setFiles((f) => f.filter((_, i) => i !== idx));

  // Handle Clipboard Paste for Images
  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const pastedImages = [];

    items.forEach((item) => {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          pastedImages.push(file);
        }
      }
    });

    if (pastedImages.length > 0) {
      setFiles((f) => [...f, ...pastedImages]);
      toast.success(`Đã dán ${pastedImages.length} hình ảnh từ Clipboard!`);
    }
  };

  const submit = () => {
    if ((!text.trim() && files.length === 0) || sending) return;
    onSend(text, files);
    setText("");
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "36px";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="w-full bg-white border-t border-gray-200/80 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-40 relative pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-4xl mx-auto px-3 pt-2 pb-2.5">
        {/* Quick Topic Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {QUICK_TOPICS.map((topic, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setText(topic)}
              className="px-2.5 py-1 rounded-full bg-amber-50/80 hover:bg-amber-100 border border-amber-200/90 text-[#948154] text-[10px] font-bold whitespace-nowrap transition-colors shrink-0 shadow-2xs cursor-pointer active:scale-95"
            >
              {topic}
            </button>
          ))}
        </div>

        {/* File / Image Previews */}
        {files.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-none">
            {files.map((f, i) => {
              const t = previewType(f);
              const url = URL.createObjectURL(f);
              return (
                <div
                  key={i}
                  className="relative w-14 h-14 rounded-xl overflow-hidden border border-gray-200 shrink-0 bg-gray-50 flex items-center justify-center shadow-xs group"
                >
                  {t === "image" ? (
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  ) : t === "video" ? (
                    <Film className="w-5 h-5 text-[#948154]" />
                  ) : (
                    <FileText className="w-5 h-5 text-[#948154]" />
                  )}
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Input Controls Bar */}
        <div className="flex items-end gap-1.5 bg-gray-100 rounded-2xl p-1.5 border border-gray-200 focus-within:border-[#948154] focus-within:bg-white focus-within:ring-1 focus-within:ring-[#948154]/30 transition-all">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx"
            className="hidden"
            onChange={pickFiles}
          />

          {/* Attachment Upload Button */}
          <button
            onClick={() => inputRef.current?.click()}
            type="button"
            title="Chọn ảnh/tệp đính kèm"
            className="w-9 h-9 rounded-xl bg-white text-gray-600 hover:text-[#948154] hover:bg-amber-50 flex items-center justify-center shrink-0 border border-gray-200 shadow-2xs transition-colors cursor-pointer active:scale-95"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Multiline Auto-resizing Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Nhập tin nhắn..."
            rows={1}
            className="flex-1 py-2 px-2.5 bg-transparent outline-none text-xs sm:text-sm text-gray-900 resize-none min-h-[36px] max-h-[100px] leading-relaxed scrollbar-none font-sans"
          />

          {/* Send Button */}
          <button
            onClick={submit}
            disabled={sending || (!text.trim() && files.length === 0)}
            type="button"
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#948154] to-[#7d6c43] hover:from-[#a59160] hover:to-[#8c794c] disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
