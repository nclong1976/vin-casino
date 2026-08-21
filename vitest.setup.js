// Node.js bản mới (>=22) có localStorage gốc dạng thử nghiệm, xung đột với
// localStorage do jsdom cấp cho môi trường test (--localstorage-file warning,
// localStorage bị undefined). Định nghĩa thẳng 1 bản polyfill đơn giản, độc
// lập với việc global nào đang thắng, để test chạy ổn định trên mọi phiên
// bản Node.
class MemoryStorage {
  constructor() {
    this._map = new Map();
  }
  getItem(key) {
    return this._map.has(key) ? this._map.get(key) : null;
  }
  setItem(key, value) {
    this._map.set(key, String(value));
  }
  removeItem(key) {
    this._map.delete(key);
  }
  clear() {
    this._map.clear();
  }
  key(index) {
    return Array.from(this._map.keys())[index] ?? null;
  }
  get length() {
    return this._map.size;
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  writable: true,
  configurable: true,
});
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: storage,
    writable: true,
    configurable: true,
  });
}
