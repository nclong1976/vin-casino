#!/usr/bin/env node
/**
 * Chép bộ dàn trang dùng chung src/shared/docLayout/ sang
 * supabase/functions/_shared/docLayout/ cho các Edge Function (Deno).
 *
 *   npm run sync:shared    - ghi lại bản chép
 *   npm run check:shared   - chỉ kiểm tra (CI), báo lỗi nếu bản chép bị lệch
 *
 * Deno cần đuôi file trong import tương đối và tiền tố npm: cho gói npm, nên
 * script viết lại các import đó; phần còn lại giữ nguyên từng ký tự. Không
 * sửa tay các file trong _shared/docLayout - sửa ở src/shared/docLayout rồi
 * chạy lại script.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src/shared/docLayout");
const outDir = path.join(root, "supabase/functions/_shared/docLayout");

// Gói npm được bộ dàn trang dùng -> specifier cho Deno (khớp version trong package.json).
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const NPM_PACKAGES = ["qrcode-generator", "pdf-lib", "@pdf-lib/fontkit"];
const npmSpecifier = (name) => {
  const version = (pkg.dependencies?.[name] || pkg.devDependencies?.[name] || "").replace(/^[\^~]/, "");
  if (!version) throw new Error(`${name} không có trong package.json`);
  return `npm:${name}@${version}`;
};

const HEADER = "// FILE SINH TỰ ĐỘNG từ src/shared/docLayout bởi scripts/sync-shared.mjs - không sửa tay.\n";

function listSources(dir, base = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) return listSources(path.join(dir, entry.name), rel);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [rel] : [];
  });
}

function transform(code) {
  return (
    HEADER +
    code
      .replace(/(from\s+["'])(\.{1,2}\/[^"']+?)(["'])/g, (m, a, spec, b) => (spec.endsWith(".ts") ? m : `${a}${spec}.ts${b}`))
      .replace(/(from\s+["'])([^"'.][^"']*)(["'])/g, (m, a, spec, b) => (NPM_PACKAGES.includes(spec) ? `${a}${npmSpecifier(spec)}${b}` : m))
  );
}

const check = process.argv.includes("--check");
const expected = new Map(listSources(srcDir).map((rel) => [rel, transform(fs.readFileSync(path.join(srcDir, rel), "utf8"))]));
const existing = fs.existsSync(outDir) ? listSources(outDir) : [];
const problems = [];

for (const [rel, content] of expected) {
  const target = path.join(outDir, rel);
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  if (current === content) continue;
  if (check) problems.push(`${current === null ? "thiếu" : "lệch"}: ${rel}`);
  else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}
for (const rel of existing) {
  if (expected.has(rel)) continue;
  if (check) problems.push(`thừa: ${rel}`);
  else fs.rmSync(path.join(outDir, rel));
}

if (check && problems.length) {
  console.error(`supabase/functions/_shared/docLayout không khớp src/shared/docLayout:\n  ${problems.join("\n  ")}\nChạy: npm run sync:shared`);
  process.exit(1);
}
console.log(check ? `_shared/docLayout khớp (${expected.size} file)` : `đã đồng bộ ${expected.size} file vào ${path.relative(root, outDir)}`);
