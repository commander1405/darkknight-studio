import { getSupabase, isConfigured } from "./supabase-client.js";
import { t, applyI18n, getLang } from "./i18n.js";
import { toast, escapeHtml, href, formatDate } from "./utils.js";
import { MEDIA_FIELDS, mediaFieldHtml, bindMediaFields } from "./media-upload.js";

/** Permission keys — deny by default for role=admin */
export const PERMS = [
  "projects",
  "bots",
  "news",
  "products",
  "team",
  "tickets",
  "contact",
  "orders",
  "analytics",
  "settings",
];

const CRUD = {
  projects: {
    perm: "projects",
    label: "nav.projects",
    titleKey: "title",
    fields: [
      { key: "title", type: "text", required: true },
      { key: "summary", type: "textarea" },
      { key: "description", type: "textarea" },
      { key: "category", type: "text" },
      { key: "status", type: "text" },
      { key: "cover_url", type: "url" },
      { key: "external_url", type: "url" },
      { key: "is_published", type: "bool" },
      { key: "is_featured", type: "bool" },
      { key: "sort_order", type: "number" },
    ],
  },
  bots: {
    perm: "bots",
    label: "nav.bots",
    titleKey: "name",
    fields: [
      { key: "name", type: "text", required: true },
      { key: "username", type: "text" },
      { key: "summary", type: "textarea" },
      { key: "description", type: "textarea" },
      { key: "platform", type: "text" },
      { key: "status", type: "text" },
      { key: "avatar_url", type: "url" },
      { key: "public_url", type: "url" },
      { key: "is_published", type: "bool" },
      { key: "is_featured", type: "bool" },
      { key: "sort_order", type: "number" },
    ],
  },
  news: {
    perm: "news",
    label: "nav.news",
    titleKey: "title",
    fields: [
      { key: "title", type: "text", required: true },
      { key: "summary", type: "textarea" },
      { key: "body", type: "textarea" },
      { key: "cover_url", type: "url" },
      { key: "category", type: "text" },
      { key: "is_published", type: "bool" },
      { key: "is_featured", type: "bool" },
      { key: "notify_push", type: "bool" },
      { key: "published_at", type: "datetime" },
    ],
  },
  products: {
    perm: "products",
    label: "nav.shop",
    titleKey: "name",
    fields: [
      { key: "name", type: "text", required: true },
      { key: "description", type: "textarea" },
      { key: "price", type: "number" },
      { key: "price_label", type: "text" },
      { key: "category", type: "text" },
      { key: "image_url", type: "url" },
      { key: "is_available", type: "bool" },
      { key: "is_published", type: "bool" },
      { key: "sort_order", type: "number" },
    ],
  },
  team_members: {
    perm: "team",
    label: "nav.team",
    titleKey: "name",
    fields: [
      { key: "name", type: "text", required: true },
      { key: "position", type: "text" },
      { key: "description", type: "textarea" },
      { key: "avatar_url", type: "url" },
      { key: "is_visible", type: "bool" },
      { key: "sort_order", type: "number" },
    ],
  },
};

function isOwner(profile) {
  return profile?.role === "owner" && profile?.is_active;
}

function can(profile, perm) {
  if (!profile?.is_active) return false;
  if (profile.role === "owner") return true;
  if (profile.role !== "admin") return false;
  const p = profile.permissions;
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  return p[perm] === true;
}

async function logActivity(sb, action, meta = {}) {
  try {
    await sb.from("activity_logs").insert({ action, meta });
  } catch (_) {}
}

export async function bootAdmin() {
  applyI18n();
  if (!isConfigured()) {
    document.body.innerHTML = `<div class="section container empty">${t("sections.notConfigured")}</div>`;
    return;
  }
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    location.href = href("admin-login.html");
    return;
  }
  const { data: profile, error: pErr } = await sb
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();
  if (pErr || !profile?.is_active || !["owner", "admin"].includes(profile.role)) {
    await sb.auth.signOut();
    location.href = href("admin-login.html");
    return;
  }

  const root = document.getElementById("admin-root");
  root.innerHTML = `
    <aside class="admin-side">
      <div class="brand-row">
        <span class="brand-mark">DK</span>
        <div>
          <strong>CONTROL</strong>
          <div class="role-pill">${escapeHtml(profile.role.toUpperCase())}</div>
        </div>
      </div>
      <div class="admin-nav-scroll" id="side-nav"></div>
      <div class="side-foot">
        <button type="button" class="nav-item" id="btn-logout">
          <span class="nav-ico">⏻</span> <span data-i18n="admin.logout"></span>
        </button>
      </div>
    </aside>
    <div class="admin-main">
      <div class="admin-topbar">
        <h1 id="panel-title" data-i18n="admin.dashboard"></h1>
        <div class="account">
          <div>
            <div>${escapeHtml(profile.email || session.user.email || "")}</div>
            <div style="color:var(--muted);font-size:0.75rem">${escapeHtml(profile.role)}</div>
          </div>
        </div>
      </div>
      <div id="panel"></div>
    </div>`;

  applyI18n();

  const navItems = [
    { id: "overview", group: "main", label: t("admin.overview"), icon: "▣", show: true },
    { id: "projects", group: "content", label: t("nav.projects"), icon: "◼", show: can(profile, "projects") },
    { id: "bots", group: "content", label: t("nav.bots"), icon: "◉", show: can(profile, "bots") },
    { id: "news", group: "content", label: t("nav.news"), icon: "☰", show: can(profile, "news") },
    { id: "products", group: "content", label: t("nav.shop"), icon: "◈", show: can(profile, "products") },
    { id: "team_members", group: "content", label: t("nav.team"), icon: "☺", show: can(profile, "team") },
    { id: "purchase_requests", group: "inbox", label: getLang() === "fa" ? "درخواست‌های خرید" : "Orders", icon: "◎", show: can(profile, "orders") },
    { id: "support_tickets", group: "inbox", label: t("nav.support"), icon: "?", show: can(profile, "tickets") },
    { id: "contact_messages", group: "inbox", label: t("nav.contact"), icon: "✉", show: can(profile, "contact") },
    { id: "analytics", group: "system", label: getLang() === "fa" ? "آمار" : "Analytics", icon: "▤", show: can(profile, "analytics") },
    { id: "settings", group: "system", label: getLang() === "fa" ? "تنظیمات سایت" : "Settings", icon: "⚙", show: can(profile, "settings") },
    { id: "notifications", group: "system", label: getLang() === "fa" ? "اعلان‌ها" : "Notifications", icon: "🔔", show: isOwner(profile) || can(profile, "settings") },
    { id: "admins", group: "system", label: getLang() === "fa" ? "مدیران" : "Admins", icon: "♛", show: isOwner(profile) },
  ].filter((x) => x.show);

  const side = document.getElementById("side-nav");
  let lastGroup = "";
  side.innerHTML = navItems.map((item, i) => {
    let g = "";
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      const names = { main: "", content: getLang() === "fa" ? "محتوا" : "Content", inbox: getLang() === "fa" ? "صندوق" : "Inbox", system: getLang() === "fa" ? "سیستم" : "System" };
      g = names[item.group] ? `<div class="admin-nav-group">${names[item.group]}</div>` : "";
    }
    return `${g}<button type="button" class="nav-item ${i === 0 ? "active" : ""}" data-id="${item.id}">
      <span class="nav-ico">${item.icon}</span>${escapeHtml(item.label)}</button>`;
  }).join("");

  document.getElementById("btn-logout").onclick = async () => {
    await sb.auth.signOut();
    location.href = href("admin-login.html");
  };

  async function show(id) {
    if (!navItems.some((n) => n.id === id)) {
      toast(t("admin.unauthorized"), "err");
      return;
    }
    side.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.id === id));
    const title = navItems.find((n) => n.id === id)?.label || id;
    document.getElementById("panel-title").textContent = title;
    const panel = document.getElementById("panel");
    panel.innerHTML = `<div class="stat-grid">${[1,2,3,4].map(() => `<div class="skeleton"></div>`).join("")}</div>`;

    if (id === "overview") return renderOverview(panel, sb, profile);
    if (CRUD[id]) return renderCrud(panel, sb, id, CRUD[id], profile);
    if (id === "purchase_requests") return renderStatusTable(panel, sb, "purchase_requests", ["pending","reviewing","approved","rejected","completed"], profile, "orders");
    if (id === "support_tickets") return renderStatusTable(panel, sb, "support_tickets", ["new","in_progress","waiting","resolved","closed"], profile, "tickets");
    if (id === "contact_messages") return renderContacts(panel, sb, profile);
    if (id === "analytics") return renderAnalytics(panel, sb, profile);
    if (id === "settings") return renderSettings(panel, sb, profile);
    if (id === "notifications") return renderNotifications(panel, sb, profile);
    if (id === "admins") return renderAdmins(panel, sb, profile);
  }

  side.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (btn?.dataset.id) show(btn.dataset.id);
  });
  show(navItems[0]?.id || "overview");
}

async function countOf(sb, table, filter) {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

async function renderOverview(panel, sb, profile) {
  const stats = [];
  const push = async (label, table, filter) => {
    try {
      stats.push({ label, value: await countOf(sb, table, filter) });
    } catch {
      stats.push({ label, value: "—" });
    }
  };
  await push(getLang() === "fa" ? "پروژه‌ها" : "Projects", "projects");
  await push(getLang() === "fa" ? "منتشرشده" : "Published projects", "projects", (q) => q.eq("is_published", true));
  await push(getLang() === "fa" ? "بات‌ها" : "Bots", "bots");
  await push(getLang() === "fa" ? "اخبار" : "News", "news");
  await push(getLang() === "fa" ? "محصولات" : "Products", "products");
  if (can(profile, "orders")) await push(getLang() === "fa" ? "سفارشات باز" : "Open orders", "purchase_requests", (q) => q.in("status", ["pending", "reviewing"]));
  if (can(profile, "tickets")) await push(getLang() === "fa" ? "تیکت‌های باز" : "Open tickets", "support_tickets", (q) => q.in("status", ["new", "in_progress", "waiting"]));
  if (can(profile, "contact")) await push(getLang() === "fa" ? "پیام‌های خوانده‌نشده" : "Unread contact", "contact_messages", (q) => q.eq("is_read", false));
  if (can(profile, "analytics") || isOwner(profile)) await push(getLang() === "fa" ? "بازدیدکننده یکتا" : "Unique visitors", "visitor_registry");
  if (isOwner(profile)) await push(getLang() === "fa" ? "حساب‌های staff" : "Staff accounts", "profiles");

  panel.innerHTML = `
    <div class="stat-grid">
      ${stats.map((s) => `<div class="stat-card"><div class="label">${escapeHtml(s.label)}</div><div class="value">${escapeHtml(String(s.value))}</div></div>`).join("")}
    </div>
    <div class="glass" style="margin-top:0.5rem">
      <strong>${getLang() === "fa" ? "دسترسی شما" : "Your access"}</strong>
      <p style="color:var(--muted);margin:0.5rem 0 0;font-size:0.9rem">
        ${isOwner(profile)
          ? (getLang() === "fa" ? "مالک — کنترل کامل" : "Owner — full control")
          : PERMS.filter((p) => can(profile, p)).map((p) => p).join(", ") || (getLang() === "fa" ? "بدون مجوز محتوا" : "No content permissions")}
      </p>
    </div>`;
}

async function renderCrud(panel, sb, table, def, profile) {
  if (!can(profile, def.perm)) {
    panel.innerHTML = `<div class="empty">${t("admin.unauthorized")}</div>`;
    return;
  }
  const { data, error } = await sb.from(table).select("*").order("created_at", { ascending: false }).limit(200);
  if (error) {
    panel.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }
  const rows = data || [];
  panel.innerHTML = `
    <div class="panel-toolbar">
      <button type="button" class="btn btn-primary" id="btn-new">+ ${getLang() === "fa" ? "جدید" : "New"}</button>
      <input type="search" id="crud-q" placeholder="${getLang() === "fa" ? "جستجو…" : "Search…"}" />
    </div>
    <div id="crud-list"></div>
    <div id="crud-form-wrap" class="form-drawer" style="display:none"></div>`;

  const list = panel.querySelector("#crud-list");
  function paint(filter = "") {
    const f = filter.toLowerCase();
    const filtered = rows.filter((r) => !f || JSON.stringify(r).toLowerCase().includes(f));
    if (!filtered.length) {
      list.innerHTML = `<div class="empty">${t("sections.empty")}</div>`;
      return;
    }
    list.innerHTML = `<div class="admin-table-wrap"><table class="admin-table">
      <thead><tr><th>${getLang() === "fa" ? "عنوان" : "Title"}</th><th>${getLang() === "fa" ? "وضعیت" : "Status"}</th><th></th></tr></thead>
      <tbody>${filtered.map((r) => {
        const title = r[def.titleKey] || r.title || r.name || r.id;
        const pub = r.is_published ?? r.is_visible;
        return `<tr>
          <td>${escapeHtml(String(title).slice(0, 80))}</td>
          <td>${pub === true ? "✓" : pub === false ? "—" : escapeHtml(String(r.status || ""))}</td>
          <td class="row-actions">
            <button type="button" class="btn btn-ghost" data-edit="${r.id}">Edit</button>
            <button type="button" class="btn btn-danger" data-del="${r.id}">Del</button>
          </td>
        </tr>`;
      }).join("")}</tbody></table></div>`;

    list.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => openForm(rows.find((x) => x.id === btn.dataset.edit));
    });
    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm(getLang() === "fa" ? "حذف شود؟" : "Delete this record?")) return;
        const { error: dErr } = await sb.from(table).delete().eq("id", btn.dataset.del);
        if (dErr) toast(dErr.message, "err");
        else {
          await logActivity(sb, `delete:${table}`, { id: btn.dataset.del });
          toast(t("sections.success"), "ok");
          const idx = rows.findIndex((x) => x.id === btn.dataset.del);
          if (idx >= 0) rows.splice(idx, 1);
          paint(panel.querySelector("#crud-q")?.value || "");
        }
      };
    });
  }

  function openForm(row) {
    const wrap = panel.querySelector("#crud-form-wrap");
    wrap.style.display = "block";
    const isNew = !row;
    wrap.innerHTML = `<h3 style="margin-top:0">${isNew ? "Create" : "Edit"}</h3>
      <form class="form" id="entity-form" style="max-width:100%">
        ${def.fields.map((f) => fieldHtml(f, row?.[f.key])).join("")}
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn-primary" type="submit">${t("sections.submit")}</button>
          <button class="btn btn-ghost" type="button" id="form-cancel">${getLang() === "fa" ? "انصراف" : "Cancel"}</button>
        </div>
      </form>`;
    wrap.querySelector("#form-cancel").onclick = () => { wrap.style.display = "none"; };
    const formEl = wrap.querySelector("#entity-form");
    bindMediaFields(formEl, table, (msg) => toast(msg, "err"));
    wrap.querySelector("#entity-form").onsubmit = async (e) => {
      e.preventDefault();
      const payload = {};
      for (const f of def.fields) {
        const el = e.target.elements[f.key];
        if (!el) continue;
        if (f.type === "bool") payload[f.key] = !!el.checked;
        else if (f.type === "number") payload[f.key] = el.value === "" ? null : Number(el.value);
        else if (f.type === "datetime") payload[f.key] = el.value ? new Date(el.value).toISOString() : null;
        else payload[f.key] = String(el.value || "").trim();
      }
      if (table === "news" && payload.is_published && !payload.published_at) {
        payload.published_at = new Date().toISOString();
      }
      let err, data;
      if (isNew) {
        const res = await sb.from(table).insert(payload).select("*").single();
        err = res.error; data = res.data;
        if (data) rows.unshift(data);
      } else {
        const res = await sb.from(table).update(payload).eq("id", row.id).select("*").single();
        err = res.error; data = res.data;
        if (data) {
          const i = rows.findIndex((x) => x.id === row.id);
          if (i >= 0) rows[i] = data;
        }
      }
      if (err) toast(err.message, "err");
      else {
        await logActivity(sb, `${isNew ? "create" : "update"}:${table}`, { id: data?.id });
        toast(t("sections.success"), "ok");
        wrap.style.display = "none";
        paint(panel.querySelector("#crud-q")?.value || "");
      }
    };
  }

  panel.querySelector("#btn-new").onclick = () => openForm(null);
  panel.querySelector("#crud-q").oninput = (e) => paint(e.target.value.trim());
  paint();
}

function fieldHtml(f, value) {
  const label = escapeHtml(f.key);
  // Device upload for media URL fields (not external/public links)
  if (MEDIA_FIELDS.has(f.key) || (f.type === "url" && /_(url)$/.test(f.key) && !["external_url", "public_url"].includes(f.key))) {
    return mediaFieldHtml(f.key, value, getLang());
  }
  if (f.type === "bool") {
    return `<label style="display:flex;align-items:center;gap:0.5rem;flex-direction:row">
      <input type="checkbox" name="${f.key}" ${value ? "checked" : ""} /> <span>${label}</span></label>`;
  }
  if (f.type === "textarea") {
    return `<label><span>${label}</span><textarea name="${f.key}" rows="3">${escapeHtml(value ?? "")}</textarea></label>`;
  }
  if (f.type === "datetime") {
    const v = value ? new Date(value).toISOString().slice(0, 16) : "";
    return `<label><span>${label}</span><input type="datetime-local" name="${f.key}" value="${escapeHtml(v)}" /></label>`;
  }
  const inputType = f.type === "number" ? "number" : f.type === "url" ? "url" : "text";
  return `<label><span>${label}</span><input type="${inputType}" name="${f.key}" value="${escapeHtml(value ?? "")}" ${f.required ? "required" : ""} /></label>`;
}

async function renderStatusTable(panel, sb, table, statuses, profile, perm) {
  if (!can(profile, perm)) {
    panel.innerHTML = `<div class="empty">${t("admin.unauthorized")}</div>`;
    return;
  }
  const { data, error } = await sb.from(table).select("*").order("created_at", { ascending: false }).limit(150);
  if (error) {
    panel.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!data?.length) {
    panel.innerHTML = `<div class="empty">${t("sections.empty")}</div>`;
    return;
  }
  const cols = ["name", "contact", "subject", "status", "created_at"].filter((c) => c in data[0] || c === "status");
  panel.innerHTML = `<div class="admin-table-wrap"><table class="admin-table">
    <thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}<th></th></tr></thead>
    <tbody>${data.map((row) => `<tr>
      ${cols.map((c) => `<td>${escapeHtml(String(row[c] ?? "").slice(0, 48))}</td>`).join("")}
      <td class="row-actions">${statuses.map((s) =>
        `<button type="button" class="btn btn-ghost" data-id="${row.id}" data-status="${s}">${s}</button>`
      ).join("")}</td>
    </tr>`).join("")}</tbody></table></div>`;

  panel.querySelectorAll("[data-status]").forEach((btn) => {
    btn.onclick = async () => {
      const { error: upErr } = await sb.from(table).update({ status: btn.dataset.status }).eq("id", btn.dataset.id);
      if (upErr) toast(upErr.message, "err");
      else {
        await logActivity(sb, `status:${table}`, { id: btn.dataset.id, status: btn.dataset.status });
        toast(t("sections.success"), "ok");
        renderStatusTable(panel, sb, table, statuses, profile, perm);
      }
    };
  });
}

async function renderContacts(panel, sb, profile) {
  if (!can(profile, "contact")) {
    panel.innerHTML = `<div class="empty">${t("admin.unauthorized")}</div>`;
    return;
  }
  const { data, error } = await sb.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(150);
  if (error) {
    panel.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!data?.length) {
    panel.innerHTML = `<div class="empty">${t("sections.empty")}</div>`;
    return;
  }
  panel.innerHTML = `<div class="admin-table-wrap"><table class="admin-table">
    <thead><tr><th>name</th><th>subject</th><th>read</th><th></th></tr></thead>
    <tbody>${data.map((r) => `<tr>
      <td>${escapeHtml(r.name || "")}<div style="color:var(--muted);font-size:0.75rem">${escapeHtml(r.contact || "")}</div></td>
      <td>${escapeHtml((r.subject || "").slice(0, 60))}<div style="color:var(--muted);font-size:0.8rem">${escapeHtml((r.message || "").slice(0, 100))}</div></td>
      <td>${r.is_read ? "✓" : "—"}</td>
      <td class="row-actions">${!r.is_read ? `<button type="button" class="btn btn-ghost" data-read="${r.id}">Mark read</button>` : ""}</td>
    </tr>`).join("")}</tbody></table></div>`;
  panel.querySelectorAll("[data-read]").forEach((btn) => {
    btn.onclick = async () => {
      const { error: upErr } = await sb.from("contact_messages").update({ is_read: true }).eq("id", btn.dataset.read);
      if (upErr) toast(upErr.message, "err");
      else renderContacts(panel, sb, profile);
    };
  });
}

async function renderAnalytics(panel, sb, profile) {
  if (!can(profile, "analytics") && !isOwner(profile)) {
    panel.innerHTML = `<div class="empty">${t("admin.unauthorized")}</div>`;
    return;
  }
  const visitors = await countOf(sb, "visitor_registry");
  const views = await countOf(sb, "page_views");
  let topPages = [];
  try {
    const { data } = await sb.from("page_views").select("path").order("created_at", { ascending: false }).limit(500);
    const map = {};
    for (const row of data || []) {
      const p = row.path || "/";
      map[p] = (map[p] || 0) + 1;
    }
    topPages = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  } catch (_) {}

  panel.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Unique visitors</div><div class="value">${visitors}</div></div>
      <div class="stat-card"><div class="label">Page views</div><div class="value">${views}</div></div>
    </div>
    <h3>${getLang() === "fa" ? "صفحات پربازدید" : "Top paths"}</h3>
    <div class="admin-table-wrap"><table class="admin-table">
      <thead><tr><th>path</th><th>hits</th></tr></thead>
      <tbody>${topPages.length ? topPages.map(([p, n]) => `<tr><td>${escapeHtml(p)}</td><td>${n}</td></tr>`).join("") : `<tr><td colspan="2">${t("sections.empty")}</td></tr>`}</tbody>
    </table></div>
    <p style="color:var(--muted);font-size:0.8rem;margin-top:0.75rem">${getLang() === "fa" ? "بازدید صفحات ادمین در آمار عمومی ثبت نمی‌شود." : "Admin paths are excluded from public visitor RPC when migration 002+ is applied."}</p>`;
}

async function renderSettings(panel, sb, profile) {
  if (!can(profile, "settings") && !isOwner(profile)) {
    panel.innerHTML = `<div class="empty">${t("admin.unauthorized")}</div>`;
    return;
  }
  // Only owner can edit global settings by default policy; admins need settings perm + RLS
  const { data: rows } = await sb.from("website_settings").select("*");
  const map = {};
  for (const r of rows || []) map[r.key] = r.value;

  const site = map.site || {};
  panel.innerHTML = `
    <form class="form form-drawer" id="settings-form" style="display:grid;max-width:560px">
      <label><span>title</span><input name="title" value="${escapeHtml(site.title || "DARKKNIGHT STUDIO")}" /></label>
      <label><span>description</span><textarea name="description" rows="2">${escapeHtml(site.description || "")}</textarea></label>
      <label><span>contact_email</span><input name="contact_email" value="${escapeHtml(site.contact_email || "")}" /></label>
      <label><span>telegram</span><input name="telegram" value="${escapeHtml(site.telegram || "")}" /></label>
      <label><span>announcement</span><textarea name="announcement" rows="2">${escapeHtml(site.announcement || "")}</textarea></label>
      <label style="flex-direction:row;align-items:center;display:flex;gap:0.5rem">
        <input type="checkbox" name="maintenance" ${site.maintenance ? "checked" : ""} /> maintenance mode
      </label>
      <button class="btn btn-primary" type="submit">${t("sections.submit")}</button>
    </form>
    ${!isOwner(profile) ? `<p style="color:var(--muted);font-size:0.85rem">${getLang() === "fa" ? "ذخیره تنظیمات ممکن است فقط برای مالک مجاز باشد." : "Saving settings may require owner privileges (RLS)."}</p>` : ""}`;

  panel.querySelector("#settings-form").onsubmit = async (e) => {
    e.preventDefault();
    if (!isOwner(profile) && !can(profile, "settings")) {
      toast(t("admin.unauthorized"), "err");
      return;
    }
    const fd = new FormData(e.target);
    const value = {
      title: String(fd.get("title") || "").trim(),
      description: String(fd.get("description") || "").trim(),
      contact_email: String(fd.get("contact_email") || "").trim(),
      telegram: String(fd.get("telegram") || "").trim(),
      announcement: String(fd.get("announcement") || "").trim(),
      maintenance: !!e.target.elements.maintenance.checked,
    };
    const { error } = await sb.from("website_settings").upsert({
      key: "site",
      value,
      updated_at: new Date().toISOString(),
    });
    if (error) toast(error.message, "err");
    else {
      await logActivity(sb, "settings:update", {});
      toast(t("sections.success"), "ok");
    }
  };
}

async function renderAdmins(panel, sb, profile) {
  if (!isOwner(profile)) {
    panel.innerHTML = `<div class="empty">${t("admin.unauthorized")}</div>`;
    return;
  }
  const { data, error } = await sb.from("profiles").select("*").order("created_at", { ascending: true });
  if (error) {
    panel.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }
  const rows = data || [];
  panel.innerHTML = `
    <div class="panel-toolbar">
      <p style="color:var(--muted);margin:0;font-size:0.9rem">${getLang() === "fa" ? "فقط مالک می‌تواند نقش و مجوز مدیران را تغییر دهد." : "Only the owner can change admin roles and permissions."}</p>
    </div>
    <div class="admin-table-wrap"><table class="admin-table">
      <thead><tr><th>email</th><th>role</th><th>active</th><th>permissions</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${escapeHtml(r.email || r.id)}</td>
        <td>${escapeHtml(r.role)}</td>
        <td>${r.is_active ? "✓" : "—"}</td>
        <td style="font-size:0.75rem;color:var(--muted)">${r.role === "owner" ? "ALL" : escapeHtml(JSON.stringify(r.permissions || {}))}</td>
        <td class="row-actions">
          ${r.role !== "owner" ? `<button type="button" class="btn btn-ghost" data-edit-admin="${r.id}">Edit</button>` : ""}
        </td>
      </tr>`).join("")}</tbody>
    </table></div>
    <div id="admin-edit" class="form-drawer" style="display:none"></div>`;

  panel.querySelectorAll("[data-edit-admin]").forEach((btn) => {
    btn.onclick = () => {
      const row = rows.find((x) => x.id === btn.dataset.editAdmin);
      if (!row) return;
      const wrap = panel.querySelector("#admin-edit");
      wrap.style.display = "block";
      const perms = row.permissions && typeof row.permissions === "object" ? row.permissions : {};
      wrap.innerHTML = `<h3 style="margin-top:0">${escapeHtml(row.email || row.id)}</h3>
        <form class="form" id="admin-form">
          <label><span>role</span>
            <select name="role">
              <option value="admin" ${row.role === "admin" ? "selected" : ""}>admin</option>
              <option value="owner" ${row.role === "owner" ? "selected" : ""}>owner</option>
            </select>
          </label>
          <label style="flex-direction:row;display:flex;gap:0.5rem;align-items:center">
            <input type="checkbox" name="is_active" ${row.is_active ? "checked" : ""} /> active
          </label>
          <div class="perm-grid">
            ${PERMS.map((p) => `<label class="perm-item"><input type="checkbox" name="perm_${p}" ${perms[p] ? "checked" : ""} /> ${p}</label>`).join("")}
          </div>
          <button class="btn btn-primary" type="submit">${t("sections.submit")}</button>
        </form>`;
      wrap.querySelector("#admin-form").onsubmit = async (e) => {
        e.preventDefault();
        const role = e.target.elements.role.value;
        const is_active = !!e.target.elements.is_active.checked;
        const permissions = {};
        for (const p of PERMS) permissions[p] = !!e.target.elements[`perm_${p}`]?.checked;
        const { error: upErr } = await sb.from("profiles").update({ role, is_active, permissions }).eq("id", row.id);
        if (upErr) toast(upErr.message, "err");
        else {
          await logActivity(sb, "admin:update", { id: row.id, role });
          toast(t("sections.success"), "ok");
          renderAdmins(panel, sb, profile);
        }
      };
    };
  });
}


async function renderNotifications(panel, sb, profile) {
  if (!isOwner(profile) && !can(profile, "settings")) {
    panel.innerHTML = `<div class="empty">${t("admin.unauthorized")}</div>`;
    return;
  }
  const { data: cfgRow } = await sb.from("website_settings").select("*").eq("key", "push_config").maybeSingle();
  const cfg = cfgRow?.value || { enabled: true, news: true, projects: true, bots: true, products: false };
  const { count: subCount } = await sb.from("push_subscriptions").select("*", { count: "exact", head: true }).eq("is_active", true);
  const { data: logs } = await sb.from("notification_logs").select("*").order("created_at", { ascending: false }).limit(20);
  const { count: pending } = await sb.from("push_outbox").select("*", { count: "exact", head: true }).eq("status", "pending");

  panel.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Active subscriptions</div><div class="value">${subCount ?? 0}</div></div>
      <div class="stat-card"><div class="label">Pending outbox</div><div class="value">${pending ?? 0}</div></div>
    </div>
    <form class="form form-drawer" id="push-cfg" style="max-width:520px">
      <label style="flex-direction:row;display:flex;gap:0.5rem;align-items:center"><input type="checkbox" name="enabled" ${cfg.enabled !== false ? "checked" : ""}/> System enabled</label>
      <label style="flex-direction:row;display:flex;gap:0.5rem;align-items:center"><input type="checkbox" name="news" ${cfg.news !== false ? "checked" : ""}/> News</label>
      <label style="flex-direction:row;display:flex;gap:0.5rem;align-items:center"><input type="checkbox" name="projects" ${cfg.projects !== false ? "checked" : ""}/> Projects</label>
      <label style="flex-direction:row;display:flex;gap:0.5rem;align-items:center"><input type="checkbox" name="bots" ${cfg.bots !== false ? "checked" : ""}/> Bots</label>
      <label style="flex-direction:row;display:flex;gap:0.5rem;align-items:center"><input type="checkbox" name="products" ${cfg.products === true ? "checked" : ""}/> Products</label>
      <button class="btn btn-primary" type="submit">${t("sections.submit")}</button>
    </form>
    ${isOwner(profile) ? `
    <div class="form-drawer" style="margin-top:1rem;max-width:520px">
      <h3 style="margin-top:0">Process / Test</h3>
      <p style="color:var(--muted);font-size:0.85rem">Requires Edge Function <code>send-push</code> + VAPID secrets.</p>
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
        <button type="button" class="btn btn-primary" id="btn-process-outbox">Process outbox</button>
        <button type="button" class="btn btn-ghost" id="btn-test-push">Send test</button>
      </div>
    </div>` : ""}
    <h3>Recent logs</h3>
    <div class="admin-table-wrap"><table class="admin-table">
      <thead><tr><th>title</th><th>ok</th><th>fail</th><th>when</th></tr></thead>
      <tbody>
        ${(logs || []).map((l) => `<tr>
          <td>${escapeHtml(l.title || "")}</td>
          <td>${l.success_count ?? 0}</td>
          <td>${l.fail_count ?? 0}</td>
          <td>${escapeHtml(formatDate(l.created_at))}</td>
        </tr>`).join("") || `<tr><td colspan="4">${t("sections.empty")}</td></tr>`}
      </tbody>
    </table></div>`;

  panel.querySelector("#push-cfg").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const value = {
      enabled: !!f.enabled.checked,
      news: !!f.news.checked,
      projects: !!f.projects.checked,
      bots: !!f.bots.checked,
      products: !!f.products.checked,
    };
    const { error } = await sb.from("website_settings").upsert({ key: "push_config", value, updated_at: new Date().toISOString() });
    if (error) toast(error.message, "err");
    else toast(t("sections.success"), "ok");
  };

  async function callSendPush(payload) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("no session");
    const base = (await import("./config.js")).CONFIG.SUPABASE_URL;
    const res = await fetch(`${base}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: (await import("./config.js")).CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || res.statusText);
    return json;
  }

  panel.querySelector("#btn-process-outbox")?.addEventListener("click", async () => {
    try {
      const r = await callSendPush({ mode: "process_outbox" });
      toast(`Processed: ${r.processed ?? 0}`, "ok");
      renderNotifications(panel, sb, profile);
    } catch (err) {
      toast(err.message || String(err), "err");
    }
  });
  panel.querySelector("#btn-test-push")?.addEventListener("click", async () => {
    try {
      const r = await callSendPush({ mode: "test", title: "DARKKNIGHT STUDIO", body: "Test notification", url: "./index.html" });
      toast(`Test ok=${r.ok} fail=${r.fail}`, r.ok ? "ok" : "err");
      renderNotifications(panel, sb, profile);
    } catch (err) {
      toast(err.message || String(err), "err");
    }
  });
}
