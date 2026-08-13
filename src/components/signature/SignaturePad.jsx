import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { Eraser } from "lucide-react";

const SignaturePad = forwardRef(({ onChange }, ref) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useImperativeHandle(ref, () => ({ clear: () => clearCanvas() }));

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#16100b";
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
    onChange?.(canvasRef.current.toDataURL("image/png"));
  };

  const end = () => {
    drawing.current = false;
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange?.(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
  }, []);

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full h-44 rounded-xl border-2 border-dashed border-gray-300 bg-white touch-none cursor-crosshair"
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-[10px] text-gray-400">
          {hasInk ? "Đã ký" : "Vui lòng ký bên trong khung"}
        </span>
        <button
          onClick={clearCanvas}
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#948154]"
        >
          <Eraser className="w-3.5 h-3.5" /> Xóa
        </button>
      </div>
    </div>
  );
});

export default SignaturePad;