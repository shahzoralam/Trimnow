import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageHeading } from "@/components/public/blocks";
import { useLang } from "@/components/public/use-lang";
import { riyadhDates, type AvailabilitySlot } from "@/lib/public-data";

export const Route = createFileRoute("/$lang/manage-booking")({
  validateSearch: (search: Record<string, unknown>) => ({ token: typeof search["token"] === "string" ? search["token"] : "" }),
  component: ManageBookingPage,
});

type ManageBooking = { id: string; starts_at: string; status: string; shop_id: string; service_id: string; barber_id: string; requested_any_barber: boolean };

function ManageBookingPage() {
  const lang = useLang();
  const { token } = Route.useSearch();
  const ar = lang === "ar";
  const [booking, setBooking] = useState<ManageBooking | null>(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const labels = ar ? { title: "إدارة الحجز", subtitle: "استخدم هذا الرابط الآمن لإدارة موعدك.", loading: "جارٍ تحميل الحجز…", cancel: "إلغاء الحجز", reschedule: "إعادة الجدولة", date: "تاريخ جديد", choose: "اختر وقتًا جديدًا", canceled: "تم إلغاء الحجز.", changed: "تم تحديث موعد الحجز.", invalid: "رابط الحجز غير صالح أو منتهي.", failed: "تعذّر تنفيذ الطلب. تحقق من الموعد وحاول مجددًا.", inactive: "هذا الحجز غير نشط." } : { title: "Manage your booking", subtitle: "Use this secure link to manage your appointment.", loading: "Loading booking…", cancel: "Cancel booking", reschedule: "Reschedule", date: "New date", choose: "Choose a new time", canceled: "Booking canceled.", changed: "Your booking has been rescheduled.", invalid: "This booking link is invalid or expired.", failed: "The request failed. Check availability and try again.", inactive: "This booking is no longer active." };

  useEffect(() => {
    if (!token) { setError(labels.invalid); return; }
    let active = true;
    supabase.functions.invoke("manage-booking", { body: { action: "lookup", manage_token: token } }).then(({ data, error: invokeError }) => {
      if (!active) return;
      if (invokeError || !data?.booking) { setError(labels.invalid); return; }
      setBooking(data.booking);
    });
    return () => { active = false; };
  }, [token, labels.invalid]);

  const loadSlots = async (nextDate: string) => {
    setDate(nextDate);
    setSlots([]);
    if (!booking || !nextDate) return;
    const { data } = await supabase.functions.invoke("check-availability", { body: { shop_id: booking.shop_id, service_id: booking.service_id, date: nextDate, barber_id: booking.requested_any_barber ? null : booking.barber_id } });
    if (data?.slots) setSlots(data.slots);
  };

  const action = async (type: "cancel" | "reschedule", startsAt?: string) => {
    setBusy(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("manage-booking", { body: { action: type, manage_token: token, starts_at: startsAt } });
    setBusy(false);
    if (invokeError || data?.error) { setError(labels.failed); return; }
    setMessage(type === "cancel" ? labels.canceled : labels.changed);
    if (type === "cancel") setBooking((current) => current ? { ...current, status: "cancelled" } : current);
    else if (data?.booking) setBooking((current) => current ? { ...current, starts_at: data.booking.starts_at } : current);
    setSlots([]);
  };

  const dateOptions = riyadhDates(30).slice(1);
  const timeLabel = (iso: string) => new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  return <section dir={ar ? "rtl" : "ltr"} className="grid gap-5">
    <Link to="/$lang" params={{ lang }} className="text-sm text-muted-foreground hover:text-foreground">{ar ? "العودة إلى المجمعات" : "Back to communities"}</Link>
    <PageHeading eyebrow={ar ? "رابط خاص" : "Private link"} title={labels.title} subtitle={labels.subtitle} />
    {!booking && !error ? <p>{labels.loading}</p> : null}
    {booking ? <div className="grid gap-4 rounded-2xl border border-border bg-card p-4">
      <p>{timeLabel(booking.starts_at)}</p>
      {booking.status !== "confirmed" ? <p>{labels.inactive}</p> : <>
        <label className="grid gap-2 text-sm font-medium">{labels.date}<select value={date} onChange={(event) => void loadSlots(event.target.value)} className="h-11 rounded-lg border border-input bg-background px-3"><option value="">—</option>{dateOptions.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
        {slots.length ? <div className="grid gap-2"><p className="text-sm font-medium">{labels.choose}</p><div className="flex flex-wrap gap-2">{slots.map((slot) => <button key={slot.starts_at} disabled={busy} onClick={() => void action("reschedule", slot.starts_at)} className="rounded-full border border-border px-3 py-2 text-sm hover:bg-secondary">{timeLabel(slot.starts_at)}</button>)}</div></div> : null}
        <button disabled={busy} onClick={() => void action("cancel")} className="h-11 rounded-lg border border-destructive px-4 font-semibold text-destructive disabled:opacity-60">{labels.cancel}</button>
      </>}
    </div> : null}
    {message ? <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">{message}</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </section>;
}
