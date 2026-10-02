import React, { useEffect, useState } from "react";
import { ListOrdered, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { cancelStockOrder, stockErrorMessage } from "@/lib/stockOrders";
import { STATUS_LABELS } from "@/lib/stockMarket";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const STATUS_STYLE = {
  pending: "bg-amber-500/15 text-amber-300",
  filled: "bg-emerald-500/15 text-emerald-300",
  cancelled: "bg-gray-500/20 text-gray-300",
  expired: "bg-gray-500/20 text-gray-400",
  rejected: "bg-red-500/15 text-red-300",
};

/** Sổ lệnh của người dùng (stock_orders, realtime); huỷ lệnh chờ khớp. */
export default function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setOrders([]);
      return undefined;
    }
    let alive = true;
    const load = () =>
      supabase
        .from("stock_orders")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(100)
        .then(({ data }) => alive && setOrders(data || []));
    load();
    const channel = supabase
      .channel(`stock_orders_${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_orders", filter: `user_id=eq.${uid}` }, () => load())
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const cancel = async (o) => {
    if (busyId) return;
    setBusyId(o.id);
    try {
      await cancelStockOrder(o.id);
      window.dispatchEvent(new Event("vinclub:balance_updated"));
      toast.success(o.side === "SELL" ? "Đã huỷ lệnh bán, cổ phiếu trở lại danh mục" : `Đã huỷ lệnh, hoàn ${fmt(o.hold_amount)} đ tiền phong toả`);
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không huỷ được lệnh"));
    } finally {
      setBusyId(null);
    }
  };

  const shown = orders.filter((o) => (filter === "all" ? true : filter === "pending" ? o.status === "pending" : o.status !== "pending"));

  if (!user?.id) {
    return <p className="text-center text-[12px] text-gray-500 py-10">Đăng nhập để xem sổ lệnh.</p>;
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-white flex items-center gap-1.5">
          <ListOrdered className="w-4 h-4 text-[#d4af37]" /> Sổ lệnh
        </h2>
        <div className="flex gap-1 p-0.5 rounded-lg bg-[#151b24]">
          {[
            ["all", "Tất cả"],
            ["pending", "Chờ khớp"],
            ["done", "Đã xử lý"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-2.5 py-1 rounded-md text-[10.5px] cursor-pointer ${filter === k ? "bg-[#d4af37] text-black font-bold" : "text-gray-400"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-center text-[12px] text-gray-500 py-10 rounded-2xl bg-[#151b24]">Chưa có lệnh nào.</p>
      ) : (
        shown.map((o) => (
          <div key={o.id} className="rounded-2xl p-3 bg-[#151b24] border border-[#222c38]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {o.side === "SELL" ? (
                  <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 text-[10px] font-bold">BÁN</span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">MUA</span>
                )}
                <span className="text-[13px] font-bold text-white">{o.symbol}</span>
                <span className="text-[10px] text-gray-400 font-mono">{o.order_type}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[o.status] || ""}`}>
                {STATUS_LABELS[o.status] || o.status}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <p className="text-gray-500 text-[9.5px]">Khối lượng</p>
                <p className="text-white font-mono">{fmt(o.qty)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-[9.5px]">{o.status === "filled" ? "Giá khớp" : "Giá đặt"}</p>
                <p className="text-white font-mono">{o.status === "filled" ? fmt(o.price) : o.limit_price ? fmt(o.limit_price) : o.order_type}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-[9.5px]">
                  {o.side === "SELL"
                    ? o.status === "filled"
                      ? "Tiền về (sau phí, thuế)"
                      : "Giữ cổ phiếu"
                    : o.status === "filled"
                      ? "Giá trị + phí"
                      : "Phong toả"}
                </p>
                <p className="text-white font-mono">
                  {o.side === "SELL"
                    ? o.status === "filled"
                      ? fmt(Number(o.amount) - Number(o.fee || 0) - Number(o.tax || 0))
                      : `${fmt(o.qty)} CP`
                    : o.status === "filled"
                      ? fmt(Number(o.amount) + Number(o.fee || 0))
                      : fmt(o.hold_amount)}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
              <span>
                {new Date(o.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                {o.trade_date ? ` · phiên ${new Date(`${o.trade_date}T00:00:00`).toLocaleDateString("vi-VN")}` : ""}
                {o.cancel_reason ? ` · ${o.cancel_reason}` : ""}
              </span>
              {o.status === "pending" && (
                <button
                  disabled={busyId === o.id}
                  onClick={() => cancel(o)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/15 text-red-300 font-bold cursor-pointer disabled:opacity-50"
                >
                  <X className="w-3 h-3" /> Huỷ lệnh
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
