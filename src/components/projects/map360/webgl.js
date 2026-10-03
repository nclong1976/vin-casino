/** Máy có WebGL thì mới chạy được bản đồ 3D và ảnh 360° (file nhỏ, không kéo theo thư viện nặng). */
export function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}
