import { initI18n, setLang, getLang, t, applyI18n } from "./i18n.js";
import { href, visitorId, toast } from "./utils.js";
import { CONFIG, isConfigured } from "./config.js";
import { getSupabase } from "./supabase-client.js";

const PAGES = [
  ["index.html", "nav.home", "⌂"],
  ["projects.html", "nav.projects", "▣"],
  ["bots.html", "nav.bots", "◉"],
  ["news.html", "nav.news", "☰"],
  ["shop.html", "nav.shop", "◈"],
  ["team.html", "nav.team", "☺"],
  ["support.html", "nav.support", "?"],
  ["contact.html", "nav.contact", "✉"],
];

/** Primary tabs on mobile (max ~5) */
const MOBILE_TABS = [
  ["index.html", "nav.home", "⌂"],
  ["projects.html", "nav.projects", "▣"],
  ["bots.html", "nav.bots", "◉"],
  ["shop.html", "nav.shop", "◈"],
  ["more", "nav.more", "⋯"],
];

export function renderShell(active) {
  initI18n();
  const file = (active || location.pathname.split("/").pop() || "index.html").split("?")[0] || "index.html";

  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");

  if (header) {
    header.innerHTML = `
      <div class="container nav">
        <a class="brand" href="${href("index.html")}">
          <span class="brand-mark">DK</span>
          <span>DARKKNIGHT STUDIO</span>
        </a>
        <ul class="nav-links" id="nav-links">
          ${PAGES.map(([p, k]) => {
            const isActive = file === p || (p === "index.html" && (file === "" || file === "darkknight-studio"));
            return `<li><a class="${isActive ? "active" : ""}" href="${href(p)}" data-i18n="${k}"></a></li>`;
          }).join("")}
        </ul>
        <div class="nav-actions">
          <button type="button" class="lang-btn" id="lang-toggle" aria-label="Language">${getLang() === "fa" ? "EN" : "فا"}</button>
        </div>
      </div>`;
    header.querySelector("#lang-toggle")?.addEventListener("click", () => {
      setLang(getLang() === "fa" ? "en" : "fa");
      header.querySelector("#lang-toggle").textContent = getLang() === "fa" ? "EN" : "فا";
      // refresh mobile labels
      const bar = document.getElementById("mobile-tabbar");
      if (bar) renderMobileBar(bar, file);
    });
  }

  // Mobile tab bar
  let bar = document.getElementById("mobile-tabbar");
  if (!bar) {
    bar = document.createElement("nav");
    bar.id = "mobile-tabbar";
    bar.className = "mobile-tabbar";
    bar.setAttribute("aria-label", "Primary");
    document.body.appendChild(bar);
  }
  renderMobileBar(bar, file);

  if (footer) {
    footer.innerHTML = `
      <div class="container footer-inner">
        <div><strong data-i18n="footer.studio"></strong></div>
        <div data-i18n="footer.rights"></div>
      </div>`;
  }

  applyI18n();
  trackVisit(file);
  maybePushPrompt();
  if ("serviceWorker" in navigator) {
    const base = location.pathname.includes("/darkknight-studio") ? "/darkknight-studio" : "";
    navigator.serviceWorker.register(`${base}/sw.js`).catch(() => {});
  }
}

function renderMobileBar(bar, file) {
  const primaryIds = new Set(["index.html", "projects.html", "bots.html", "shop.html"]);
  bar.innerHTML = MOBILE_TABS.map(([p, k, ico]) => {
    let isActive = false;
    let link = href(p);
    if (p === "more") {
      isActive = !primaryIds.has(file);
      link = href("contact.html"); // more sheet via contact hub; expand below
    } else {
      isActive = file === p || (p === "index.html" && (!file || file === "darkknight-studio"));
    }
    return `<a class="${isActive ? "active" : ""}" href="${link}" data-page="${p}">
      <span class="tab-ico" aria-hidden="true">${ico}</span>
      <span data-i18n="${k}">${t(k)}</span>
    </a>`;
  }).join("");

  // More menu: open sheet with remaining pages
  bar.querySelector('[data-page="more"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    openMoreSheet(file);
  });
  applyI18n();
}

function openMoreSheet(file) {
  let sheet = document.getElementById("more-sheet");
  if (sheet) sheet.remove();
  sheet = document.createElement("div");
  sheet.id = "more-sheet";
  sheet.className = "overlay-sheet";
  sheet.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet-panel glass">
      <div class="sheet-handle"></div>
      <nav class="sheet-links">
        ${PAGES.filter(([p]) => !["index.html", "projects.html", "bots.html", "shop.html"].includes(p))
          .map(([p, k]) => `<a class="${file === p ? "active" : ""}" href="${href(p)}" data-i18n="${k}"></a>`)
          .join("")}
      </nav>
      <button type="button" class="btn btn-ghost" data-close data-i18n="settings.close"></button>
    </div>`;
  // inject minimal sheet styles once
  if (!document.getElementById("sheet-css")) {
    const st = document.createElement("style");
    st.id = "sheet-css";
    st.textContent = `
      .overlay-sheet{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-end;justify-content:center}
      .sheet-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}
      .sheet-panel{position:relative;width:min(480px,100%);border-radius:22px 22px 0 0;padding:0.75rem 1rem calc(1.25rem + var(--safe-b));animation:sheetUp .28s ease}
      .sheet-handle{width:40px;height:4px;border-radius:99px;background:rgba(255,255,255,.2);margin:0.25rem auto 1rem}
      .sheet-links{display:grid;gap:0.35rem;margin-bottom:0.75rem}
      .sheet-links a{padding:0.85rem 1rem;border-radius:14px;background:rgba(255,255,255,.04);color:var(--muted);font-weight:600}
      .sheet-links a.active,.sheet-links a:hover{color:var(--text);background:var(--accent-soft)}
      @keyframes sheetUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
      @media(min-width:861px){.overlay-sheet{display:none!important}}
    `;
    document.head.appendChild(st);
  }
  document.body.appendChild(sheet);
  applyI18n();
  sheet.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => sheet.remove());
  });
}

async function trackVisit(pageHint) {
  if (!isConfigured()) return;
  // skip admin routes
  const path = location.pathname + location.search;
  if (path.includes("admin")) return;
  try {
    if (CONFIG.TRACK_VISITOR_URL) {
      await fetch(CONFIG.TRACK_VISITOR_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ visitor_id: visitorId(), path, page: pageHint, ts: Date.now() }),
      });
      return;
    }
    const sb = await getSupabase();
    if (!sb) return;
    await sb.rpc("record_page_view", { p_visitor_id: visitorId(), p_path: path });
  } catch (_) {}
}

function maybePushPrompt() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  if (!CONFIG.VAPID_PUBLIC_KEY) return;
  if (localStorage.getItem("dks-push-asked") === "1") return;
  if (Notification.permission !== "default") return;
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
        const base = location.pathname.includes("/darkknight-studio") ? "/darkknight-studio" : "";
        const reg = await navigator.serviceWorker.register(`${base}/sw.js`);
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
      } catch (_) {
        toast(t("sections.error"), "err");
      }
      el.remove();
    };
  }, 6000);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function loadPublished(table, { featured, limit, search } = {}) {
  const sb = await getSupabase();
  if (!sb) return { data: null, error: "not_configured" };
  let q = sb.from(table).select("*");
  if (table === "team_members") {
    q = q.eq("is_visible", true).order("sort_order", { ascending: true });
  } else {
    q = q.eq("is_published", true).order("created_at", { ascending: false });
    if (featured) q = q.eq("is_featured", true);
  }
  if (limit) q = q.limit(limit);
  if (search) {
    // avoid injection via filter string — strip special chars
    const s = String(search).replace(/[%_,.()]/g, "").slice(0, 60);
    if (s) q = q.or(`title.ilike.%${s}%,name.ilike.%${s}%,summary.ilike.%${s}%`);
  }
  const { data, error } = await q;
  return { data, error };
}
