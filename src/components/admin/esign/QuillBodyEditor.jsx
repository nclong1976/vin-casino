import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { ALLOWED_COLORS } from "@/shared/docLayout";

const Quill = ReactQuill.Quill;

// ─── Biến động dạng "chip" (Embed) ────────────────────────────────────────
// Lưu trong Delta đúng dạng { insert: { variable: "user_name" } } mà bộ dàn
// trang (src/shared/docLayout) hiểu, và không gõ vỡ được giữa chừng.
const Embed = Quill.import("blots/embed");

class VariableBlot extends Embed {
  static create(value) {
    const node = super.create();
    const key = typeof value === "string" ? value : value?.variable || "";
    node.setAttribute("data-variable", key);
    node.textContent = `{{${key}}}`;
    return node;
  }

  static value(node) {
    return node.getAttribute("data-variable");
  }
}
VariableBlot.blotName = "variable";
VariableBlot.tagName = "span";
VariableBlot.className = "ql-variable-chip";

if (!Quill.imports["formats/variable"]) {
  Quill.register("formats/variable", VariableBlot);
}

/** Đúng tập định dạng mà bộ dàn trang/PDF hỗ trợ (spec 3.4). Dán từ Word tự lọc bỏ phần còn lại. */
export const EDITOR_FORMATS = ["header", "bold", "italic", "underline", "color", "align", "list", "indent", "variable"];

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline"],
  [{ color: ALLOWED_COLORS }],
  [{ align: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ indent: "-1" }, { indent: "+1" }],
  ["clean"],
];

const CHIP_STYLE = `
.ql-variable-chip { background:#948154; color:#fff; border-radius:9999px; padding:0 6px; font-size:0.85em; white-space:nowrap; }
.esign-quill .ql-container { font-family:'Noto Serif Doc','Noto Serif',serif; font-size:15px; min-height:260px; border-bottom-left-radius:10px; border-bottom-right-radius:10px; }
.esign-quill .ql-toolbar { border-top-left-radius:10px; border-top-right-radius:10px; background:#fafafa; }
.esign-quill .ql-editor { min-height:260px; line-height:1.55; }
`;

/**
 * Trình soạn phần thân văn bản (Quill, lưu Delta). Không điều khiển
 * (uncontrolled): nạp `initialDelta` khi `docKey` đổi, báo thay đổi qua
 * onChange(delta). Gõ "{{" mở danh sách biến để chèn chip.
 */
const QuillBodyEditor = forwardRef(function QuillBodyEditor({ docKey, initialDelta, onChange, variables = [] }, ref) {
  const quillRef = useRef(null);
  const wrapRef = useRef(null);
  const [menu, setMenu] = useState(null); // { index, top, left, query }

  const editor = () => quillRef.current?.getEditor?.();

  const insertVariable = useCallback((key, atIndex) => {
    const q = editor();
    if (!q || !key) return;
    const range = q.getSelection(true);
    const index = atIndex ?? range?.index ?? q.getLength() - 1;
    q.insertEmbed(index, "variable", key, "user");
    q.setSelection(index + 1, 0, "user");
  }, []);

  useImperativeHandle(ref, () => ({ insertVariable: (key) => insertVariable(key) }), [insertVariable]);

  const modules = useMemo(() => ({ toolbar: TOOLBAR, clipboard: { matchVisual: false } }), []);

  const handleChange = (_html, _delta, source, ed) => {
    onChange?.(JSON.parse(JSON.stringify(ed.getContents())));
    if (source !== "user") return;
    const q = editor();
    const sel = q?.getSelection();
    if (!sel) return;
    const before = q.getText(Math.max(0, sel.index - 2), 2);
    if (before === "{{") {
      const bounds = q.getBounds(sel.index);
      setMenu({ index: sel.index, top: bounds.bottom + 42, left: Math.min(bounds.left + 12, 260) });
    } else if (menu && sel.index < menu.index) {
      setMenu(null);
    }
  };

  const pickFromMenu = (key) => {
    const q = editor();
    if (!q || !menu) return;
    q.deleteText(menu.index - 2, 2, "user");
    insertVariable(key, menu.index - 2);
    setMenu(null);
  };

  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  return (
    <div ref={wrapRef} className="esign-quill relative bg-white rounded-[10px]">
      <style>{CHIP_STYLE}</style>
      <ReactQuill key={docKey} ref={quillRef} theme="snow" defaultValue={initialDelta} onChange={handleChange} modules={modules} formats={EDITOR_FORMATS} />
      {menu && (
        <div className="absolute z-20 w-60 max-h-56 overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200 py-1" style={{ top: menu.top, left: menu.left }} role="listbox" aria-label="Chèn biến">
          {variables.length === 0 && <p className="px-3 py-2 text-[11px] text-gray-400">Chưa có biến</p>}
          {variables.map((v) => (
            <button key={v.key} type="button" role="option" aria-selected="false" onClick={() => pickFromMenu(v.key)} className="w-full text-left px-3 py-1.5 hover:bg-[#948154]/10">
              <span className="text-[11.5px] font-semibold text-gray-800">{v.label}</span>
              <span className="block text-[10px] text-gray-400 font-mono">{`{{${v.key}}}`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default QuillBodyEditor;
