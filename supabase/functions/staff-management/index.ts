import { createClient } from "npm:@supabase/supabase-js@2";
import { admin, corsHeaders, json, sha256 } from "../_shared/scheduling.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const publicKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!;
const allowedStatus = ["confirmed", "cancelled", "completed", "no_show"];
const allowed = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

async function authenticate(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  return { user: data.user, roles: roles?.map((row) => row.role) ?? [] };
}

async function canManageBarber(userId: string, isAdmin: boolean, barberId: string) {
  if (isAdmin) return true;
  const { data } = await admin.from("barbers").select("id").eq("id", barberId).eq("user_id", userId).eq("is_active", true).maybeSingle();
  return Boolean(data);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const auth = await authenticate(request);
    if (!auth) return json({ error: "unauthorized" }, 401);
    const body = await request.json();
    const isAdmin = auth.roles.includes("admin");
    const isBarber = auth.roles.includes("barber");
    const remoteHash = await sha256(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? auth.user.id);
    const { data: rateAllowed, error: rateError } = await admin.rpc("check_rate_limit", { _bucket: "staff_write", _key_hash: remoteHash, _max: 60, _window_seconds: 60 });
    if (rateError || !rateAllowed) return json({ error: "rate_limited" }, 429);

    if (body.action === "set-booking-status") {
      if ((!isAdmin && !isBarber) || typeof body.booking_id !== "string" || !allowedStatus.includes(body.status)) return json({ error: "forbidden" }, 403);
      const { data: booking } = await admin.from("bookings").select("barber_id").eq("id", body.booking_id).maybeSingle();
      if (!booking || !(await canManageBarber(auth.user.id, isAdmin, booking.barber_id))) return json({ error: "forbidden" }, 403);
      const { error } = await admin.from("bookings").update({ status: body.status }).eq("id", body.booking_id);
      return error ? json({ error: "update_failed" }, 400) : json({ ok: true });
    }

    if (["save-hours", "save-breaks", "save-holiday", "delete-holiday"].includes(body.action)) {
      if ((!isAdmin && !isBarber) || typeof body.barber_id !== "string" || !(await canManageBarber(auth.user.id, isAdmin, body.barber_id))) return json({ error: "forbidden" }, 403);
      if (body.action === "save-hours") {
        if (!Array.isArray(body.hours) || body.hours.some((h: Record<string, unknown>) => typeof h.weekday !== "number" || !Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6 || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(h.open_time)) || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(h.close_time)) || String(h.open_time) >= String(h.close_time))) return json({ error: "invalid_request" }, 400);
        const { error } = await admin.from("working_hours").upsert(body.hours.map((h: Record<string, unknown>) => ({ barber_id: body.barber_id, weekday: h.weekday, open_time: h.open_time, close_time: h.close_time })), { onConflict: "barber_id,weekday" });
        return error ? json({ error: "save_failed" }, 400) : json({ ok: true });
      }
      if (body.action === "save-breaks") {
        if (!Number.isInteger(body.weekday) || body.weekday < 0 || body.weekday > 6 || !Array.isArray(body.breaks) || body.breaks.some((b: Record<string, unknown>) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.start_time)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.end_time)) || String(b.start_time) >= String(b.end_time))) return json({ error: "invalid_request" }, 400);
        const { error: deleteError } = await admin.from("breaks").delete().eq("barber_id", body.barber_id).eq("weekday", body.weekday);
        if (deleteError) return json({ error: "save_failed" }, 400);
        if (body.breaks.length) {
          const { error } = await admin.from("breaks").insert(body.breaks.map((b: Record<string, unknown>) => ({ barber_id: body.barber_id, weekday: body.weekday, start_time: b.start_time, end_time: b.end_time })));
          if (error) return json({ error: "save_failed" }, 400);
        }
        return json({ ok: true });
      }
      if (body.action === "save-holiday") {
        const { data: barber } = await admin.from("barbers").select("shop_id").eq("id", body.barber_id).single();
        if (!barber || typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return json({ error: "invalid_request" }, 400);
        const { data: existing } = await admin.from("holidays").select("id").eq("barber_id", body.barber_id).eq("date", body.date).maybeSingle();
        const holiday = { barber_id: body.barber_id, shop_id: barber.shop_id, date: body.date, reason: typeof body.reason === "string" ? body.reason.slice(0, 200) : null };
        const { error } = existing
          ? await admin.from("holidays").update({ reason: holiday.reason }).eq("id", existing.id)
          : await admin.from("holidays").insert(holiday);
        return error ? json({ error: "save_failed" }, 400) : json({ ok: true });
      }
      const { error } = await admin.from("holidays").delete().eq("id", body.holiday_id).eq("barber_id", body.barber_id);
      return error ? json({ error: "delete_failed" }, 400) : json({ ok: true });
    }

    if (!isAdmin) return json({ error: "forbidden" }, 403);
    if (body.action === "save-community") {
      const row = body.community;
      if (!row || !allowed(row.name_en, 120) || !allowed(row.name_ar, 120) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(row.slug))) return json({ error: "invalid_request" }, 400);
      const payload = { ...(typeof row.id === "string" && row.id ? { id: row.id } : {}), name_en: row.name_en.trim(), name_ar: row.name_ar.trim(), slug: row.slug, is_active: row.is_active !== false };
      const { data, error } = await admin.from("communities").upsert(payload).select("id,name_en,name_ar,slug,is_active").single();
      return error ? json({ error: "save_failed" }, 400) : json({ community: data });
    }
    if (body.action === "save-shop") {
      const row = body.shop;
      if (!row || typeof row.community_id !== "string" || !allowed(row.name_en, 120) || !allowed(row.name_ar, 120) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(row.slug))) return json({ error: "invalid_request" }, 400);
      if (typeof row.id === "string" && row.id) {
        const { data: existing } = await admin.from("shops").select("community_id").eq("id", row.id).maybeSingle();
        if (existing && existing.community_id !== row.community_id) return json({ error: "shop_community_immutable" }, 400);
      }
      const payload = { ...(typeof row.id === "string" && row.id ? { id: row.id } : {}), community_id: row.community_id, slug: row.slug, name_en: row.name_en.trim(), name_ar: row.name_ar.trim(), description_en: typeof row.description_en === "string" ? row.description_en.slice(0, 1000) : null, description_ar: typeof row.description_ar === "string" ? row.description_ar.slice(0, 1000) : null, phone: row.phone || null, location_note: row.location_note || null, is_active: row.is_active !== false };
      const { data, error } = await admin.from("shops").upsert(payload).select("id,community_id,slug,name_en,name_ar,is_active").single();
      return error ? json({ error: "save_failed" }, 400) : json({ shop: data });
    }
    if (body.action === "save-service") {
      const row = body.service;
      if (!row || typeof row.shop_id !== "string" || !allowed(row.name_en, 120) || !allowed(row.name_ar, 120) || !Number.isFinite(Number(row.price_sar)) || Number(row.price_sar) < 0 || Number(row.price_sar) > 10000 || !Number.isInteger(Number(row.duration_min)) || Number(row.duration_min) < 5 || Number(row.duration_min) > 480) return json({ error: "invalid_request" }, 400);
      if (typeof row.id === "string" && row.id) {
        const { data: existing } = await admin.from("services").select("shop_id").eq("id", row.id).maybeSingle();
        if (existing && existing.shop_id !== row.shop_id) return json({ error: "service_shop_immutable" }, 400);
      }
      const payload = { ...(typeof row.id === "string" && row.id ? { id: row.id } : {}), shop_id: row.shop_id, name_en: row.name_en.trim(), name_ar: row.name_ar.trim(), price_sar: Number(row.price_sar), duration_min: Number(row.duration_min), is_active: row.is_active !== false };
      const { data, error } = await admin.from("services").upsert(payload).select("id,shop_id,name_en,name_ar,price_sar,duration_min,is_active").single();
      return error ? json({ error: "save_failed" }, 400) : json({ service: data });
    }
    if (body.action === "set-barber-active") {
      if (typeof body.barber_id !== "string" || typeof body.is_active !== "boolean") return json({ error: "invalid_request" }, 400);
      const { error } = await admin.from("barbers").update({ is_active: body.is_active }).eq("id", body.barber_id);
      return error ? json({ error: "update_failed" }, 400) : json({ ok: true });
    }
    if (body.action === "create-barber") {
      const row = body.barber;
      if (!row || typeof row.shop_id !== "string" || !allowed(row.name_en, 80) || !allowed(row.name_ar, 80) || !allowed(row.email, 254) || !allowed(row.password, 128) || row.password.length < 12) return json({ error: "invalid_request" }, 400);
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email: row.email.trim(), password: row.password, email_confirm: true });
      if (createError || !created.user) return json({ error: "account_create_failed" }, 400);
      const userId = created.user.id;
      const { error: roleError } = await admin.from("user_roles").insert({ user_id: userId, role: "barber" });
      if (roleError) { await admin.auth.admin.deleteUser(userId); return json({ error: "account_create_failed" }, 400); }
      const { data: barber, error: barberError } = await admin.from("barbers").insert({ user_id: userId, shop_id: row.shop_id, name_en: row.name_en.trim(), name_ar: row.name_ar.trim() }).select("id,name_en,name_ar,shop_id").single();
      if (barberError) {
        await admin.from("user_roles").delete().eq("user_id", userId);
        await admin.auth.admin.deleteUser(userId);
        return json({ error: "account_create_failed" }, 400);
      }
      return json({ barber }, 201);
    }
    if (body.action === "assign-services") {
      if (typeof body.barber_id !== "string" || !Array.isArray(body.service_ids) || body.service_ids.some((id: unknown) => typeof id !== "string")) return json({ error: "invalid_request" }, 400);
      const { error: deleteError } = await admin.from("barber_services").delete().eq("barber_id", body.barber_id);
      if (deleteError) return json({ error: "save_failed" }, 400);
      if (body.service_ids.length) {
        const { error } = await admin.from("barber_services").insert(body.service_ids.map((service_id: string) => ({ barber_id: body.barber_id, service_id })));
        if (error) return json({ error: "save_failed" }, 400);
      }
      return json({ ok: true });
    }
    return json({ error: "invalid_action" }, 400);
  } catch {
    return json({ error: "request_failed" }, 500);
  }
});
