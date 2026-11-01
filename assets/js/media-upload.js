import { getSupabase } from "./supabase-client.js";
import { escapeHtml } from "./utils.js";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
]);

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB — matches bucket

const FOLDER_BY_TABLE = {
  projects: "projects",
  bots: "bots",
  news: "news",
  products: "products",
  team_members: "team",
  website_settings: "site",
};

/** Media field keys that get upload UI */
export const MEDIA_FIELDS = new Set([
  "cover_url",
  "avatar_url",
  "image_url",
  "banner_url",
  "thumbnail_url",
  "video_url",
  "logo_url",
  "background_url",
]);

function extFromMime(mime) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[mime] || "bin";
}

function uniqueName(file) {
  const safe = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40);
  const ext = extFromMime(file.type) || safe.split(".").pop() || "bin";
  const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${id}_${safe.endsWith("." + ext) ? safe : safe + "." + ext}`;
}

/**
 * Upload a File to site-media bucket.
 * @returns {Promise<string>} public URL
 */
export async function uploadSiteMedia(file, table) {
  if (!file) throw new Error("No file selected");
  if (!ALLOWED.has(file.type)) {
    throw new Error("Unsupported file type. Use JPG, PNG, WebP, GIF, AVIF, MP4, or WebM.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File too large (max 100 MB).");
  }
  const sb = await getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const folder = FOLDER_BY_TABLE[table] || "misc";
  const path = `${folder}/${uniqueName(file)}`;

  const { error: upErr } = await sb.storage.from("site-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (upErr) throw new Error(upErr.message || "Upload failed");

  const { data } = sb.storage.from("site-media").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Could not resolve public URL");
  return data.publicUrl;
}

/**
 * Build media field HTML: preview + file input + optional URL.
 */
export function mediaFieldHtml(fieldKey, value, lang = "en") {
  const choose = lang === "fa" ? "انتخاب فایل" : "Choose file";
  const orUrl = lang === "fa" ? "یا آدرس خارجی" : "or external URL";
  const hint = lang === "fa"
    ? "تصویر، GIF یا ویدیو (حداکثر ۱۰۰ مگابایت)"
    : "Image, GIF, or video (max 100 MB)";
  const v = value || "";
  let preview = "";
  if (v) {
    const lower = v.toLowerCase();
    if (/\.(mp4|webm)(\?|$)/.test(lower) || lower.includes("video")) {
      preview = `<video class="media-preview" src="${escapeHtml(v)}" controls muted playsinline></video>`;
    } else {
      preview = `<img class="media-preview" src="${escapeHtml(v)}" alt="" />`;
    }
  }
  return `
    <div class="media-field" data-media-field="${escapeHtml(fieldKey)}">
      <span class="media-label">${escapeHtml(fieldKey)}</span>
      <div class="media-preview-wrap" data-preview>${preview || `<span class="media-placeholder">—</span>`}</div>
      <div class="media-actions">
        <label class="btn btn-ghost media-pick">
          ${choose}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm" hidden data-file />
        </label>
        <span class="media-status" data-status></span>
      </div>
      <p class="media-hint">${hint}</p>
      <label class="media-url-label"><span>${orUrl}</span>
        <input type="url" name="${escapeHtml(fieldKey)}" value="${escapeHtml(v)}" data-url-input placeholder="https://…" />
      </label>
    </div>`;
}

/**
 * Wire upload handlers inside a form root element.
 * Disables submit while uploading.
 */
export function bindMediaFields(formEl, table, onError) {
  if (!formEl) return;
  const submitBtns = formEl.querySelectorAll('button[type="submit"]');
  formEl.querySelectorAll("[data-media-field]").forEach((wrap) => {
    const fileInput = wrap.querySelector("[data-file]");
    const urlInput = wrap.querySelector("[data-url-input]");
    const preview = wrap.querySelector("[data-preview]");
    const status = wrap.querySelector("[data-status]");
    if (!fileInput || !urlInput) return;

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      status.textContent = "…";
      submitBtns.forEach((b) => { b.disabled = true; });
      try {
        // local preview
        const localUrl = URL.createObjectURL(file);
        if (file.type.startsWith("video/")) {
          preview.innerHTML = `<video class="media-preview" src="${localUrl}" controls muted playsinline></video>`;
        } else {
          preview.innerHTML = `<img class="media-preview" src="${localUrl}" alt="" />`;
        }
        const publicUrl = await uploadSiteMedia(file, table);
        urlInput.value = publicUrl;
        if (file.type.startsWith("video/")) {
          preview.innerHTML = `<video class="media-preview" src="${escapeHtml(publicUrl)}" controls muted playsinline></video>`;
        } else {
          preview.innerHTML = `<img class="media-preview" src="${escapeHtml(publicUrl)}" alt="" />`;
        }
        status.textContent = "✓";
        status.style.color = "var(--ok, #22c55e)";
      } catch (err) {
        status.textContent = "✕";
        status.style.color = "#fca5a5";
        onError?.(err.message || String(err));
      } finally {
        submitBtns.forEach((b) => { b.disabled = false; });
        fileInput.value = "";
      }
    });

    urlInput.addEventListener("change", () => {
      const v = urlInput.value.trim();
      if (!v) {
        preview.innerHTML = `<span class="media-placeholder">—</span>`;
        return;
      }
      if (/\.(mp4|webm)(\?|$)/i.test(v)) {
        preview.innerHTML = `<video class="media-preview" src="${escapeHtml(v)}" controls muted playsinline></video>`;
      } else {
        preview.innerHTML = `<img class="media-preview" src="${escapeHtml(v)}" alt="" />`;
      }
    });
  });
}
