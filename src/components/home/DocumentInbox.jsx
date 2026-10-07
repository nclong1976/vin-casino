import React, { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Drawer, DrawerDescription, DrawerHeader, DrawerOverlay, DrawerPortal, DrawerTitle } from "@/components/ui/drawer";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import DocumentList, { needsSigning } from "@/components/profile/DocumentList";

/**
 * Hộp thư văn bản (icon lá thư cạnh chuông ở trang chủ): giấy tờ, thông báo,
 * hợp đồng Admin gửi riêng cho tài khoản này (bảng custom_documents, cùng
 * nguồn với "Tài liệu & Giấy tờ" ở Hồ sơ). Chấm đỏ = số văn bản đang chờ ký;
 * bấm mở danh sách, mỗi văn bản dẫn tới /document/:id để đọc và ký.
 */
export default function DocumentInbox() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDocs = useCallback(() => {
    if (!user?.id) return;
    base44.entities.CustomDocument.filter({ user_id: user.id }, "-created_date", 50)
      .then((list) => setDocs(list || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  useEffect(() => {
    fetchDocs();
    const unsub = base44.entities.CustomDocument.subscribe(() => fetchDocs());
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [fetchDocs]);

  useEffect(() => {
    if (open) fetchDocs();
  }, [open, fetchDocs]);

  const pending = docs.filter(needsSigning).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative p-1 -m-1 transition-opacity hover:opacity-80 active:scale-95"
        title="Hộp thư văn bản"
        aria-label={pending > 0 ? `Hộp thư văn bản, ${pending} văn bản chờ ký` : "Hộp thư văn bản"}
      >
        <Mail className="w-4 h-4 text-white" strokeWidth={1.75} />
        {pending > 0 && (
          <span className="absolute -top-0.5 -right-1 min-w-[13px] h-[13px] px-0.5 rounded-full bg-red-500 text-white text-[7px] font-bold flex items-center justify-center">
            {pending > 9 ? "9+" : pending}
          </span>
        )}
      </button>

      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerPortal>
          {/* z-[60]: nằm trên thanh điều hướng dưới (z-50) của app. */}
          <DrawerOverlay className="z-[60] bg-black/60" />
          <DrawerPrimitive.Content className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[88vh] flex-col rounded-t-2xl bg-[#f7f6f3] font-heading shadow-2xl outline-none">
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-gray-300" />
            <div className="mx-auto w-full max-w-lg overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
              <DrawerHeader className="px-0 pb-3 text-left">
                <DrawerTitle className="flex items-center gap-1.5 text-[15px] text-gray-900">
                  <Mail className="w-4 h-4 text-[#948154]" /> Hộp thư văn bản
                </DrawerTitle>
                <DrawerDescription className="text-[11px] text-gray-500">
                  {pending > 0
                    ? `Bạn có ${pending} văn bản đang chờ ký.`
                    : "Giấy tờ, thông báo và hợp đồng từ VinClub gửi tới bạn."}
                </DrawerDescription>
              </DrawerHeader>
              <DocumentList docs={docs} loading={loading} />
            </div>
          </DrawerPrimitive.Content>
        </DrawerPortal>
      </Drawer>
    </>
  );
}
