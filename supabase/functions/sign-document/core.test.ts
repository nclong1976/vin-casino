import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { CONSENT_TEXT, SignError, inspectPng, parseSignRequest, signDocument, type DocumentForSign, type RecordArgs, type SignRepo } from "./core.ts";

// PNG 100x40 hợp lệ (IHDR thật, phần dữ liệu không cần giải mã cho kiểm tra này).
function fakePng(w: number, h: number, pad = 0): Uint8Array {
  const b = new Uint8Array(33 + pad);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const HASH = "a".repeat(64);

const baseReq = {
  document_id: "doc_1",
  idempotency_key: "k1",
  method: "draw",
  image_png_base64: b64(fakePng(600, 200)),
  consent: true,
  content_sha256: HASH,
};

class FakeRepo implements SignRepo {
  uploads: string[] = [];
  recorded: RecordArgs | null = null;
  saved: string[] = [];
  queued: string[] = [];
  constructor(public doc: DocumentForSign | null, public savedSig: string | null = null) {}
  loadDocument() {
    return Promise.resolve(this.doc);
  }
  loadSavedSignature() {
    return Promise.resolve(this.savedSig);
  }
  uploadSignature(path: string) {
    this.uploads.push(path);
    return Promise.resolve();
  }
  record(a: RecordArgs) {
    this.recorded = a;
    return Promise.resolve({ document_id: a.documentId, status: "signed", signer_name: "Nguyễn Văn A", signed_at: "2026-09-28T07:32:05Z", pdf_status: "queued", pdf_expires_at: null });
  }
  saveSignature(_u: string, dataUrl: string) {
    this.saved.push(dataUrl);
    return Promise.resolve();
  }
  queueRender(id: string) {
    this.queued.push(id);
  }
}

const pendingDoc = (patch: Partial<DocumentForSign> = {}): DocumentForSign => ({
  id: "doc_1",
  user_id: "u1",
  status: "pending",
  rendered_model: { ops: [] },
  content_sha256: HASH,
  requires_signature: true,
  ...patch,
});

Deno.test("validates the request shape and consent", () => {
  assertThrows(() => parseSignRequest({ ...baseReq, consent: false }), SignError, "CONSENT_REQUIRED");
  assertThrows(() => parseSignRequest({ ...baseReq, method: "hack" }), SignError);
  assertThrows(() => parseSignRequest({ ...baseReq, content_sha256: "xyz" }), SignError);
  assertEquals(parseSignRequest(baseReq).method, "draw");
});

Deno.test("inspects PNG header and size limits", () => {
  assertEquals(inspectPng(fakePng(600, 200)), { width: 600, height: 200 });
  assertThrows(() => inspectPng(new Uint8Array([0xff, 0xd8, 0xff, ...new Array(40).fill(0)])), SignError, "PNG");
  assertThrows(() => inspectPng(fakePng(5000, 200)), SignError);
  assertThrows(() => inspectPng(fakePng(600, 200, 600 * 1024)), SignError, "500 KB");
});

Deno.test("signs: uploads PNG, records with server consent text, queues PDF", async () => {
  const repo = new FakeRepo(pendingDoc());
  const r = await signDocument(repo, "u1", parseSignRequest({ ...baseReq, save_for_later: true }), { ip: "1.2.3.4", userAgent: "UA" });
  assertEquals(r.status, "signed");
  assertEquals(repo.uploads, ["u1/doc_1.signature.png"]);
  assertEquals(repo.recorded?.consentText, CONSENT_TEXT);
  assertEquals(repo.recorded?.ip, "1.2.3.4");
  assertEquals(repo.recorded?.meta, { idempotency_key: "k1", width: 600, height: 200 });
  assert(repo.recorded?.signatureDataUrl?.startsWith("data:image/png;base64,"));
  assertEquals(repo.saved.length, 1);
  assertEquals(repo.queued, ["doc_1"]);
});

Deno.test("replays an already-processed idempotency key instead of failing", async () => {
  const repo = new FakeRepo(pendingDoc({ status: "signed", signature_meta: { idempotency_key: "k1" }, signer_name: "A", signed_at: "t" }));
  const r = await signDocument(repo, "u1", parseSignRequest(baseReq), { ip: null, userAgent: null });
  assertEquals(r.idempotent_replay, true);
  assertEquals(repo.recorded, null);
});

Deno.test("rejects signed, revoked, changed and foreign documents", async () => {
  const ctx = { ip: null, userAgent: null };
  await assertRejects(() => signDocument(new FakeRepo(pendingDoc({ status: "signed", signature_meta: { idempotency_key: "other" } })), "u1", parseSignRequest(baseReq), ctx), SignError, "ALREADY_SIGNED");
  await assertRejects(() => signDocument(new FakeRepo(pendingDoc({ status: "revoked" })), "u1", parseSignRequest(baseReq), ctx), SignError, "REVOKED");
  await assertRejects(() => signDocument(new FakeRepo(pendingDoc({ content_sha256: "b".repeat(64) })), "u1", parseSignRequest(baseReq), ctx), SignError, "DOCUMENT_CHANGED");
  await assertRejects(() => signDocument(new FakeRepo(null), "u1", parseSignRequest(baseReq), ctx), SignError, "NOT_FOUND");
});

Deno.test("acknowledge only for documents that do not require a signature", async () => {
  const ctx = { ip: null, userAgent: null };
  const ack = parseSignRequest({ ...baseReq, method: "acknowledge", image_png_base64: null });
  await assertRejects(() => signDocument(new FakeRepo(pendingDoc()), "u1", ack, ctx), SignError, "cần chữ ký");
  const repo = new FakeRepo(pendingDoc({ requires_signature: false }));
  await signDocument(repo, "u1", ack, ctx);
  assertEquals(repo.uploads, []);
  assertEquals(repo.recorded?.signatureDataUrl, null);
});

Deno.test("uses a saved signature owned by the user", async () => {
  const repo = new FakeRepo(pendingDoc(), `data:image/png;base64,${b64(fakePng(300, 100))}`);
  await signDocument(repo, "u1", parseSignRequest({ ...baseReq, method: "saved", image_png_base64: null, saved_signature_id: "s1" }), { ip: null, userAgent: null });
  assertEquals(repo.recorded?.meta.source_signature_id, "s1");
  await assertRejects(
    () => signDocument(new FakeRepo(pendingDoc(), null), "u1", parseSignRequest({ ...baseReq, method: "saved", saved_signature_id: "x" }), { ip: null, userAgent: null }),
    SignError,
    "chữ ký đã lưu",
  );
});
