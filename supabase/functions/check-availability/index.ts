import { admin, corsHeaders, json, openSlots, sha256 } from "../_shared/scheduling.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await request.json();
    const { shop_id, service_id, date, barber_id } = body;
    if (typeof shop_id !== "string" || typeof service_id !== "string" || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (barber_id !== null && barber_id !== undefined && typeof barber_id !== "string")) return json({ error: "invalid_request" }, 400);
    const remote = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const keyHash = await sha256(remote);
    const { data: allowed, error: limitError } = await admin.rpc("check_rate_limit", { _bucket: "availability", _key_hash: keyHash, _max: 60, _window_seconds: 60 });
    if (limitError || !allowed) return json({ error: "rate_limited" }, 429);
    const slots = await openSlots(shop_id, service_id, date, barber_id);
    return json({ slots });
  } catch {
    return json({ error: "unavailable" }, 500);
  }
});
