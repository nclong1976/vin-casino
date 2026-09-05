import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CreditCard, Wallet, QrCode, Check, ChevronRight, ChevronLeft, PenTool, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { adjustUserBalanceStrict } from "@/lib/balanceSync";
import { useAuth } from "@/lib/AuthContext";
import ContractDocument from "@/components/projects/ContractDocument";
import SignaturePicker from "@/components/signature/SignaturePicker";
import {
  TERM_RATE_LABEL,
  getProjectTermUnit,
  getProjectTermDurationDisplayValue,
  calculateExpectedInterest,
  isDailyAccrualCategory as checkIsDailyAccrualCategory,
  getCycleDays,
  formatDailyRatePercent,
} from "@/lib/investmentTerms";

const parseAmount = (str) => parseInt(String(str).replace(/[^\d]/g, "")) || 0;
const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const steps = ["Số tiền", "Thanh toán", "Hợp đồng", "Ký xác nhận"];

export default function DepositModal({ project, onClose }) {
  const navigate = useNavigate();

  const min = useMemo(() => parseAmount(project?.minAmount), [project]);
  // Lãi suất TOÀN KỲ (%) - áp 1 lần cho toàn bộ kỳ hạn, không còn là lãi
  // suất theo phút/giờ/ngày phải nhân thêm với số đơn vị kỳ hạn.
  const totalTermInterestRate = useMemo(() => Number(project?.total_term_interest_rate) || 0, [project]);

  // Khớp đúng điều kiện category trong compute_transaction_interest()
  // (Postgres) - 2 hạng mục này tự chuyển sang trả lãi hàng ngày.
  const isDailyAccrualCategory = useMemo(
    () => checkIsDailyAccrualCategory(project?.category),
    [project]
  );
  const dailyRateLabel = useMemo(
    () => formatDailyRatePercent(totalTermInterestRate, getCycleDays(project)),
    [totalTermInterestRate, project]
  );

  const termUnit = useMemo(() => getProjectTermUnit(project), [project]);
  const isMinute = termUnit === "phút";
  const isHourly = termUnit === "giờ";
  const isDaily = termUnit === "ngày";

  // Chỉ dùng để HIỂN THỊ "Kỳ hạn: X giờ/ngày/phút" và lưu snapshot lịch sử
  // trên hợp đồng - không còn dùng để tính lãi (xem calculateExpectedInterest).
  const durationVal = useMemo(() => getProjectTermDurationDisplayValue(project), [project]);

  const days = useMemo(() => (isDaily ? durationVal : Math.round(durationVal / 1440) || 1), [isDaily, durationVal]);
  const hours = useMemo(() => (isHourly ? durationVal : Math.round(durationVal / 60) || 1), [isHourly, durationVal]);

  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState(min);
  const [method, setMethod] = useState("wallet");
  const [signature, setSignature] = useState(null);
  const [done, setDone] = useState(false);

  // Auto balance check & redirect states
  const [userBalance, setUserBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [countdown, setCountdown] = useState(3);

  // Auto fetch real-time balance when opening the project
  useEffect(() => {
    if (!project || !user) return;
    let isMounted = true;
    setLoadingBalance(true);

    async function loadBalance() {
      try {
        if (isMounted) {
          const currentTotal = Number(user.balance || 0);

          setUserBalance(currentTotal);

          // Auto detect if balance is less than required minimum investment
          const requiredMin = parseAmount(project?.minAmount);
          if (currentTotal < requiredMin) {
            setIsRedirecting(true);
            toast.warning(
              `Số dư (${fmt(currentTotal)} VNĐ) không đủ định mức tối thiểu (${fmt(requiredMin)} VNĐ). Hệ thống đang điều hướng đến trang Nạp tiền...`,
              { duration: 4000 }
            );
          }
        }
      } catch (err) {
        console.error("Balance check error:", err);
      } finally {
        if (isMounted) setLoadingBalance(false);
      }
    }

    loadBalance();

    return () => {
      isMounted = false;
    };
  }, [project, user]);

  // Countdown timer for smooth auto-redirection
  useEffect(() => {
    let timer;
    if (isRedirecting && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (isRedirecting && countdown <= 0) {
      handleGoToDeposit();
    }
    return () => clearInterval(timer);
  }, [isRedirecting, countdown]);

  const handleGoToDeposit = () => {
    onClose?.();
    navigate("/profile?deposit=true");
  };

  const dynamicMethods = [
    {
      id: "wallet",
      label: "Ví VinClub",
      desc: loadingBalance ? "Đang cập nhật số dư..." : `Số dư khả dụng: ${fmt(userBalance)} VNĐ`,
      icon: Wallet,
    },
    { id: "bank", label: "Thẻ ngân hàng", desc: "Visa / Mastercard", icon: CreditCard },
    { id: "qr", label: "Chuyển khoản QR", desc: "Vietcombank · Techcombank", icon: QrCode },
  ];

  // Refactor calculateExpectedInterest(): render real-time mỗi khi amount
  // đổi (kể cả qua 3 nút Tối thiểu 1x/Gấp đôi 2x/Gấp năm 5x, vì chúng chỉ
  // setAmount rồi useMemo này tự tính lại).
  const profit = useMemo(
    () => calculateExpectedInterest(amount, totalTermInterestRate),
    [amount, totalTermInterestRate]
  );
  const total = amount + profit;
  const valid = amount >= min && amount > 0;
  const selectedMethod = dynamicMethods.find((m) => m.id === method);

  const quick = [
    { label: "Tối thiểu (1x)", val: min },
    { label: "Gấp đôi (2x)", val: min * 2 },
    { label: "Gấp năm (5x)", val: min * 5 },
  ];

  const next = () => {
    if (step === 0) {
      if (user?.is_locked) {
        toast.error("Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ CSKH để được hỗ trợ.");
        return;
      }
      if (!valid) {
        toast.error(`Số tiền tối thiểu là ${fmt(min)} VNĐ`);
        return;
      }
      if (userBalance < amount) {
        toast.warning(
          `Số dư ví (${fmt(userBalance)} VNĐ) không đủ ${fmt(amount)} VNĐ. Hệ thống đang chuyển hướng đến trang Nạp tiền...`
        );
        setIsRedirecting(true);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleConfirm = async () => {
    if (!signature?.content) {
      toast.error("Vui lòng ký hợp đồng để xác nhận");
      return;
    }

    if (userBalance < amount) {
      toast.warning(`Số dư ví không đủ ${fmt(amount)} VNĐ. Đang chuyển hướng đến nạp tiền...`);
      setIsRedirecting(true);
      return;
    }

    try {
      // Trừ tiền qua adjustUserBalanceStrict() (chỉ tin RPC nguyên tử, có
      // xác nhận thật từ Postgres) - trước đây dùng adjustUserBalance()
      // (có await nhưng KHÔNG kiểm tra kết quả trả về), đường dự phòng của
      // hàm đó luôn trả về "coi như thành công" ngay cả khi Postgres từ
      // chối ghi, khiến hợp đồng vẫn được lập và báo thành công dù tiền
      // chưa hề bị trừ.
      if (user?.id) {
        const result = await adjustUserBalanceStrict(user.id, -amount);
        if (!result) {
          toast.error("Không thể trừ tiền để đầu tư, vui lòng thử lại!");
          return;
        }
        setUserBalance(result.balance);
      }

      await base44.entities.Transaction.create({
        user_id: user?.id,
        user_email: user?.email,
        project_id: project.id,
        project_title: project.title,
        project_name: project.title,
        amount,
        method: selectedMethod.label,
        // rate/profit/total/matures_at gửi lên chỉ mang tính tham khảo -
        // trigger compute_transaction_interest() ở Postgres LUÔN tính lại
        // từ investment_projects.total_term_interest_rate theo project_id,
        // client không còn khả năng tự khai lãi suất/lãi dự kiến sai lệch.
        rate: totalTermInterestRate,
        duration_days: days,
        profit,
        total,
        status: "completed",
        contract_status: "approved",
        signature_type: signature.type,
        signature_content: signature.content,
        created_date: new Date().toISOString()
      });

      await base44.entities.WalletTransaction.create({
        user_id: user?.id,
        type: "investment",
        amount,
        status: "completed",
        description: `Đầu tư dự án ${project.title}`,
        created_date: new Date().toISOString()
      });

      if (user?.id) {
        await base44.entities.Message.create({
          sender: "admin",
          conversation_id: user.id,
          user_id: user.id,
          content: `Dạ em xin xác nhận giao dịch đầu tư của Quý khách đã hoàn tất ạ.\n\nDự án: ${project.title}\nSố tiền: ${fmt(amount)} VNĐ\nPhương thức: ${selectedMethod.label}\nLãi dự kiến: ${fmt(profit)} VNĐ\nTổng nhận: ${fmt(total)} VNĐ\n\nHợp đồng đã được ký và lưu. Cảm ơn Quý khách đã tin tưởng đầu tư cùng VinClub!`,
          attachments: [],
        });
      }

      toast.success(
        `Đã ký hợp đồng và ghi nhận gửi ${fmt(amount)} VNĐ vào "${project.title}"`
      );
      setDone(true);
    } catch (e) {
      toast.error("Không thể ghi nhận giao dịch");
    }
  };

  return (
    <AnimatePresence>
      {project && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 border-none outline-none font-heading"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[400px] bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col border-none outline-none"
          >
            {/* Header image */}
            <div className="relative h-[140px] overflow-hidden shrink-0">
              <img src={project.image} alt={project.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white hover:bg-black/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-3 left-4 right-4">
                <span className="inline-block px-2 py-0.5 rounded bg-black/50 backdrop-blur text-[9px] font-semibold tracking-wider text-amber-300 mb-1">
                  {project.category}
                </span>
                <h2 className="text-[15px] font-bold text-white leading-tight">{project.title}</h2>
              </div>
            </div>

            {done ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 flex flex-col items-center text-center shrink-0"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
                  className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4"
                >
                  <CheckCircle2 className="w-9 h-9 text-green-500" />
                </motion.div>
                <h3 className="text-[16px] font-bold text-black mb-1">Giao dịch hoàn tất!</h3>
                <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
                  Đã ký hợp đồng và ghi nhận đầu tư {fmt(amount)} VNĐ vào "{project.title}"
                </p>
                <div className="w-full rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-1.5 text-[11px] mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Số tiền:</span>
                    <span className="font-semibold text-black">{fmt(amount)} VNĐ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Lãi dự kiến:</span>
                    <span className="font-semibold text-[#D32F2F]">{fmt(profit)} VNĐ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tổng nhận:</span>
                    <span className="font-bold text-black">{fmt(total)} VNĐ</span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[12px] font-semibold cursor-pointer"
                >
                  Hoàn tất
                </button>
              </motion.div>
            ) : (
              <>
                {/* Step indicator */}
                <div className="flex items-center justify-center gap-1.5 py-2.5 border-b border-gray-100 shrink-0 bg-gray-50/50">
                  {steps.map((s, i) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <span
                        className={`flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold transition ${
                          i <= step ? "bg-[#948154] text-white" : "bg-gray-200 text-gray-400"
                        }`}
                      >
                        {i < step ? <Check className="w-3 h-3" /> : i + 1}
                      </span>
                      <span
                        className={`text-[10px] font-medium ${
                          i <= step ? "text-[#948154]" : "text-gray-400"
                        }`}
                      >
                        {s}
                      </span>
                      {i < steps.length - 1 && (
                        <span className={`w-5 h-[1.5px] ${i < step ? "bg-[#948154]" : "bg-gray-200"}`} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Body */}
                <div className="p-4 space-y-3.5 overflow-y-auto">
                  {/* AUTO BALANCE WARNING & REDIRECT BANNER */}
                  {isRedirecting && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2 shadow-sm"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-lg bg-amber-500 text-white shrink-0 mt-0.5 animate-pulse">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-[12px] font-bold text-amber-900 uppercase tracking-wide">
                            Số Dư Khả Dụng Không Đủ
                          </h4>
                          <p className="text-[10.5px] text-amber-800 leading-snug mt-0.5">
                            Số dư ví: <strong className="text-black font-mono font-bold">{fmt(userBalance)} VNĐ</strong> ·
                            Cần tối thiểu: <strong className="text-amber-900 font-mono font-bold">{fmt(min)} VNĐ</strong>
                          </p>
                        </div>
                      </div>

                      <div className="p-2 rounded-xl bg-white/90 border border-amber-200 text-[10px] text-gray-700 flex items-center justify-between">
                        <span>Tự động chuyển đến <strong>Nạp tiền</strong>:</span>
                        <span className="font-mono font-bold text-amber-600 text-xs px-2 py-0.5 rounded bg-amber-100">
                          {countdown}s
                        </span>
                      </div>

                      <button
                        onClick={handleGoToDeposit}
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f2ca50] to-[#b38822] hover:from-[#f2ca50] hover:to-[#d4af37] text-[#3c2f00] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow active:scale-95 transition-transform cursor-pointer"
                      >
                        <span>NẠP TIỀN NGAY ĐỂ ĐẦU TƯ</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}

                  {/* Real-time wallet balance preview bar */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-900/5 border border-amber-500/20 text-xs font-semibold">
                    <div className="flex items-center gap-1.5 text-gray-700">
                      <Wallet className="w-4 h-4 text-[#948154]" />
                      <span>Số dư khả dụng:</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {loadingBalance ? (
                        <RefreshCw className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                      ) : (
                        <span className="font-mono font-bold text-black text-xs">{fmt(userBalance)} VNĐ</span>
                      )}
                      {!loadingBalance && userBalance < min && (
                        <span className="px-1.5 py-0.2 rounded bg-red-100 text-red-600 text-[9px] font-bold">Thếu</span>
                      )}
                    </div>
                  </div>

                  {/* Step 1: Amount */}
                  {step === 0 && (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-3.5"
                    >
                      <div className="flex justify-between text-[11px]">
                        <div>
                          <span className="text-gray-500">{TERM_RATE_LABEL}: </span>
                          <span className="font-bold text-[#D32F2F]">{totalTermInterestRate}%</span>
                          {isDailyAccrualCategory && (
                            <span className="text-[9.5px] text-gray-400"> (~{dailyRateLabel})</span>
                          )}
                        </div>
                        <div>
                          <span className="text-gray-500">Kỳ hạn: </span>
                          <span className="font-bold text-black">
                            {isMinute ? `${durationVal} phút` : isHourly ? `${durationVal} giờ` : `${durationVal} ngày`}
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1.5">
                          <span className="text-[11px] font-semibold text-gray-700">Định mức đầu tư (VNĐ)</span>
                          <span className="text-[10px] text-gray-400">Tối thiểu: {fmt(min)} VNĐ</span>
                        </div>
                        <div className={`flex items-center gap-2 px-3 h-11 rounded-xl border ${valid ? "border-[#948154]" : "border-gray-300"}`}>
                          <CreditCard className="w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            inputMode="numeric"
                            value={fmt(amount)}
                            onChange={(e) => setAmount(parseAmount(e.target.value))}
                            className="flex-1 outline-none text-[13px] font-bold text-black bg-transparent font-mono"
                          />
                          <span className="text-[10px] text-gray-400 font-semibold">VNĐ</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {quick.map((b) => (
                          <button
                            key={b.label}
                            onClick={() => setAmount(b.val)}
                            className={`py-2 rounded-xl text-[10px] font-semibold border transition cursor-pointer ${
                              amount === b.val
                                ? "bg-[#948154] text-white border-[#948154]"
                                : "bg-white text-gray-700 border-gray-300 hover:border-[#948154]"
                            }`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>

                      <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-1">
                        <p className="text-[9px] font-bold tracking-wider text-gray-400 uppercase">DỰ TÍNH SINH LỜI SẢN PHẨM</p>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-500">Lãi dự kiến (toàn kỳ):</span>
                          <span className="font-bold text-[#D32F2F] font-mono">{fmt(profit)} VNĐ</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-500">Tổng nhận (gốc + lãi):</span>
                          <span className="font-bold text-black font-mono">{fmt(total)} VNĐ</span>
                        </div>
                        {/* VinHomes/Đầu tư nghỉ dưỡng: đúng category ở
                            compute_transaction_interest() (Postgres) tự gán
                            payout_model='DAILY_ACCRUAL' cho giao dịch tạo từ
                            đây - báo trước cách nhận tiền trước khi ký. */}
                        {isDailyAccrualCategory ? (
                          <p className="text-[9.5px] text-emerald-700 leading-snug pt-1">
                            Lãi ~{dailyRateLabel} được giải ngân vào ví mỗi ngày trong suốt kỳ hạn, vốn gốc hoàn trả cùng lãi ngày cuối khi đáo hạn.
                          </p>
                        ) : (
                          <p className="text-[9.5px] text-gray-400 leading-snug pt-1">
                            Thanh toán gốc và lãi một lần khi đáo hạn.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Payment method */}
                  {step === 1 && (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-2"
                    >
                      <p className="text-[11px] font-semibold text-gray-700 mb-1">Chọn phương thức thanh toán</p>
                      {dynamicMethods.map((m) => {
                        const Icon = m.icon;
                        const active = method === m.id;
                        return (
                          <button
                            key={m.id}
                            onClick={() => setMethod(m.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition text-left cursor-pointer ${
                              active ? "border-[#948154] bg-[#948154]/5" : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${active ? "bg-[#948154] text-white" : "bg-gray-100 text-gray-500"}`}>
                              <Icon className="w-4 h-4" />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-[12px] font-bold text-black leading-tight">{m.label}</span>
                              <span className="block text-[10px] text-gray-500 leading-tight truncate">{m.desc}</span>
                            </span>
                            <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${active ? "border-[#948154] bg-[#948154]" : "border-gray-300"}`}>
                              {active && <Check className="w-2.5 h-2.5 text-white" />}
                            </span>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}

                  {/* Step 3: Contract review */}
                  {step === 2 && (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-2"
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-[#948154] bg-[#948154]/5 rounded-xl px-2.5 py-1.5 font-medium">
                        <Check className="w-3 h-3 shrink-0" />
                        Dữ liệu giao dịch đã được tự động điền vào hợp đồng
                      </div>
                      <ContractDocument
                        project={project}
                        amount={amount}
                        method={selectedMethod.label}
                        rate={totalTermInterestRate}
                        days={days}
                        hours={hours}
                        isMinute={isMinute}
                        isHourly={isHourly}
                        durationVal={durationVal}
                        profit={profit}
                        total={total}
                        user={user}
                        signature={signature}
                        dailyRateLabel={isDailyAccrualCategory ? dailyRateLabel : null}
                      />
                    </motion.div>
                  )}

                  {/* Step 4: Signature signing */}
                  {step === 3 && (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-3"
                    >
                      <div className="text-center mb-1">
                        <div className="w-10 h-10 rounded-full bg-[#948154]/10 flex items-center justify-center mx-auto mb-1.5">
                          <PenTool className="w-5 h-5 text-[#948154]" />
                        </div>
                        <p className="text-[13px] font-bold text-black">Ký tên để xác nhận</p>
                        <p className="text-[10px] text-gray-400">
                          Ký hợp đồng (Bên B) để hoàn tất giao dịch đầu tư
                        </p>
                      </div>

                      <div className="rounded-xl bg-gray-50 border border-gray-100 p-2.5 space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Dự án:</span>
                          <span className="font-semibold text-black text-right">{project.title}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Số tiền:</span>
                          <span className="font-semibold text-black font-mono">{fmt(amount)} VNĐ</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tổng nhận:</span>
                          <span className="font-bold text-[#D32F2F] font-mono">{fmt(total)} VNĐ</span>
                        </div>
                      </div>

                      <SignaturePicker value={signature} onChange={setSignature} />

                      {signature?.content && (
                        <div className="flex items-center gap-1.5 text-[10px] text-green-600 bg-green-50 rounded-xl px-2.5 py-1.5 font-semibold">
                          <Check className="w-3 h-3 shrink-0" />
                          Đã ký — nhấn "Xác nhận hoàn tất" để ghi nhận giao dịch
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* Footer buttons */}
                <div className="flex gap-2 p-4 pt-2 border-t border-gray-100 shrink-0 bg-white">
                  <button
                    onClick={step === 0 ? onClose : back}
                    className="flex-1 py-2.5 rounded-xl border border-gray-300 bg-white text-[12px] font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    {step === 0 ? "Trở về" : (<><ChevronLeft className="w-3.5 h-3.5" /> Quay lại</>)}
                  </button>
                  {step < steps.length - 1 ? (
                    <button
                      onClick={next}
                      className="flex-1 py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[12px] font-semibold flex items-center justify-center gap-1 cursor-pointer shadow"
                    >
                      Tiếp tục <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirm}
                      className="flex-1 py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[12px] font-semibold flex items-center justify-center gap-1 cursor-pointer shadow"
                    >
                      Xác nhận hoàn tất <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
