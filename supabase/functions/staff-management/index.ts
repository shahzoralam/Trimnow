import { createClient } from "npm:@supabase/supabase-js@2";
import { admin, announceAvailability, corsHeaders, json, sha256 } from "../_shared/scheduling.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const publicKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!;
const localBackend = ["localhost", "127.0.0.1", "::1", "kong"].includes(new URL(url).hostname);
const allowedStatus = ["confirmed", "cancelled", "completed", "no_show"];
const allowed = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

async function authenticate(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (token) {
    const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    if (!error && data.user) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
      return { user: data.user, roles: roles?.map((row) => row.role) ?? [] };
    }
  }
  if (localBackend) return { user: { id: "local-development", email: "admin@localhost" }, roles: ["admin"] };
  return null;
}

async function canManageBarber(userId: string, isAdmin: boolean, barberId: string) {
  if (isAdmin) return true;
  const { data } = await admin.from("barbers").select("id").eq("id", barberId).eq("user_id", userId).eq("is_active", true).maybeSingle();
  return Boolean(data);
}

async function getOwnBarber(userId: string) {
  const { data } = await admin.from("barbers").select("id,shop_id,name_en,name_ar,user_id,is_active").eq("user_id", userId).eq("is_active", true).maybeSingle();
  return data;
}

async function announceBarberAvailability(barberId: string) {
  const { data } = await admin.from("barbers").select("shop_id").eq("id", barberId).single();
  if (data) await announceAvailability(data.shop_id);
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

    if (body.action === "get-own-availability" && isBarber && !isAdmin) {
      const barber = await getOwnBarber(auth.user.id);
      if (!barber) return json({ error: "barber_not_found" }, 404);
      const todayRiyadh = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const [hours, breaks, holidays, timeBlocks] = await Promise.all([
        admin.from("working_hours").select("*").eq("barber_id", barber.id).order("weekday"),
        admin.from("breaks").select("*").eq("barber_id", barber.id).order("weekday"),
        admin.from("holidays").select("*").eq("barber_id", barber.id).gte("date", todayRiyadh).order("date"),
        admin.from("barber_time_blocks").select("*").eq("barber_id", barber.id).gte("block_date", todayRiyadh).order("block_date").order("start_time"),
      ]);
      if (hours.error || breaks.error || holidays.error || timeBlocks.error) return json({ error: "load_failed" }, 500);
      return json({ barber, hours: hours.data, breaks: breaks.data, holidays: holidays.data, time_blocks: timeBlocks.data });
    }
    if (body.action === "get-dashboard" && isAdmin) {
      const [communities, shops, services, barbers, bookings] = await Promise.all([
        admin.from("communities").select("*").order("name_en"),
        admin.from("shops").select("*").order("name_en"),
        admin.from("services").select("*").order("sort_order"),
        admin.from("barbers").select("*").order("name_en"),
        admin.from("bookings").select("*").order("starts_at"),
      ]);
      if (communities.error || shops.error || services.error || barbers.error || bookings.error) return json({ error: "load_failed" }, 500);
      return json({ communities: communities.data, shops: shops.data, services: services.data, barbers: barbers.data, bookings: bookings.data });
    }
    if (body.action === "get-barber-schedule" && isAdmin) {
      if (typeof body.barber_id !== "string") return json({ error: "invalid_request" }, 400);
      const todayRiyadh = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const [hours, breaks, holidays, assignments, timeBlocks] = await Promise.all([
        admin.from("working_hours").select("*").eq("barber_id", body.barber_id).order("weekday"),
        admin.from("breaks").select("*").eq("barber_id", body.barber_id).order("weekday"),
        admin.from("holidays").select("*").eq("barber_id", body.barber_id).gte("date", todayRiyadh).order("date"),
        admin.from("barber_services").select("service_id").eq("barber_id", body.barber_id),
        admin.from("barber_time_blocks").select("*").eq("barber_id", body.barber_id).gte("block_date", todayRiyadh).order("block_date").order("start_time"),
      ]);
      if (hours.error || breaks.error || holidays.error || assignments.error || timeBlocks.error) return json({ error: "load_failed" }, 500);
      return json({ hours: hours.data, breaks: breaks.data, holidays: holidays.data, service_ids: assignments.data.map((row) => row.service_id), time_blocks: timeBlocks.data });
    }

    if (body.action === "set-booking-status") {
      if (!isAdmin || typeof body.booking_id !== "string" || !allowedStatus.includes(body.status)) return json({ error: "forbidden" }, 403);
      const { data: booking } = await admin.from("bookings").select("barber_id,shop_id,status").eq("id", body.booking_id).maybeSingle();
      if (!booking || !(await canManageBarber(auth.user.id, isAdmin, booking.barber_id))) return json({ error: "forbidden" }, 403);
      if (!isAdmin && (booking.status !== "confirmed" || !["confirmed", "completed", "cancelled"].includes(body.status))) return json({ error: "forbidden" }, 403);
      const { error } = await admin.from("bookings").update({ status: body.status }).eq("id", body.booking_id);
      if (error) return json({ error: "update_failed" }, 400);
      await announceAvailability(booking.shop_id);
      return json({ ok: true });
    }

    if (["save-hours", "save-breaks", "save-holiday", "delete-holiday"].includes(body.action)) {
      if (isBarber && !isAdmin) {
        const ownBarber = await getOwnBarber(auth.user.id);
        if (!ownBarber) return json({ error: "forbidden" }, 403);
        body.barber_id = ownBarber.id;
      }
      if ((!isAdmin && !isBarber) || typeof body.barber_id !== "string" || !(await canManageBarber(auth.user.id, isAdmin, body.barber_id))) return json({ error: "forbidden" }, 403);
      if (body.action === "save-hours") {
        if (!Array.isArray(body.hours) || body.hours.length > 7 || body.hours.some((h: Record<string, unknown>) => typeof h.weekday !== "number" || !Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6 || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(h.open_time)) || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(h.close_time)) || String(h.open_time) >= String(h.close_time)) || new Set(body.hours.map((h: Record<string, unknown>) => h.weekday)).size !== body.hours.length) return json({ error: "invalid_request" }, 400);
        const { error } = await admin.from("working_hours").upsert(body.hours.map((h: Record<string, unknown>) => ({ barber_id: body.barber_id, weekday: h.weekday, open_time: h.open_time, close_time: h.close_time })), { onConflict: "barber_id,weekday" });
        if (error) return json({ error: "save_failed" }, 400);
        const scheduledDays = body.hours.map((h: Record<string, unknown>) => h.weekday);
        for (let weekday = 0; weekday < 7; weekday += 1) {
          if (scheduledDays.includes(weekday)) continue;
          const { error: deleteError } = await admin.from("working_hours").delete().eq("barber_id", body.barber_id).eq("weekday", weekday);
          if (deleteError) return json({ error: "save_failed" }, 400);
        }
        await announceBarberAvailability(body.barber_id);
        return json({ ok: true });
      }
      if (body.action === "save-breaks") {
        if (!Number.isInteger(body.weekday) || body.weekday < 0 || body.weekday > 6 || !Array.isArray(body.breaks) || body.breaks.some((b: Record<string, unknown>) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.start_time)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.end_time)) || String(b.start_time) >= String(b.end_time))) return json({ error: "invalid_request" }, 400);
        const { error: deleteError } = await admin.from("breaks").delete().eq("barber_id", body.barber_id).eq("weekday", body.weekday);
        if (deleteError) return json({ error: "save_failed" }, 400);
        if (body.breaks.length) {
          const { error } = await admin.from("breaks").insert(body.breaks.map((b: Record<string, unknown>) => ({ barber_id: body.barber_id, weekday: body.weekday, start_time: b.start_time, end_time: b.end_time })));
          if (error) return json({ error: "save_failed" }, 400);
        }
        await announceBarberAvailability(body.barber_id);
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
        if (error) return json({ error: "save_failed" }, 400);
        await announceAvailability(barber.shop_id);
        return json({ ok: true });
      }
      const { error } = await admin.from("holidays").delete().eq("id", body.holiday_id).eq("barber_id", body.barber_id);
      if (error) return json({ error: "delete_failed" }, 400);
      await announceBarberAvailability(body.barber_id);
      return json({ ok: true });
    }
    if (["save-time-block", "delete-time-block"].includes(body.action)) {
      if (isBarber && !isAdmin) {
        const ownBarber = await getOwnBarber(auth.user.id);
        if (!ownBarber) return json({ error: "forbidden" }, 403);
        body.barber_id = ownBarber.id;
      }
      if ((!isAdmin && !isBarber) || typeof body.barber_id !== "string" || !(await canManageBarber(auth.user.id, isAdmin, body.barber_id))) return json({ error: "forbidden" }, 403);
      if (body.action === "save-time-block") {
      const date = body.block_date;
      const startTime = body.start_time;
      const endTime = body.end_time;
      if (!validDate(date) || typeof startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || typeof endTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime || (body.reason !== undefined && typeof body.reason !== "string")) return json({ error: "invalid_request" }, 400);
      const startsAt = new Date(`${date}T${startTime}:00+03:00`);
      const endsAt = new Date(`${date}T${endTime}:00+03:00`);
      const dayStart = new Date(`${date}T00:00:00+03:00`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const { data: bookings, error: bookingError } = await admin.from("bookings").select("id,starts_at,ends_at").eq("barber_id", body.barber_id).eq("status", "confirmed").lt("starts_at", dayEnd.toISOString()).gt("ends_at", dayStart.toISOString());
      if (bookingError) return json({ error: "load_failed" }, 500);
      if (bookings?.some((booking) => startsAt < new Date(booking.ends_at) && endsAt > new Date(booking.starts_at))) return json({ error: "block_overlaps_booking" }, 409);
      const payload = { barber_id: body.barber_id, block_date: date, start_time: startTime, end_time: endTime, reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : null };
      const result = typeof body.block_id === "string" && body.block_id
        ? await admin.from("barber_time_blocks").update(payload).eq("id", body.block_id).eq("barber_id", body.barber_id).select("id").maybeSingle()
        : await admin.from("barber_time_blocks").insert(payload).select("id").single();
      if (result.error || (typeof body.block_id === "string" && body.block_id && !result.data)) return json({ error: "save_failed" }, 400);
      await announceBarberAvailability(body.barber_id);
      return json({ ok: true });
    }
    if (body.action === "delete-time-block") {
      if (typeof body.block_id !== "string") return json({ error: "invalid_request" }, 400);
      const { data, error } = await admin.from("barber_time_blocks").delete().eq("id", body.block_id).eq("barber_id", body.barber_id).select("id").maybeSingle();
      if (error || !data) return json({ error: "delete_failed" }, 400);
      await announceBarberAvailability(body.barber_id);
      return json({ ok: true });
      }
    }

    if (!isAdmin) return json({ error: "forbidden" }, 403);
    if (body.action === "delete-shop") {
      if (typeof body.shop_id !== "string") return json({ error: "invalid_request" }, 400);
      const [{ data: linkedBarbers }, { count: bookingCount, error: bookingError }] = await Promise.all([
        admin.from("barbers").select("user_id").eq("shop_id", body.shop_id),
        admin.from("bookings").select("id", { count: "exact", head: true }).eq("shop_id", body.shop_id),
      ]);
      if (bookingError) return json({ error: "delete_failed" }, 400);
      if (bookingCount) return json({ error: "shop_has_bookings" }, 409);
      const { error } = await admin.from("shops").delete().eq("id", body.shop_id);
      if (error) return json({ error: "delete_failed" }, 400);
      const userIds = (linkedBarbers ?? []).map((barber) => barber.user_id).filter((id): id is string => Boolean(id));
      if (userIds.length) await admin.from("user_roles").delete().eq("role", "barber").in("user_id", userIds);
      return json({ ok: true });
    }
    if (body.action === "delete-barber") {
      if (typeof body.barber_id !== "string") return json({ error: "invalid_request" }, 400);
      const [{ data: barber }, { count: bookingCount, error: bookingError }] = await Promise.all([
        admin.from("barbers").select("user_id").eq("id", body.barber_id).maybeSingle(),
        admin.from("bookings").select("id", { count: "exact", head: true }).eq("barber_id", body.barber_id),
      ]);
      if (!barber) return json({ error: "not_found" }, 404);
      if (bookingError) return json({ error: "delete_failed" }, 400);
      if (bookingCount) return json({ error: "barber_has_bookings" }, 409);
      const { error } = await admin.from("barbers").delete().eq("id", body.barber_id);
      if (error) return json({ error: "delete_failed" }, 400);
      if (barber.user_id) await admin.from("user_roles").delete().eq("user_id", barber.user_id).eq("role", "barber");
      return json({ ok: true });
    }
    if (body.action === "save-community") {
      const row = body.community;
      if (!row || !allowed(row.name_en, 120) || !allowed(row.name_ar, 120) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(row.slug))) return json({ error: "invalid_request" }, 400);
      const payload = { ...(typeof row.id === "string" && row.id ? { id: row.id } : {}), name_en: row.name_en.trim(), name_ar: row.name_ar.trim(), slug: row.slug, is_active: row.is_active !== false };
      const { data, error } = await admin.from("communities").upsert(payload).select("id,name_en,name_ar,slug,is_active").single();
      if (error) return json({ error: "save_failed" }, 400);
      const { data: communityShops } = await admin.from("shops").select("id").eq("community_id", data.id);
      await Promise.all((communityShops ?? []).map((shop) => announceAvailability(shop.id)));
      return json({ community: data });
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
      if (error) return json({ error: "save_failed" }, 400);
      await announceAvailability(data.id);
      return json({ shop: data });
    }
    if (body.action === "save-barber") {
      const row = body.barber;
      if (!row || typeof row.id !== "string" || typeof row.shop_id !== "string" || !allowed(row.name_en, 80) || !allowed(row.name_ar, 80)) return json({ error: "invalid_request" }, 400);
      const { data: existing } = await admin.from("barbers").select("shop_id").eq("id", row.id).maybeSingle();
      if (!existing) return json({ error: "not_found" }, 404);
      let previousServiceIds: string[] | undefined;
      if (existing.shop_id !== row.shop_id) {
        const { count, error: bookingError } = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("barber_id", row.id);
        if (bookingError) return json({ error: "save_failed" }, 400);
        if (count) return json({ error: "barber_has_bookings" }, 409);
        const { data: assignments, error: assignmentReadError } = await admin.from("barber_services").select("service_id").eq("barber_id", row.id);
        if (assignmentReadError) return json({ error: "save_failed" }, 400);
        previousServiceIds = (assignments ?? []).map((assignment) => assignment.service_id);
        const { error: assignmentError } = await admin.from("barber_services").delete().eq("barber_id", row.id);
        if (assignmentError) return json({ error: "save_failed" }, 400);
      }
      const { error } = await admin.from("barbers").update({ shop_id: row.shop_id, name_en: row.name_en.trim(), name_ar: row.name_ar.trim() }).eq("id", row.id);
      if (error) {
        if (previousServiceIds?.length) await admin.from("barber_services").insert(previousServiceIds.map((service_id) => ({ barber_id: row.id, service_id })));
        return json({ error: "save_failed" }, 400);
      }
      if (existing.shop_id !== row.shop_id) await announceAvailability(existing.shop_id);
      await announceBarberAvailability(row.id);
      return json({ ok: true });
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
      if (error) return json({ error: "save_failed" }, 400);
      await announceAvailability(data.shop_id);
      return json({ service: data });
    }
    if (body.action === "set-barber-active") {
      if (typeof body.barber_id !== "string" || typeof body.is_active !== "boolean") return json({ error: "invalid_request" }, 400);
      const { error } = await admin.from("barbers").update({ is_active: body.is_active }).eq("id", body.barber_id);
      if (error) return json({ error: "update_failed" }, 400);
      await announceBarberAvailability(body.barber_id);
      return json({ ok: true });
    }
    if (body.action === "create-barber") {
      const row = body.barber;
      const hasEmail = typeof row?.email === "string" && row.email.trim().length > 0;
      const hasPassword = typeof row?.password === "string" && row.password.length > 0;
      const localUnlinkedBarber = localBackend && !hasEmail && !hasPassword;
      if (!row || typeof row.shop_id !== "string" || !allowed(row.name_en, 80) || !allowed(row.name_ar, 80) || (!localUnlinkedBarber && (!allowed(row.email, 254) || !allowed(row.password, 128) || row.password.length < 12))) return json({ error: "invalid_request" }, 400);
      if (localUnlinkedBarber) {
        const { data: barber, error } = await admin.from("barbers").insert({ shop_id: row.shop_id, name_en: row.name_en.trim(), name_ar: row.name_ar.trim() }).select("id,name_en,name_ar,shop_id").single();
        if (error) return json({ error: "barber_create_failed" }, 400);
        return json({ barber }, 201);
      }
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
      await announceBarberAvailability(body.barber_id);
      return json({ ok: true });
    }
    return json({ error: "invalid_action" }, 400);
  } catch {
    return json({ error: "request_failed" }, 500);
  }
});
