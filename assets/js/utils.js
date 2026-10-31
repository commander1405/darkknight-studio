export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function toast(msg, type = "info") {
  let box = document.getElementById("toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 280);
  }, 3200);
}
export function formatDate(iso, lang = "fa") {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-GB", {
      year: "numeric", month: "short", day: "numeric",
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}
export function visitorId() {
  const k = "dks-vid";
  try {
    let id = localStorage.getItem(k);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || ("v_" + Math.random().toString(36).slice(2) + Date.now());
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return "anon";
  }
}
export function basePath() {
  // GitHub Pages project path
  const p = location.pathname;
  if (p.includes("/darkknight-studio")) return "/darkknight-studio";
  return "";
}
export function href(page) {
  const b = basePath();
  if (!page || page === "index.html" || page === "/") return `${b}/` || "./";
  return `${b}/${page}`.replace(/\/+/g, "/").replace(":/", "://");
}
