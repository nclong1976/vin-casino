import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, FileSearch, Loader2, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { verifyDocument } from "@/lib/esignApi";

const STATUS_TEXT = {
  pending: "Chờ ký",
  signed: "Đã ký",
  approved: "Đã ký - đã duyệt",
  rejected: "Bị từ chối",
  revoked: "Đã thu hồi",
  expired: "Quá hạn ký",
};

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—");

function safeDecode(v) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

async function sha256OfFile(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Trang kiểm tra văn bản công khai (spec mục 8.5) - mở từ mã QR trên văn
 * bản/PDF. Không cần đăng nhập, không lộ nội dung: chỉ cho biết văn bản có
 * thật, trạng thái, thời điểm ký và (tuỳ chọn) file PDF đang cầm có đúng là
 * bản gốc không - hash tính ngay trên máy, file không rời thiết bị.
 */
export default function Verify() {
  // Số văn bản có thể chứa "/" (vd 12/2026/TB-VC) nên route dùng splat.
  const routeDocNo = safeDecode(useParams()["*"] || "");
  const [docNo, setDocNo] = useState(routeDocNo);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const check = async (no, pdf) => {
    const value = (no || "").trim();
    if (!value) return;
    setLoading(true);
    setError("");
    try {
      const hash = pdf ? await sha256OfFile(pdf) : null;
      setResult(await verifyDocument(value, hash));
    } catch {
      setError("Không kiểm tra được, vui lòng thử lại");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDocNo(routeDocNo);
    if (routeDocNo) check(routeDocNo, null);
  }, [routeDocNo]);

  const submit = (e) => {
    e.preventDefault();
    check(docNo, file);
  };

  return (
    <main className="min-h-screen bg-[#f5f5f5] font-heading px-4 py-8">
      <div className="max-w-md mx-auto space-y-4">
        <div className="text-center space-y-1">
          <FileSearch className="w-8 h-8 mx-auto text-[#948154]" />
          <h1 className="text-[17px] font-bold text-gray-900">Kiểm tra văn bản điện tử</h1>
          <p className="text-[11.5px] text-gray-500">Nhập số văn bản (in trên văn bản, cạnh mã QR) để kiểm tra văn bản có trên hệ thống VinClub hay không.</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input
            value={docNo}
            onChange={(e) => setDocNo(e.target.value)}
            placeholder="VD: 12/2026/TB-VC"
            aria-label="Số văn bản"
            className="w-full h-10 px-3 rounded-lg border border-gray-300 outline-none text-[13px] focus:border-[#948154]"
          />
          <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-dashed border-gray-300 text-[11.5px] text-gray-600 cursor-pointer">
            <Upload className="w-4 h-4 shrink-0" />
            <span className="truncate">{file ? file.name : "Đối chiếu file PDF (không bắt buộc)"}</span>
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button
            type="submit"
            disabled={loading || !docNo.trim()}
            className="w-full h-10 rounded-lg bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[13px] font-semibold flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Kiểm tra
          </button>
        </form>

        {error && <p className="text-center text-[12px] text-rose-600">{error}</p>}
        {result && <VerifyResult result={result} />}

        <p className="text-center">
          <Link to="/" className="text-[11px] text-[#948154]">
            Về trang chủ
          </Link>
        </p>
      </div>
    </main>
  );
}

function VerifyResult({ result }) {
  if (!result.found)
    return (
      <div className="bg-rose-50 rounded-2xl p-4 flex gap-3">
        <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0" />
        <div className="text-[12px] text-rose-800">
          <p className="font-semibold">Không tìm thấy văn bản</p>
          <p className="mt-0.5">Số văn bản không có trên hệ thống VinClub. Văn bản có thể không phải do VinClub phát hành.</p>
        </div>
      </div>
    );

  const rows = [
    ["Số văn bản", result.doc_no],
    ["Đơn vị phát hành", result.issuer_org || "—"],
    ["Ngày phát hành", fmt(result.issued_at)],
    ["Trạng thái", STATUS_TEXT[result.status] || result.status],
    ["Thời điểm ký", result.signed ? fmt(result.signed_at) : "Chưa ký"],
  ];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2 text-green-700">
        <ShieldCheck className="w-6 h-6" />
        <p className="text-[13px] font-semibold">Văn bản có trên hệ thống VinClub</p>
      </div>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-[12px]">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-gray-500">{k}</dt>
            <dd className="text-gray-900 font-medium break-words">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      {result.hash_checked &&
        (result.pdf_match || result.content_match ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-green-50 p-2 text-[11.5px] text-green-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> File khớp bản gốc - nội dung chưa bị chỉnh sửa.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 p-2 text-[11.5px] text-rose-800">
            <ShieldAlert className="w-4 h-4 shrink-0" /> File KHÔNG khớp bản gốc đã lưu - có thể đã bị chỉnh sửa hoặc không phải bản PDF đã ký.
          </p>
        ))}
    </div>
  );
}
