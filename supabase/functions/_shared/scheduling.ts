import { createClient } from "npm:@supabase/supabase-js@2";

export const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export function riyadhInstant(date: string, time: string) {
  return new Date(`${date}T${time}+03:00`);
}

export async function openSlots(shopId: string, serviceId: string, date: string, barberId?: string | null) {
  const [{ data: shop }, { data: service }] = await Promise.all([
    admin.from("shops").select("id,slot_interval_min,min_lead_time_min,booking_window_days,is_active").eq("id", shopId).eq("is_active", true).single(),
    admin.from("services").select("id,duration_min").eq("id", serviceId).eq("shop_id", shopId).eq("is_active", true).single(),
  ]);
  if (!shop || !service || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const dayStart = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(dayStart.getTime()) || dayStart.toISOString().slice(0, 10) !== date) return [];
  const todayRiyadh = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const today = new Date(`${todayRiyadh}T00:00:00Z`);
  const maxDay = new Date(today.getTime() + shop.booking_window_days * 86_400_000);
  if (dayStart < today || dayStart > maxDay) return [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  let query = admin.from("barbers").select("id,barber_services!inner(service_id)").eq("shop_id", shopId).eq("is_active", true).eq("barber_services.service_id", serviceId);
  if (barberId) query = query.eq("id", barberId);
  const { data: barbers } = await query;
  if (!barbers?.length) return [];
  const ids = barbers.map((b) => b.id);
  const [{ data: hours }, { data: breaks }, { data: barberHolidays }, { data: shopHoliday }, { data: bookings }] = await Promise.all([
    admin.from("working_hours").select("barber_id,open_time,close_time").in("barber_id", ids).eq("weekday", weekday),
    admin.from("breaks").select("barber_id,start_time,end_time").in("barber_id", ids).eq("weekday", weekday),
    admin.from("holidays").select("barber_id").in("barber_id", ids).eq("date", date),
    admin.from("holidays").select("id").eq("shop_id", shopId).is("barber_id", null).eq("date", date).maybeSingle(),
    admin.from("bookings").select("barber_id,starts_at,ends_at").in("barber_id", ids).lt("starts_at", `${date}T23:59:59+03:00`).gt("ends_at", `${date}T00:00:00+03:00`).neq("status", "cancelled"),
  ]);
  if (shopHoliday) return [];
  const result = new Map<string, { starts_at: string; ends_at: string; time: string }>();
  const now = Date.now() + shop.min_lead_time_min * 60_000;
  for (const barber of barbers) {
    if (barberHolidays?.some((h) => h.barber_id === barber.id)) continue;
    const schedule = hours?.find((h) => h.barber_id === barber.id);
    if (!schedule) continue;
    const [openH, openM] = schedule.open_time.split(":").map(Number);
    const [closeH, closeM] = schedule.close_time.split(":").map(Number);
    const opening = openH * 60 + openM;
    const closing = closeH * 60 + closeM;
    for (let minute = opening; minute + service.duration_min <= closing; minute += shop.slot_interval_min) {
      const hour = String(Math.floor(minute / 60)).padStart(2, "0");
      const mins = String(minute % 60).padStart(2, "0");
      const endMinute = minute + service.duration_min;
      const endHour = String(Math.floor(endMinute / 60)).padStart(2, "0");
      const endMins = String(endMinute % 60).padStart(2, "0");
      const start = riyadhInstant(date, `${hour}:${mins}:00`);
      const end = riyadhInstant(date, `${endHour}:${endMins}:00`);
      if (start.getTime() < now) continue;
      const overlapsBreak = breaks?.some((b) => {
        if (b.barber_id !== barber.id) return false;
        const breakStart = Number(b.start_time.slice(0, 2)) * 60 + Number(b.start_time.slice(3, 5));
        const breakEnd = Number(b.end_time.slice(0, 2)) * 60 + Number(b.end_time.slice(3, 5));
        return minute < breakEnd && endMinute > breakStart;
      });
      if (overlapsBreak || bookings?.some((b) => b.barber_id === barber.id && start < new Date(b.ends_at) && end > new Date(b.starts_at))) continue;
      result.set(start.toISOString(), { starts_at: start.toISOString(), ends_at: end.toISOString(), time: `${hour}:${mins}` });
    }
  }
  return [...result.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
