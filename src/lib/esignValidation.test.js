import { describe, it, expect } from "vitest";
import { validateLetterhead, validateTemplate, validateVariableDefinitions } from "./esignValidation";

describe("validateLetterhead", () => {
  it("requires org name, issuer name, signature and seal", () => {
    expect(validateLetterhead({ name: "", header: {}, issuer: {} }).errors).toHaveLength(5);
    expect(
      validateLetterhead({ name: "Khung", header: { org_name: "VinClub" }, issuer: { name: "A", signature_url: "s", seal_url: "d" } }).errors,
    ).toEqual([]);
  });
});

describe("validateVariableDefinitions", () => {
  it("rejects bad, duplicate and system keys", () => {
    expect(validateVariableDefinitions([{ key: "ok_key" }])).toEqual([]);
    expect(validateVariableDefinitions([{ key: "1abc" }])[0]).toContain("không hợp lệ");
    expect(validateVariableDefinitions([{ key: "user_name" }])[0]).toContain("trùng biến hệ thống");
    expect(validateVariableDefinitions([{ key: "a" }, { key: "A" }])[0]).toContain("2 lần");
  });
});

describe("validateTemplate", () => {
  const base = {
    name: "Mẫu",
    title_template: "Thông báo {{subject}}",
    body_delta: { ops: [{ insert: "Kính gửi " }, { insert: { variable: "user_name" } }, { insert: " " }, { insert: { variable: "notice" } }, { insert: "\n" }] },
    variables: [
      { key: "subject", type: "text" },
      { key: "notice", type: "richtext" },
    ],
  };

  it("accepts a consistent template", () => {
    expect(validateTemplate(base)).toEqual({ errors: [], warnings: [] });
  });

  it("flags undeclared and unused variables", () => {
    const r = validateTemplate({ ...base, variables: [{ key: "subject" }, { key: "unused" }] });
    expect(r.errors).toEqual(['Biến "{{notice}}" được dùng nhưng chưa khai báo']);
    expect(r.warnings[0]).toContain('"unused"');
  });

  it("forbids richtext in the title and a signing template without recipient slot", () => {
    const r = validateTemplate({
      ...base,
      title_template: "{{notice}}",
      layout: { slots: [{ id: "issuer", role: "issuer" }] },
    });
    expect(r.errors).toContain("Tiêu đề không dùng được biến kiểu văn bản nhiều dòng (richtext)");
    expect(r.errors).toContain("Mẫu yêu cầu ký nhưng không có khung ký của người nhận");
  });

  it("reports page overflow and unsupported characters from the preview", () => {
    const r = validateTemplate(base, { exceedsMaxPages: true, unsupportedChars: ["中"] });
    expect(r.errors).toContain("Văn bản dài quá 10 trang A4");
    expect(r.warnings[0]).toContain("中");
  });
});
