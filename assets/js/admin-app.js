import { getSupabase, isConfigured } from "./supabase-client.js";
import { t, applyI18n } from "./i18n.js";
import { toast, escapeHtml, href, formatDate } from "./utils.js";

const TABLES = {
  projects: {
    label: "nav.projects",
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
    label: "nav.bots",
    fields: [
      { key: "name", type: "text", required: true },
      { key: "username", type: "text" },
      { key: "summary", type: "textarea" },
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
    label: "nav.news",
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
    label: "nav.shop",
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
    label: "nav.team",
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

export async function bootAdmin() {
  applyI18n();
  if (!isConfigured()) {
    document.body.insertAdjacentHTML("beforeend", `<div class="section container empty">${t("sections.notConfigured")}</div>`);
    return;
  }
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    location.href = href("admin-login.html");
    return;
  }
  const { data: profile } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  if (!profile?.is_active || !["owner", "admin"].includes(profile.role)) {
    await sb.auth.signOut();
    location.href = href("admin-login.html");
    return;
  }

  document.getElementById("app").style.display = "grid";
  const sections = [
    ["overview", "admin.overview"],
    ...Object.keys(TABLES).map((k) => [k, TABLES[k].label]),
    ["purchase_requests", "orders"],
    ["support_tickets", "nav.support"],
    ["contact_messages", "nav.contact"],
    ["visitor_registry", "visitors"],
  ];

  const side = document.getElementById("side");
  side.innerHTML = sections.map(([id, key], i) => {
    const label = t(key) === key ? key : t(key);
    return `<button type="button" data-id="${id}" class="${i === 0 ? "active" : ""}">${escapeHtml(label)}</button>`;
  }).join("");

  document.getElementById("logout").onclick = async () => {
    await sb.auth.signOut();
    location.href = href("admin-login.html");
  };

  async function show(id) {
    side.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.id === id));
    const panel = document.getElementById("panel");
    panel.innerHTML = `<div class="loading">${t("sections.loading")}</div>`;

    if (id === "overview") {
      const keys = ["projects", "bots", "news", "products", "purchase_requests", "support_tickets", "contact_messages", "visitor_registry"];
      const cards = [];
      for (const tb of keys) {
        const { count } = await sb.from(tb).select("*", { count: "exact", head: true });
        cards.push(`<div class="glass"><div style="color:var(--muted);font-size:0.85rem">${escapeHtml(tb)}</div><div style="font-size:1.6rem;font-weight:700">${count ?? 0}</div></div>`);
      }
      panel.innerHTML = `<div class="grid">${cards.join("")}</div>
        <p style="color:var(--muted);margin-top:1rem">Role: <strong>${escapeHtml(profile.role)}</strong></p>`;
      return;
    }

    if (TABLES[id]) {
      await renderCrud(panel, sb, id, TABLES[id], profile);
      return;
    }

    // read-only / status tables
    const { data, error } = await sb.from(id).select("*").order("created_at", { ascending: false }).limit(100);
    if (error) {
      panel.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
      return;
    }
    if (!data?.length) {
      panel.innerHTML = `<div class="empty">${t("sections.empty")}</div>`;
      return;
    }
    const cols = Object.keys(data[0]).filter((c) => !["keys", "body", "admin_note"].includes(c) || profile.role === "owner").slice(0, 8);
    let extra = "";
    if (id === "purchase_requests" || id === "support_tickets") {
      extra = `<p style="color:var(--muted);font-size:0.85rem">Update status with the row actions below.</p>`;
    }
    panel.innerHTML = `${extra}<div style="overflow:auto"><table class="admin-table"><thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}<th></th></tr></thead>
      <tbody>${data.map((row) => `<tr>${cols.map((c) => `<td>${escapeHtml(String(row[c] ?? "").slice(0, 60))}</td>`).join("")}
        <td>${statusActions(id, row)}</td></tr>`).join("")}</tbody></table></div>`;

    panel.querySelectorAll("[data-status]").forEach((btn) => {
      btn.onclick = async () => {
        const table = btn.getAttribute("data-table");
        const rid = btn.getAttribute("data-id");
        const status = btn.getAttribute("data-status");
        const { error: upErr } = await sb.from(table).update({ status }).eq("id", rid);
        if (upErr) toast(upErr.message, "err");
        else { toast(t("sections.success"), "ok"); show(id); }
      };
    });
  }

  function statusActions(table, row) {
    if (table === "purchase_requests") {
      return ["pending", "reviewing", "approved", "rejected", "completed"].map((s) =>
        `<button type="button" class="btn btn-ghost" style="padding:4px 8px;font-size:0.75rem;width:auto;display:inline-block;margin:2px" data-table="${table}" data-id="${row.id}" data-status="${s}">${s}</button>`
      ).join("");
    }
    if (table === "support_tickets") {
      return ["new", "in_progress", "waiting", "resolved", "closed"].map((s) =>
        `<button type="button" class="btn btn-ghost" style="padding:4px 8px;font-size:0.75rem;width:auto;display:inline-block;margin:2px" data-table="${table}" data-id="${row.id}" data-status="${s}">${s}</button>`
      ).join("");
    }
    return "";
  }

  side.addEventListener("click", (e) => {
    const id = e.target.dataset?.id;
    if (id) show(id);
  });
  show("overview");
}

async function renderCrud(panel, sb, table, def) {
  const { data, error } = await sb.from(table).select("*").order("created_at", { ascending: false }).limit(100);
  if (error) {
    panel.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }
  const rows = data || [];
  panel.innerHTML = `
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem">
      <button type="button" class="btn btn-primary" id="btn-new">+ New</button>
      <input type="search" id="crud-q" placeholder="Search" style="padding:0.65rem 0.85rem;border-radius:12px;border:1px solid var(--border);background:var(--bg-elevated);min-width:180px" />
    </div>
    <div id="crud-list"></div>
    <div id="crud-form-wrap" style="display:none;margin-top:1rem" class="glass"></div>`;

  const list = panel.querySelector("#crud-list");
  function paint(filter = "") {
    const f = filter.toLowerCase();
    const filtered = rows.filter((r) => !f || JSON.stringify(r).toLowerCase().includes(f));
    if (!filtered.length) {
      list.innerHTML = `<div class="empty">${t("sections.empty")}</div>`;
      return;
    }
    list.innerHTML = `<div style="overflow:auto"><table class="admin-table"><thead><tr>
      <th>title/name</th><th>published</th><th>updated</th><th></th></tr></thead><tbody>
      ${filtered.map((r) => {
        const title = r.title || r.name || r.id;
        const pub = r.is_published ?? r.is_visible;
        return `<tr>
          <td>${escapeHtml(String(title).slice(0, 60))}</td>
          <td>${pub === true ? "✓" : pub === false ? "—" : ""}</td>
          <td>${escapeHtml(formatDate(r.updated_at || r.created_at))}</td>
          <td>
            <button type="button" class="btn btn-ghost" style="padding:4px 10px;width:auto;display:inline-block" data-edit="${r.id}">Edit</button>
            <button type="button" class="btn btn-danger" style="padding:4px 10px;width:auto;display:inline-block" data-del="${r.id}">Del</button>
          </td>
        </tr>`;
      }).join("")}
      </tbody></table></div>`;

    list.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => openForm(rows.find((x) => x.id === btn.getAttribute("data-edit")));
    });
    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("Delete this record?")) return;
        const { error: dErr } = await sb.from(table).delete().eq("id", btn.getAttribute("data-del"));
        if (dErr) toast(dErr.message, "err");
        else {
          toast(t("sections.success"), "ok");
          const idx = rows.findIndex((x) => x.id === btn.getAttribute("data-del"));
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
    wrap.innerHTML = `<h3>${isNew ? "Create" : "Edit"}</h3>
      <form class="form" id="entity-form" style="max-width:100%">
        ${def.fields.map((f) => fieldHtml(f, row?.[f.key])).join("")}
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn-primary" type="submit">${t("sections.submit")}</button>
          <button class="btn btn-ghost" type="button" id="form-cancel">Cancel</button>
        </div>
      </form>`;
    wrap.querySelector("#form-cancel").onclick = () => { wrap.style.display = "none"; };
    wrap.querySelector("#entity-form").onsubmit = async (e) => {
      e.preventDefault();
      const payload = {};
      for (const f of def.fields) {
        const el = e.target.elements[f.key];
        if (!el) continue;
        if (f.type === "bool") payload[f.key] = el.checked;
        else if (f.type === "number") payload[f.key] = el.value === "" ? null : Number(el.value);
        else if (f.type === "datetime") payload[f.key] = el.value ? new Date(el.value).toISOString() : null;
        else payload[f.key] = String(el.value || "").trim();
      }
      if (table === "news" && payload.is_published && !payload.published_at) {
        payload.published_at = new Date().toISOString();
      }
      let err;
      if (isNew) {
        const res = await sb.from(table).insert(payload).select("*").single();
        err = res.error;
        if (res.data) rows.unshift(res.data);
      } else {
        const res = await sb.from(table).update(payload).eq("id", row.id).select("*").single();
        err = res.error;
        if (res.data) {
          const i = rows.findIndex((x) => x.id === row.id);
          if (i >= 0) rows[i] = res.data;
        }
      }
      if (err) toast(err.message, "err");
      else {
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
