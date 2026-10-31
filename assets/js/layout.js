import { initI18n, setLang, getLang, t, applyI18n } from "./i18n.js";
import { href, visitorId, toast } from "./utils.js";
import { CONFIG, isConfigured } from "./config.js";
import { getSupabase } from "./supabase-client.js";

const PAGES = [
  ["index.html", "nav.home"],
  ["projects.html", "nav.projects"],
  ["bots.html", "nav.bots"],
  ["team.html", "nav.team"],
  ["news.html", "nav.news"],
  ["shop.html", "nav.shop"],
  ["support.html", "nav.support"],
  ["contact.html", "nav.contact"],
];

export function renderShell(active) {
  initI18n();
  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");
  if (header) {
    header.innerHTML = `
      <div class="container nav">
        <a class="brand" href="${href("index.html")}">
          <span class="brand-mark">DK</span>
          <span>DARKKNIGHT STUDIO</span>
        </a>
        <button class="icon-btn menu-toggle" type="button" aria-label="Menu" id="menu-toggle">☰</button>
        <ul class="nav-links" id="nav-links">
          ${PAGES.map(([p, k]) => {
            const file = location.pathname.split("/").pop() || "index.html";
            const isActive = (active || file) === p || (p === "index.html" && (file === "" || file === "darkknight-studio"));
            return `<li><a class="${isActive ? "active" : ""}" href="${href(p)}" data-i18n="${k}"></a></li>`;
          }).join("")}
        </ul>
        <div class="nav-actions">
          <button type="button" class="lang-btn" id="lang-toggle">${getLang() === "fa" ? "EN" : "فا"}</button>
          <a class="lang-btn" href="${href("admin-login.html")}" data-i18n="nav.admin"></a>
        </div>
      </div>`;
    header.querySelector("#lang-toggle")?.addEventListener("click", () => {
      setLang(getLang() === "fa" ? "en" : "fa");
      header.querySelector("#lang-toggle").textContent = getLang() === "fa" ? "EN" : "فا";
    });
    header.querySelector("#menu-toggle")?.addEventListener("click", () => {
      header.querySelector("#nav-links")?.classList.toggle("open");
    });
  }
  if (footer) {
    footer.innerHTML = `
      <div class="container footer-inner">
        <div><strong data-i18n="footer.studio"></strong></div>
        <div data-i18n="footer.rights"></div>
      </div>`;
  }
  applyI18n();
  trackVisit();
  maybePushPrompt();
}

async function trackVisit() {
  if (!isConfigured()) return;
  const path = location.pathname + location.search;
  try {
    // Prefer edge function when URL set
    if (CONFIG.TRACK_VISITOR_URL) {
      await fetch(CONFIG.TRACK_VISITOR_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ visitor_id: visitorId(), path, ts: Date.now() }),
      });
      return;
    }
    const sb = await getSupabase();
    if (!sb) return;
    // page view only via public RPC if available
    await sb.rpc("record_page_view", { p_visitor_id: visitorId(), p_path: path }).maybeSingle?.();
  } catch (_) {
    /* analytics must never break UX */
  }
}

function maybePushPrompt() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  if (!CONFIG.VAPID_PUBLIC_KEY) return;
  if (localStorage.getItem("dks-push-asked") === "1") return;
  if (Notification.permission === "granted" || Notification.permission === "denied") return;
  setTimeout(() => {
    if (document.getElementById("push-banner")) return;
    const el = document.createElement("div");
    el.id = "push-banner";
    el.className = "push-banner";
    el.innerHTML = `
      <p data-i18n="sections.pushHint"></p>
      <div class="row">
        <button type="button" class="btn btn-primary" id="push-yes" data-i18n="sections.enablePush"></button>
        <button type="button" class="btn btn-ghost" id="push-no">OK</button>
      </div>`;
    document.body.appendChild(el);
    applyI18n();
    el.querySelector("#push-no").onclick = () => {
      localStorage.setItem("dks-push-asked", "1");
      el.remove();
    };
    el.querySelector("#push-yes").onclick = async () => {
      localStorage.setItem("dks-push-asked", "1");
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          toast(t("sections.pushDenied"), "err");
          el.remove();
          return;
        }
        const reg = await navigator.serviceWorker.register(`${location.pathname.includes("/darkknight-studio") ? "/darkknight-studio" : ""}/sw.js`);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY),
        });
        const sb = await getSupabase();
        if (sb) {
          await sb.from("push_subscriptions").upsert({
            endpoint: sub.endpoint,
            visitor_id: visitorId(),
            keys: sub.toJSON().keys,
            user_agent: navigator.userAgent.slice(0, 240),
          }, { onConflict: "endpoint" });
        }
        toast(t("sections.pushEnabled"), "ok");
      } catch (e) {
        toast(t("sections.error"), "err");
      }
      el.remove();
    };
  }, 5000);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function loadPublished(table, { featured, limit, search, category } = {}) {
  const sb = await getSupabase();
  if (!sb) return { data: null, error: "not_configured" };
  let q = sb.from(table).select("*").eq("is_published", true).order("created_at", { ascending: false });
  if (featured) q = q.eq("is_featured", true);
  if (category) q = q.eq("category", category);
  if (limit) q = q.limit(limit);
  if (search) q = q.or(`title.ilike.%${search}%,name.ilike.%${search}%,summary.ilike.%${search}%`);
  const { data, error } = await q;
  return { data, error };
}
