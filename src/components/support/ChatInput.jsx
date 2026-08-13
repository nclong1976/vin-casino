import React, { useState, useRef, useEffect } from "react";
import { Paperclip, Send, X, FileText, Film } from "lucide-react";
import { toast } from "sonner";

const QUICK_TOPICS = [
  "Hướng dẫn Nạp / Rút tiền",
  "Tư vấn định giá Đất nền",
  "Đặt lịch Cố vấn Pháp lý",
  "Quyền lợi Thẻ Hội viên VinClub"
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
    <div className="shrink-0 px-2.5 pt-2 pb-2 mb-[60px] bg-white border-t border-gray-100 shadow-md z-40 relative">
      {/* Quick Topic Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
        {QUICK_TOPICS.map((topic, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setText(topic)}
            className="px-2 py-0.5 rounded-full bg-amber-50 hover:bg-amber-100 border border-amber-200/80 text-[#948154] text-[9px] font-bold whitespace-nowrap transition-colors shrink-0"
          >
            {topic}
          </button>
        ))}
      </div>

      {/* File / Image Previews */}
      {files.length > 0 && (
        <div className="flex gap-2 mb-1.5 overflow-x-auto pb-1 scrollbar-none">
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
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Input Controls Bar */}
      <div className="flex items-end gap-1.5 bg-gray-100/90 rounded-2xl p-1 border border-gray-200/80 focus-within:border-[#948154]/60 transition-all">
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
          className="w-8 h-8 rounded-xl bg-white text-gray-600 hover:text-[#948154] hover:bg-amber-50 flex items-center justify-center shrink-0 border border-gray-200 shadow-2xs transition-colors"
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
          placeholder="Soạn tin nhắn (Nhấn Enter gửi, Shift+Enter xuống dòng)..."
          rows={1}
          className="flex-1 py-1.5 px-2 bg-transparent outline-none text-[11px] text-black resize-none min-h-[32px] max-h-[90px] leading-relaxed scrollbar-none font-sans"
        />

        {/* Send Button */}
        <button
          onClick={submit}
          disabled={sending || (!text.trim() && files.length === 0)}
          type="button"
          className="w-8 h-8 rounded-xl bg-[#948154] hover:bg-[#837046] disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-xs transition-all active:scale-95"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[7.5px] text-gray-400 text-center mt-1">
        Dán ảnh trực tiếp qua <span className="font-semibold text-gray-600">Ctrl + V</span> hoặc biểu tượng ghim tệp.
      </p>
    </div>
  );
}
