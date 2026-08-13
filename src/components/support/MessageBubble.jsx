import React, { useState } from "react";
import { FileText, Copy, Check, Maximize2, X, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const fileType = (url) => {
  if (!url) return "file";
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogg"].includes(ext)) return "video";
  if (url.startsWith("data:image/")) return "image";
  return "file";
};

const fileName = (url) => {
  try {
    return decodeURIComponent(url.split("/").pop().split("?")[0]).slice(0, 24);
  } catch (e) {
    return "Tập tin đính kèm";
  }
};

export default function MessageBubble({ message }) {
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const isUser = message.sender === "user";
  const time = new Date(message.created_date || Date.now()).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleCopy = (e) => {
    e.stopPropagation();
    const textToCopy =
      message.content ||
      (message.attachments && message.attachments.join("\n")) ||
      "";
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      toast.success("Đã sao chép nội dung tin nhắn!");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error("Không thể sao chép");
    });
  };

  return (
    <>
      <div className={`flex ${isUser ? "justify-end" : "justify-start"} group relative my-1`}>
        <div className={`max-w-[85%] sm:max-w-[80%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
          {!isUser && (
            <div className="flex items-center gap-1 mb-1 px-1">
              <span className="text-[10px] font-bold text-[#948154]">CSKH VinClub</span>
              <span className="text-[8px] bg-[#948154]/10 text-[#948154] px-1 py-0.2 rounded font-semibold">Quản trị viên</span>
            </div>
          )}

          <div className="relative group/bubble flex items-center">
            {/* Copy button outside bubble on hover / touch */}
            <button
              onClick={handleCopy}
              title="Sao chép tin nhắn"
              className={`opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 rounded-md text-gray-400 hover:text-black bg-white shadow-xs border border-gray-200 absolute top-1 ${
                isUser ? "-left-7" : "-right-7"
              }`}
            >
              {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
            </button>

            <div
              className={`rounded-2xl p-3 shadow-2xs border transition-all ${
                isUser
                  ? "bg-gradient-to-br from-[#948154] to-[#7d6c43] text-white border-[#948154]/20 rounded-br-xs"
                  : "bg-white text-black border-gray-100 rounded-bl-xs shadow-xs"
              }`}
            >
              {/* Text message */}
              {message.content && (
                <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words font-medium">
                  {message.content}
                </p>
              )}

              {/* Attachments */}
              {message.attachments?.length > 0 && (
                <div className={`space-y-2 ${message.content ? "mt-2 pt-2 border-t border-white/10" : ""}`}>
                  {message.attachments.map((url, i) => {
                    const t = fileType(url);
                    if (t === "image") {
                      return (
                        <div key={i} className="relative group/img overflow-hidden rounded-xl border border-black/5 bg-black/5">
                          <img
                            src={url}
                            alt="Hình ảnh đính kèm"
                            onClick={() => setPreviewImage(url)}
                            className="w-full max-h-56 object-cover rounded-xl cursor-pointer hover:scale-[1.02] transition-transform duration-200"
                            loading="lazy"
                          />
                          <button
                            onClick={() => setPreviewImage(url)}
                            className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg backdrop-blur-xs text-[10px] flex items-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"
                          >
                            <Maximize2 className="w-3 h-3" /> Phóng to
                          </button>
                        </div>
                      );
                    }
                    if (t === "video") {
                      return (
                        <video
                          key={i}
                          src={url}
                          controls
                          className="rounded-xl max-h-52 w-full border border-black/5"
                        />
                      );
                    }
                    return (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center gap-2 rounded-xl p-2.5 transition-colors ${
                          isUser ? "bg-white/15 hover:bg-white/25 text-white" : "bg-gray-50 hover:bg-gray-100 text-black border border-gray-200"
                        }`}
                      >
                        <FileText className="w-4 h-4 shrink-0 text-[#948154]" />
                        <span className="text-[11px] font-semibold truncate flex-1">{fileName(url)}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-0.5 px-1">
            <span className="text-[8px] text-gray-400 font-medium">{time}</span>
          </div>
        </div>
      </div>

      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-full max-h-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Toolbar */}
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              <a
                href={previewImage}
                target="_blank"
                rel="noreferrer"
                download="vinclub_image"
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all"
                title="Tải ảnh về"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* High-res Image view */}
            <img
              src={previewImage}
              alt="Ảnh phóng to"
              className="max-w-[92vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/10"
            />
            <p className="text-[10px] text-white/70 mt-2 font-medium">Chạm ra ngoài để đóng xem ảnh</p>
          </div>
        </div>
      )}
    </>
  );
}
