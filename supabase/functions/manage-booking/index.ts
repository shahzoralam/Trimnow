import { admin, corsHeaders, json, openSlots, randomToken, sha256 } from "../_shared/scheduling.ts";

const mobilePattern = /^05[0-9]{8}$/;
const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await request.json();
    const remote = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const keyHash = await sha256(remote);
    const { data: allowed, error: limitError } = await admin.rpc("check_rate_limit", { _bucket: "booking_write", _key_hash: keyHash, _max: 10, _window_seconds: 60 });
    if (limitError || !allowed) return json({ error: "rate_limited" }, 429);

    if (body.action === "create") {
      const { shop_id, service_id, barber_id, starts_at, customer_name, customer_mobile, building, apartment, language } = body;
      if (typeof shop_id !== "string" || typeof service_id !== "string" || (barber_id !== null && typeof barber_id !== "string") || typeof starts_at !== "string" || !text(customer_name, 100) || customer_name.trim().length < 2 || typeof customer_mobile !== "string" || !mobilePattern.test(customer_mobile) || !text(building, 50) || !text(apartment, 20) || !["en", "ar"].includes(language)) return json({ error: "invalid_request" }, 400);
      const requestedStart = new Date(starts_at);
      if (Number.isNaN(requestedStart.getTime())) return json({ error: "invalid_request" }, 400);
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(requestedStart);
      const slots = await openSlots(shop_id, service_id, date, barber_id);
      const slot = slots.find((s) => s.starts_at === requestedStart.toISOString());
      if (!slot) return json({ error: "slot_unavailable" }, 409);
      const { data: shop } = await admin.from("shops").select("community_id").eq("id", shop_id).single();
      const { data: service } = await admin.from("services").select("price_sar,duration_min").eq("id", service_id).eq("shop_id", shop_id).single();
      if (!shop || !service) return json({ error: "not_found" }, 404);
      const { data: eligible } = await admin.from("barbers").select("id").eq("shop_id", shop_id).eq("is_active", true).eq("id", barber_id ?? "00000000-0000-0000-0000-000000000000");
      const available = await Promise.all((barber_id ? [barber_id] : (await admin.from("barber_services").select("barber_id").eq("service_id", service_id)).data?.map((row) => row.barber_id) ?? []).map(async (id) => ({ id, slots: await openSlots(shop_id, service_id, date, id) })));
      const chosen = available.find((item) => item.slots.some((s) => s.starts_at === slot.starts_at));
      if (!chosen || (barber_id && !eligible?.length)) return json({ error: "slot_unavailable" }, 409);
      const token = randomToken();
      const tokenHash = await sha256(token);
      const { data: booking, error } = await admin.from("bookings").insert({
        community_id: shop.community_id,
        shop_id,
        barber_id: chosen.id,
        service_id,
        requested_any_barber: barber_id === null,
        price_sar: service.price_sar,
        duration_min: service.duration_min,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        customer_name: customer_name.trim(),
        customer_mobile,
        building: building.trim(),
        apartment: apartment.trim(),
        language,
        manage_token_hash: tokenHash,
      }).select("id,starts_at,ends_at,price_sar,duration_min,status,shop_id,barber_id,service_id").single();
      if (error) return json({ error: error.code === "23P01" ? "slot_unavailable" : "booking_failed" }, error.code === "23P01" ? 409 : 400);
      return json({ booking, manage_token: token }, 201);
    }

    if (body.action === "lookup" || body.action === "cancel" || body.action === "reschedule") {
      if (typeof body.manage_token !== "string" || body.manage_token.length < 32 || body.manage_token.length > 100) return json({ error: "invalid_token" }, 400);
      const { data: booking } = await admin.from("bookings").select("*").eq("manage_token_hash", await sha256(body.manage_token)).single();
      if (!booking) return json({ error: "not_found" }, 404);
      if (body.action === "lookup") return json({ booking: { id: booking.id, starts_at: booking.starts_at, ends_at: booking.ends_at, status: booking.status, shop_id: booking.shop_id, service_id: booking.service_id, barber_id: booking.barber_id, requested_any_barber: booking.requested_any_barber } });
      if (booking.status !== "confirmed") return json({ error: "booking_not_active" }, 409);
      const { data: shop } = await admin.from("shops").select("cancel_cutoff_min").eq("id", booking.shop_id).single();
      if (!shop || new Date(booking.starts_at).getTime() - Date.now() < shop.cancel_cutoff_min * 60_000) return json({ error: "cutoff_passed" }, 409);
      if (body.action === "cancel") {
        const { error } = await admin.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
        if (error) return json({ error: "booking_failed" }, 400);
        return json({ ok: true });
      }
      if (typeof body.starts_at !== "string") return json({ error: "invalid_request" }, 400);
      const requestedStart = new Date(body.starts_at);
      if (Number.isNaN(requestedStart.getTime())) return json({ error: "invalid_request" }, 400);
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(requestedStart);
      const candidates = booking.requested_any_barber ? (await admin.from("barber_services").select("barber_id").eq("service_id", booking.service_id)).data?.map((r) => r.barber_id) ?? [] : [booking.barber_id];
      let chosen: { id: string; slot: { starts_at: string; ends_at: string } } | null = null;
      for (const id of candidates) {
        const slots = await openSlots(booking.shop_id, booking.service_id, date, id);
        const slot = slots.find((s) => s.starts_at === requestedStart.toISOString());
        if (slot) { chosen = { id, slot }; break; }
      }
      if (!chosen) return json({ error: "slot_unavailable" }, 409);
      const { data: updated, error } = await admin.from("bookings").update({ starts_at: chosen.slot.starts_at, ends_at: chosen.slot.ends_at, barber_id: chosen.id }).eq("id", booking.id).select("id,starts_at,ends_at,status").single();
      if (error) return json({ error: error.code === "23P01" ? "slot_unavailable" : "booking_failed" }, 409);
      return json({ booking: updated });
    }
    return json({ error: "invalid_action" }, 400);
  } catch {
    return json({ error: "request_failed" }, 500);
  }
});
