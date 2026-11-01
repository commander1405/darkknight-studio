import { CONFIG, isConfigured } from "./config.js";
import { getSupabase } from "./supabase-client.js";
import { visitorId, toast } from "./utils.js";
import { t, getLang, applyI18n } from "./i18n.js";

const LS_ASKED = "dks-push-asked";
const LS_ENABLED = "dks-push-enabled";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function isSecureContextOk() {
  return window.isSecureContext === true || location.hostname === "localhost";
}

export function getPushStatus() {
  if (!pushSupported()) return "unsupported";
  if (!isSecureContextOk()) return "insecure";
  if (!CONFIG.VAPID_PUBLIC_KEY) return "no_vapid";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted" && localStorage.getItem(LS_ENABLED) === "1") return "enabled";
  if (Notification.permission === "granted") return "granted";
  return "default";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function swScope() {
  return location.pathname.includes("/darkknight-studio") ? "/darkknight-studio/" : "/";
}

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  const base = location.pathname.includes("/darkknight-studio") ? "/darkknight-studio" : "";
  return navigator.serviceWorker.register(`${base}/sw.js`, { scope: swScope() });
}

export async function enablePush() {
  if (!pushSupported()) throw new Error(t("push.unsupported"));
  if (!isSecureContextOk()) throw new Error(t("push.insecure"));
  if (!CONFIG.VAPID_PUBLIC_KEY) throw new Error(t("push.noVapid"));

  const perm = await Notification.requestPermission();
  localStorage.setItem(LS_ASKED, "1");
  if (perm !== "granted") {
    throw new Error(t("sections.pushDenied"));
  }

  const reg = await registerSW();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY),
    });
  }
  await saveSubscription(sub);
  localStorage.setItem(LS_ENABLED, "1");
  return sub;
}

export async function disablePush() {
  localStorage.setItem(LS_ENABLED, "0");
  localStorage.setItem(LS_ASKED, "1");
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      if (isConfigured()) {
        const sb = await getSupabase();
        if (sb) {
          await sb.from("push_subscriptions").upsert(
            {
              endpoint,
              is_active: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "endpoint" }
          );
        }
      }
    }
  } catch (_) {}
}

async function saveSubscription(sub) {
  if (!isConfigured()) return;
  const sb = await getSupabase();
  if (!sb) return;
  const json = sub.toJSON();
  const keys = json.keys || {};
  let user_id = null;
  try {
    const { data: { user } } = await sb.auth.getUser();
    user_id = user?.id || null;
  } catch (_) {}
  const row = {
    endpoint: sub.endpoint,
    visitor_id: visitorId(),
    user_id,
    keys,
    p256dh: keys.p256dh || null,
    auth: keys.auth || null,
    user_agent: navigator.userAgent.slice(0, 240),
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
}

/** Glass prompt — only after delay, never auto request permission */
export function maybeShowPushPrompt() {
  if (location.pathname.includes("admin")) return;
  if (localStorage.getItem(LS_ASKED) === "1") return;
  if (!pushSupported()) return;
  if (Notification.permission !== "default") {
    localStorage.setItem(LS_ASKED, "1");
    return;
  }
  if (document.getElementById("push-prompt")) return;

  setTimeout(() => {
    if (localStorage.getItem(LS_ASKED) === "1") return;
    if (document.getElementById("push-prompt")) return;
    const el = document.createElement("div");
    el.id = "push-prompt";
    el.className = "push-prompt";
    el.setAttribute("role", "dialog");
    el.innerHTML = `
      <div class="push-prompt-card glass">
        <div class="push-prompt-ico" aria-hidden="true">🔔</div>
        <h3 data-i18n="push.title"></h3>
        <p data-i18n="push.body"></p>
        <div class="push-prompt-actions">
          <button type="button" class="btn btn-primary" id="push-enable" data-i18n="sections.enablePush"></button>
          <button type="button" class="btn btn-ghost" id="push-later" data-i18n="push.later"></button>
        </div>
        <p class="push-prompt-note" data-i18n="push.note"></p>
      </div>`;
    document.body.appendChild(el);
    applyI18n();
    el.querySelector("#push-later").onclick = () => {
      localStorage.setItem(LS_ASKED, "1");
      el.remove();
    };
    el.querySelector("#push-enable").onclick = async () => {
      const btn = el.querySelector("#push-enable");
      btn.disabled = true;
      try {
        if (!CONFIG.VAPID_PUBLIC_KEY) {
          toast(t("push.noVapid"), "err");
          return;
        }
        await enablePush();
        toast(t("sections.pushEnabled"), "ok");
        el.remove();
      } catch (err) {
        toast(err.message || t("sections.error"), "err");
        btn.disabled = false;
      }
    };
  }, 5000);
}

/** Compact control for notifications.html / settings */
export function renderPushSettings(container) {
  if (!container) return;
  const status = getPushStatus();
  const labels = {
    unsupported: t("push.unsupported"),
    insecure: t("push.insecure"),
    no_vapid: t("push.noVapid"),
    denied: t("sections.pushDenied"),
    enabled: t("sections.pushEnabled"),
    granted: t("push.grantedIdle"),
    default: t("push.default"),
  };
  container.innerHTML = `
    <div class="glass push-settings">
      <h2 data-i18n="push.settingsTitle"></h2>
      <p class="push-status">${labels[status] || status}</p>
      <div class="push-prompt-actions">
        <button type="button" class="btn btn-primary" id="ps-on" data-i18n="sections.enablePush"></button>
        <button type="button" class="btn btn-ghost" id="ps-off" data-i18n="push.disable"></button>
      </div>
      <p class="media-hint" data-i18n="push.browserHelp"></p>
    </div>`;
  applyI18n();
  container.querySelector("#ps-on").onclick = async () => {
    try {
      await enablePush();
      toast(t("sections.pushEnabled"), "ok");
      renderPushSettings(container);
    } catch (e) {
      toast(e.message || t("sections.error"), "err");
    }
  };
  container.querySelector("#ps-off").onclick = async () => {
    await disablePush();
    toast(t("push.disabled"), "ok");
    renderPushSettings(container);
  };
}
