// Supabase Edge Function: process push_outbox + optional test send
// Secrets required: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Uses service role from Supabase runtime automatically via createClient

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
    if (!vapidPublic || !vapidPrivate) {
      return json({ error: "VAPID secrets not configured" }, 500);
    }
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth: require staff JWT
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("role, is_active, permissions")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.is_active || !["owner", "admin"].includes(profile.role)) {
      return json({ error: "forbidden" }, 403);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode = body.mode || "process_outbox";

    if (mode === "test") {
      if (profile.role !== "owner") return json({ error: "owner_only" }, 403);
      const payload = {
        title: body.title || "DARKKNIGHT STUDIO",
        body: body.body || "Test notification",
        url: body.url || "./index.html",
        tag: "dks-test",
      };
      const result = await sendToAll(admin, payload, webpush);
      await admin.from("notification_logs").insert({
        title: payload.title,
        body: payload.body,
        target_count: result.target,
        success_count: result.ok,
        fail_count: result.fail,
        content_type: "test",
        actor_id: user.id,
      });
      return json({ ok: true, ...result });
    }

    // process pending outbox (max 10)
    const { data: jobs } = await admin
      .from("push_outbox")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    const results = [];
    for (const job of jobs || []) {
      await admin.from("push_outbox").update({ status: "processing" }).eq("id", job.id);
      const payload = {
        title: job.title,
        body: job.body,
        url: job.url,
        tag: `dks-${job.content_type}-${job.content_id}`,
      };
      const result = await sendToAll(admin, payload, webpush);
      await admin.from("notification_logs").insert({
        title: job.title,
        body: job.body,
        target_count: result.target,
        success_count: result.ok,
        fail_count: result.fail,
        content_type: job.content_type,
        content_id: job.content_id,
        actor_id: user.id,
      });
      await admin
        .from("push_outbox")
        .update({
          status: result.fail && !result.ok ? "failed" : "sent",
          processed_at: new Date().toISOString(),
          error: result.lastError || null,
        })
        .eq("id", job.id);
      results.push({ id: job.id, ...result });
    }

    return json({ ok: true, processed: results.length, results });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

async function sendToAll(admin: ReturnType<typeof createClient>, payload: Record<string, string>, webpush: any) {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, keys, p256dh, auth")
    .eq("is_active", true)
    .limit(5000);

  let ok = 0, fail = 0, lastError = "";
  const target = (subs || []).length;
  const body = JSON.stringify(payload);

  for (const s of subs || []) {
    const keys = s.keys || {};
    const p256dh = s.p256dh || keys.p256dh;
    const auth = s.auth || keys.auth;
    if (!s.endpoint || !p256dh || !auth) {
      fail++;
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh, auth } },
        body,
        { TTL: 60 * 60 * 12 },
      );
      ok++;
    } catch (err: any) {
      fail++;
      lastError = String(err?.statusCode || err?.message || err);
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        await admin
          .from("push_subscriptions")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("endpoint", s.endpoint);
      }
    }
  }
  return { target, ok, fail, lastError };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
