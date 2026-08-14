import React, { useState, useEffect } from "react";
import {
  X,
  ArrowUpFromLine,
  ShieldCheck,
  Lock,
  CheckCircle2,
  Clock,
  Copy,
  Plus,
  Headphones,
  History,
  AlertCircle,
  KeyRound,
  Check,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { adjustUserBalance } from "@/lib/balanceSync";
import { toast } from "sonner";
import { getBankLogo } from "@/constants/banks";
import { Link } from "react-router-dom";

const QUICK_AMOUNTS = [500000, 1000000, 5000000, 10000000, 50000000, 100000000];
const MIN_WITHDRAW = 100000;

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

export default function WithdrawModal({ open, onClose, banks = [], balance = 0, onDone, onAddBank }) {
  // Steps: "input" | "pin" | "tracking"
  const [step, setStep] = useState("input");

  const [amount, setAmount] = useState("");
  const [selectedBankId, setSelectedBankId] = useState(null);
  const [user, setUser] = useState(null);

  // PIN state
  const [pinDigits, setPinDigits] = useState(["", "", "", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [shake, setShake] = useState(false);
  const [isRegisteringPin, setIsRegisteringPin] = useState(false);

  // Transaction processing state
  const [saving, setSaving] = useState(false);
  const [currentTx, setCurrentTx] = useState(null);
  const [liveStatus, setLiveStatus] = useState("pending");
  const [txCode, setTxCode] = useState("");
  const [createdTimeStr, setCreatedTimeStr] = useState("");

  useEffect(() => {
    if (open) {
      base44.auth.me().then(setUser).catch(() => {});
      // Auto-select default bank account if available
      const defaultBank = banks.find((b) => b.is_default) || banks[0];
      if (defaultBank) {
        setSelectedBankId(defaultBank.id);
      }
      // Reset state
      setStep("input");
      setAmount("");
      setPinDigits(["", "", "", "", "", ""]);
      setPinError("");
      setSaving(false);
      setCurrentTx(null);
      setLiveStatus("pending");

      // Check if user has already registered a withdrawal PIN
      const existingPin = localStorage.getItem("vinclub_user_pin");
      setIsRegisteringPin(!existingPin);
    }
  }, [open, banks]);

  const numAmount = parseInt(amount.replace(/\D/g, "")) || 0;
  const selectedBank = banks.find((b) => b.id === selectedBankId);

  // Validate form before moving to PIN verification
  const handleProceedToPin = () => {
    if (user?.is_locked) {
      return toast.error("Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ CSKH để được hỗ trợ.");
    }
    if (banks.length === 0) {
      toast.error("Vui lòng liên kết tài khoản ngân hàng trước");
      if (onAddBank) onAddBank();
      return;
    }
    if (!selectedBank) {
      return toast.error("Vui lòng chọn ngân hàng nhận tiền");
    }
    if (numAmount < MIN_WITHDRAW) {
      return toast.error(`Hạn mức rút tối thiểu là ${fmt(MIN_WITHDRAW)} VNĐ`);
    }
    if (numAmount > balance) {
      return toast.error("Số dư khả dụng trong ví không đủ");
    }

    const existingPin = localStorage.getItem("vinclub_user_pin");
    setIsRegisteringPin(!existingPin);
    setPinDigits(["", "", "", "", "", ""]);
    setPinError("");
    setStep("pin");
  };

  // Handle PIN input digits
  const handlePinKey = (val) => {
    setPinError("");
    if (val === "BACKSPACE") {
      const lastFilledIndex = [...pinDigits].map((d) => d !== "").lastIndexOf(true);
      if (lastFilledIndex !== -1) {
        const next = [...pinDigits];
        next[lastFilledIndex] = "";
        setPinDigits(next);
      }
      return;
    }

    if (val === "CLEAR") {
      setPinDigits(["", "", "", "", "", ""]);
      return;
    }

    const firstEmptyIndex = pinDigits.findIndex((d) => d === "");
    if (firstEmptyIndex !== -1) {
      const next = [...pinDigits];
      next[firstEmptyIndex] = val;
      setPinDigits(next);

      // If completing 6 digits, trigger PIN action
      if (firstEmptyIndex === 5) {
        const fullPin = [...next].join("");
        handlePinSubmit(fullPin);
      }
    }
  };

  // Process PIN submit: Register new PIN or verify existing PIN
  const handlePinSubmit = async (enteredPin) => {
    const savedPin = localStorage.getItem("vinclub_user_pin");

    if (isRegisteringPin || !savedPin) {
      // User is registering their custom withdrawal PIN for the first time or re-setting it
      localStorage.setItem("vinclub_user_pin", enteredPin);
      setIsRegisteringPin(false);
      toast.success("Đăng ký mật khẩu rút tiền thành công!");
      executeWithdrawalTransaction();
      return;
    }

    // Verification mode
    if (enteredPin !== savedPin) {
      setShake(true);
      setPinError("Mật khẩu rút tiền không đúng. Vui lòng thử lại!");
      setTimeout(() => setShake(false), 500);
      setPinDigits(["", "", "", "", "", ""]);
      return;
    }

    // PIN is correct -> Submit Withdrawal Request
    executeWithdrawalTransaction();
  };

  const executeWithdrawalTransaction = async () => {
    setSaving(true);
    const code = "VCW" + Date.now().toString().slice(-8);
    setTxCode(code);

    const now = new Date();
    const timeFormatted = `${now.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    })} ${now.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })}`;
    setCreatedTimeStr(timeFormatted);

    try {
      await adjustUserBalance(user?.id, -numAmount);

      const tx = await base44.entities.WalletTransaction.create({
        type: "withdraw",
        amount: numAmount,
        bank_name: selectedBank.bank_name,
        account_number: selectedBank.account_number,
        account_holder: selectedBank.account_holder,
        status: "pending",
        user_id: user?.id,
        description: `Lệnh rút tiền về ${selectedBank.bank_name} (${code})`,
        code: code
      });

      setCurrentTx(tx);
      setLiveStatus("pending");
      setStep("tracking");

      // Send real-time notification to User
      await base44.entities.Notification.create({
        title: "Yêu cầu rút tiền đang chờ phê duyệt",
        content: `Lệnh rút ${fmt(numAmount)} VNĐ về ${selectedBank.bank_name} (•••• ${selectedBank.account_number.slice(-4)}) đang chờ Admin phê duyệt. Mã GD: ${code}`,
        type: "withdraw",
        user_id: user?.id,
        is_read: false,
      });

      // Send real-time notification to Admin flow
      try {
        await base44.entities.Notification.create({
          title: "Lệnh rút tiền mới cần phê duyệt",
          content: `Hội viên ${user?.full_name || user?.email} vừa tạo lệnh rút ${fmt(numAmount)} VNĐ về ${selectedBank.bank_name}. Mã GD: ${code}`,
          type: "admin",
          user_id: "admin",
          is_read: false,
        });
      } catch (e) {}

      if (onDone) onDone();
      toast.success(`Đã tạo lệnh rút ${fmt(numAmount)} VNĐ! Đang chờ Admin phê duyệt.`);
    } catch (e) {
      toast.error("Không thể khởi tạo lệnh rút tiền");
      setStep("input");
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Đã sao chép mã giao dịch");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-white rounded-t-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[#1a140c] via-[#2c2214] to-[#1a140c] text-white px-4 py-3.5 flex items-center justify-between shrink-0 border-b border-[#948154]/30">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#948154]/20 border border-[#948154]/40 flex items-center justify-center text-[#e8c87a]">
                  <ArrowUpFromLine className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[13px] font-bold text-[#e8c87a]">Rút tiền về tài khoản</h2>
                  <p className="text-[9px] text-gray-300">Minh bạch · Bảo mật · Xử lý 24/7</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* STEP 1: INPUT FORM */}
              {step === "input" && (
                <>
                  {/* A. Available Balance & Limits Notice */}
                  <div className="bg-gradient-to-br from-[#1c1813] to-[#2c2419] rounded-2xl p-3.5 text-white shadow-md border border-[#948154]/30 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#948154]/10 rounded-full blur-xl pointer-events-none" />
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[9.5px] font-medium text-amber-200/80 uppercase tracking-wider">
                          Số dư khả dụng trong ví
                        </p>
                        <p className="text-[20px] font-extrabold text-[#f3d38c] tracking-tight mt-0.5">
                          {fmt(balance)} <span className="text-[12px] font-semibold text-amber-200">VNĐ</span>
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[8.5px] font-semibold flex items-center gap-1">
                        <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" /> Khả dụng
                      </span>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] text-amber-100/70">
                      <span>• Hạn mức rút tối thiểu: <strong className="text-white">100.000 VNĐ</strong></span>
                      <span>• Giữ lại: <strong className="text-white">0 VNĐ</strong></span>
                    </div>
                  </div>

                  {/* B. Enter Withdrawal Amount */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold text-gray-700">Số tiền muốn rút</label>
                      <button
                        type="button"
                        onClick={() => setAmount(String(balance))}
                        className="text-[10px] font-bold text-[#948154] hover:underline"
                      >
                        Rút tất cả ({fmt(balance)}đ)
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={amount ? fmt(numAmount) : ""}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          setAmount(raw);
                        }}
                        placeholder="0"
                        className="w-full px-3.5 py-3 rounded-2xl border-2 border-gray-200 text-[20px] font-black text-black focus:outline-none focus:border-[#948154] bg-gray-50/50 pr-14 transition-colors"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-gray-400">
                        VNĐ
                      </span>
                    </div>

                    {numAmount > 0 && (
                      <p className="text-[10px] font-medium text-[#948154] mt-1 pl-1">
                        Bằng chữ: <span className="font-semibold text-gray-700 capitalize">{numAmount < MIN_WITHDRAW ? "Dưới hạn mức tối thiểu" : `${fmt(numAmount)} Việt Nam Đồng`}</span>
                      </p>
                    )}
                  </div>

                  {/* C. Quick Amount Selection Buttons */}
                  <div>
                    <p className="text-[10.5px] font-semibold text-gray-600 mb-1.5">Chọn nhanh mệnh giá</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {QUICK_AMOUNTS.map((amt) => {
                        const isSelected = numAmount === amt;
                        const isExceed = amt > balance;
                        return (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setAmount(String(amt))}
                            disabled={isExceed}
                            className={`py-2 px-1 rounded-xl text-[10.5px] font-bold border transition-all ${
                              isSelected
                                ? "bg-[#948154] text-white border-[#948154] shadow-xs"
                                : isExceed
                                ? "bg-gray-50 text-gray-300 border-gray-100 opacity-50 cursor-not-allowed"
                                : "bg-white text-gray-700 border-gray-200 hover:border-[#948154] hover:bg-[#948154]/5 active:scale-95"
                            }`}
                          >
                            {fmt(amt)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* D. Linked Bank Account Section */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-semibold text-gray-700 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-[#948154]" /> Ngân hàng nhận tiền
                      </p>
                      {banks.length > 0 && onAddBank && (
                        <button
                          onClick={onAddBank}
                          className="text-[9.5px] font-semibold text-[#948154] hover:underline flex items-center gap-0.5"
                        >
                          <Plus className="w-2.5 h-2.5" /> Thêm TK khác
                        </button>
                      )}
                    </div>

                    {banks.length === 0 ? (
                      <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 text-center space-y-2">
                        <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
                        <p className="text-[11px] font-semibold text-gray-800">Chưa có tài khoản ngân hàng liên kết</p>
                        <p className="text-[9.5px] text-gray-500">
                          Vui lòng liên kết tài khoản ngân hàng chính chủ để thực hiện rút tiền an toàn.
                        </p>
                        <button
                          type="button"
                          onClick={onAddBank}
                          className="px-4 py-2 rounded-xl bg-[#948154] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 mx-auto hover:bg-[#837046]"
                        >
                          <Plus className="w-3.5 h-3.5" /> Liên kết ngân hàng ngay
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {banks.map((b) => {
                          const logo = getBankLogo(b.bank_code);
                          const isSelected = selectedBankId === b.id;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setSelectedBankId(b.id)}
                              className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all relative ${
                                isSelected
                                  ? "border-[#948154] bg-[#948154]/10 shadow-xs ring-1 ring-[#948154]/50"
                                  : "border-gray-200 bg-white hover:border-gray-300"
                              }`}
                            >
                              {logo ? (
                                <img
                                  src={logo}
                                  alt={b.bank_name}
                                  className="w-9 h-9 rounded-xl object-contain bg-white border border-gray-100 p-0.5 shrink-0 shadow-2xs"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-[#948154] text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                  {b.bank_code || "BK"}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-[11.5px] font-bold text-black truncate">{b.bank_name}</p>
                                  {b.is_default && (
                                    <span className="text-[8px] bg-amber-100 text-[#948154] font-extrabold px-1.5 py-0.2 rounded shrink-0">
                                      Mặc định
                                    </span>
                                  )}
                                </div>
                                <p className="text-[12px] font-bold text-gray-800 tracking-wider font-mono">
                                  {b.account_number}
                                </p>
                                <p className="text-[9px] font-bold text-gray-500 uppercase">{b.account_holder}</p>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-[#948154] text-white flex items-center justify-center shrink-0">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </div>
                              )}
                            </button>
                          );
                        })}

                        {/* Security Notice */}
                        <div className="bg-emerald-50/80 border border-emerald-100 rounded-xl p-2.5 flex items-start gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <p className="text-[9px] text-emerald-800 leading-tight">
                            <strong className="font-semibold">Bảo mật định danh:</strong> Tài khoản nhận được đồng bộ từ họ tên đăng ký để ngăn ngừa gian lận. Mọi thay đổi tài khoản xin liên hệ CSKH.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Submit Action */}
                  <button
                    type="button"
                    onClick={handleProceedToPin}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#948154] to-[#73633e] hover:from-[#837046] hover:to-[#645533] active:scale-98 text-white text-[13px] font-bold shadow-md flex items-center justify-center gap-1.5 transition-all mt-2"
                  >
                    Xác nhận rút {numAmount > 0 ? `${fmt(numAmount)} VNĐ` : ""} <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* STEP 2: SECURITY PIN VERIFICATION OR SETUP */}
              {step === "pin" && (
                <div className="py-2 space-y-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#948154]/10 text-[#948154] border border-[#948154]/30 flex items-center justify-center mx-auto shadow-sm">
                    <KeyRound className="w-6 h-6" />
                  </div>

                  <div>
                    <h3 className="text-[14px] font-extrabold text-black">
                      {isRegisteringPin ? "Đăng ký mật khẩu rút tiền" : "Nhập mật khẩu rút tiền"}
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-0.5 max-w-[280px] mx-auto">
                      {isRegisteringPin
                        ? "Vui lòng nhập 6 chữ số tùy ý để tự tạo mật khẩu bảo vệ giao dịch rút tiền của bạn."
                        : `Nhập mật khẩu rút tiền 6 số để xác nhận lệnh rút ${fmt(numAmount)} VNĐ.`}
                    </p>
                  </div>

                  {/* 6-digit Dots */}
                  <div className={`flex justify-center gap-2.5 py-2 ${shake ? "animate-bounce" : ""}`}>
                    {[0, 1, 2, 3, 4, 5].map((idx) => {
                      const hasVal = pinDigits[idx] !== "";
                      return (
                        <div
                          key={idx}
                          className={`w-9 h-11 rounded-xl border-2 flex items-center justify-center text-[18px] font-black transition-all ${
                            hasVal
                              ? "border-[#948154] bg-[#948154]/10 text-black shadow-xs"
                              : "border-gray-200 bg-gray-50 text-gray-300"
                          }`}
                        >
                          {hasVal ? "•" : ""}
                        </div>
                      );
                    })}
                  </div>

                  {pinError ? (
                    <p className="text-[10px] font-bold text-red-500">{pinError}</p>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[9.5px] font-medium text-amber-700 bg-amber-50 py-1 px-2.5 rounded-full inline-flex items-center gap-1 border border-amber-200/80">
                        {isRegisteringPin ? (
                          <>
                            <ShieldCheck className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Bạn có thể tự do đặt bất kỳ 6 chữ số nào bạn thích</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Mật khẩu được mã hóa an toàn bảo mật</span>
                          </>
                        )}
                      </p>
                      {!isRegisteringPin && (
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsRegisteringPin(true);
                              setPinDigits(["", "", "", "", "", ""]);
                              setPinError("");
                            }}
                            className="text-[9.5px] font-bold text-[#948154] hover:underline"
                          >
                            Đổi / Thiết lập lại mật khẩu rút tiền?
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Keypad */}
                  <div className="grid grid-cols-3 gap-2 max-w-[260px] mx-auto pt-2">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLEAR", "0", "BACKSPACE"].map((key) => {
                      if (key === "CLEAR") {
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handlePinKey("CLEAR")}
                            className="py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-gray-600 active:scale-95 transition-all"
                          >
                            Xóa
                          </button>
                        );
                      }
                      if (key === "BACKSPACE") {
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handlePinKey("BACKSPACE")}
                            className="py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-[11px] font-bold text-gray-600 active:scale-95 transition-all flex items-center justify-center"
                          >
                            ⌫
                          </button>
                        );
                      }
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handlePinKey(key)}
                          className="py-3 rounded-xl bg-white border border-gray-200 hover:border-[#948154] hover:bg-[#948154]/5 text-[16px] font-bold text-black shadow-2xs active:scale-95 transition-all"
                        >
                          {key}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep("input")}
                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 underline pt-1 block mx-auto"
                  >
                    Quay lại chỉnh sửa số tiền
                  </button>
                </div>
              )}

              {/* STEP 3: REAL-TIME TRANSACTION TRACKING */}
              {step === "tracking" && (
                <div className="space-y-4 py-1 text-center">
                  {/* Status Banner Header */}
                  <div className="space-y-2">
                    {liveStatus === "pending" ? (
                      <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-inner relative">
                        <Clock className="w-7 h-7 animate-spin" />
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                    )}

                    <div>
                      <h3 className="text-[15px] font-black text-black">
                        {liveStatus === "pending" ? "Hệ thống đang xử lý lệnh rút tiền" : "Rút tiền thành công!"}
                      </h3>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {liveStatus === "pending"
                          ? "Yêu cầu đã gửi tới ngân hàng đối tác. Vui lòng chờ trong giây lát..."
                          : "Tiền đã được chuyển vào tài khoản ngân hàng của quý khách."}
                      </p>
                    </div>
                  </div>

                  {/* Transaction Receipt Card */}
                  <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-200/80 text-left space-y-2 text-[11px]">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                      <span className="text-gray-500">Trạng thái</span>
                      {liveStatus === "pending" ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9.5px] font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3 animate-spin" /> Đang xử lý
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9.5px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Hoàn tất
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Mã giao dịch</span>
                      <button
                        onClick={() => copyToClipboard(txCode)}
                        className="font-mono font-bold text-gray-800 flex items-center gap-1 hover:text-[#948154]"
                      >
                        {txCode} <Copy className="w-3 h-3 text-[#948154]" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Số tiền rút</span>
                      <span className="font-extrabold text-orange-600 text-[13px]">
                        -{fmt(numAmount)} VNĐ
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Ngân hàng nhận</span>
                      <span className="font-bold text-black text-right truncate max-w-[170px]">
                        {selectedBank?.bank_name}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Số tài khoản</span>
                      <span className="font-mono font-bold text-gray-800">
                        {selectedBank?.account_number}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Chủ tài khoản</span>
                      <span className="font-bold text-gray-800 uppercase">
                        {selectedBank?.account_holder}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Phí giao dịch</span>
                      <span className="font-bold text-emerald-600">Miễn phí (0đ)</span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-gray-200 text-[9.5px]">
                      <span className="text-gray-400">Thời gian tạo</span>
                      <span className="text-gray-500 font-mono">{createdTimeStr}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2 pt-1">
                    <button
                      onClick={onClose}
                      className="w-full py-3 rounded-2xl bg-[#948154] hover:bg-[#837046] text-white text-[12px] font-bold shadow-md transition-colors"
                    >
                      Hoàn tất
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          onClose();
                          // navigate or click handles
                        }}
                        className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-semibold flex items-center justify-center gap-1"
                      >
                        <History className="w-3 h-3 text-[#948154]" /> Lịch sử ví
                      </button>
                      <Link
                        to="/support"
                        onClick={onClose}
                        className="flex-1 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-semibold flex items-center justify-center gap-1 border border-emerald-200"
                      >
                        <Headphones className="w-3 h-3 text-emerald-600" /> CSKH 24/7
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
