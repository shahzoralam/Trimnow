import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { PageHeading } from "@/components/public/blocks";
import { useLang } from "@/components/public/use-lang";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/$lang/staff")({ component: StaffPage });

type Community = Tables<"communities">;
type Shop = Tables<"shops">;
type Service = Tables<"services">;
type Barber = Tables<"barbers">;
type Booking = Tables<"bookings">;
const inputClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm";
const buttonClass = "rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60";

function StaffPage() {
  const lang = useLang();
  const ar = lang === "ar";
  const text = ar ? {
    title: "لوحة الفريق", subtitle: "تسجيل الدخول للحلاقين والإدارة", email: "البريد الإلكتروني", password: "كلمة المرور", login: "تسجيل الدخول", logout: "تسجيل الخروج", loading: "جارٍ التحميل…", access: "لا توجد صلاحية فريق لهذا الحساب.", barber: "لوحة الحلاق", admin: "لوحة الإدارة", today: "الحجوزات القادمة", noBookings: "لا توجد حجوزات.", confirmed: "مؤكد", completed: "مكتمل", cancelled: "ملغي", noShow: "لم يحضر", hours: "ساعات العمل الأسبوعية", save: "حفظ", breaks: "الاستراحات", holidays: "الإجازات", addHoliday: "إضافة إجازة", date: "التاريخ", reason: "السبب", community: "المجمّع", shop: "المحل", service: "الخدمة", barberAccount: "حساب حلاق", nameEn: "الاسم بالإنجليزية", nameAr: "الاسم بالعربية", slug: "المعرّف المختصر", create: "إنشاء", price: "السعر بالريال", duration: "المدة بالدقائق", emailBarber: "بريد الحلاق", tempPassword: "كلمة مرور أولية (12 حرفًا على الأقل)", manageCommunities: "إدارة المجمّعات", manageShops: "إدارة المحلات", manageServices: "إدارة الخدمات", manageBarbers: "إدارة الحلاقين", bookings: "كل الحجوزات", active: "نشط", status: "الحالة", weekday: "اليوم", open: "الفتح", close: "الإغلاق", breakStart: "بداية الاستراحة", breakEnd: "نهايتها", saveBreak: "حفظ الاستراحة", saved: "تم الحفظ.", failed: "تعذر إكمال العملية.", select: "اختر", location: "ملاحظة الموقع", phone: "الهاتف", descriptionEn: "الوصف بالإنجليزية", descriptionAr: "الوصف بالعربية", allServices: "كل الخدمات", serviceAssignments: "خدمات الحلاق", assign: "حفظ الخدمات", update: "تحديث", edit: "تعديل", saveChanges: "حفظ التغييرات", deactivated: "غير نشط", createFirst: "أضف البيانات للبدء." } : {
    title: "Staff dashboard", subtitle: "Sign in for barber or administrator access", email: "Email", password: "Password", login: "Sign in", logout: "Sign out", loading: "Loading…", access: "This account has no staff role.", barber: "Barber dashboard", admin: "Admin dashboard", today: "Upcoming bookings", noBookings: "No bookings found.", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", noShow: "No show", hours: "Weekly working hours", save: "Save", breaks: "Breaks", holidays: "Holidays", addHoliday: "Add holiday", date: "Date", reason: "Reason", community: "Community", shop: "Shop", service: "Service", barberAccount: "Barber account", nameEn: "Name in English", nameAr: "Name in Arabic", slug: "Slug", create: "Create", price: "Price (SAR)", duration: "Duration (minutes)", emailBarber: "Barber email", tempPassword: "Initial password (at least 12 characters)", manageCommunities: "Manage communities", manageShops: "Manage shops", manageServices: "Manage services", manageBarbers: "Manage barbers", bookings: "All bookings", active: "Active", status: "Status", weekday: "Weekday", open: "Open", close: "Close", breakStart: "Break start", breakEnd: "Break end", saveBreak: "Save break", saved: "Saved.", failed: "The operation failed.", select: "Select", location: "Location note", phone: "Phone", descriptionEn: "Description in English", descriptionAr: "Description in Arabic", allServices: "All services", serviceAssignments: "Barber services", assign: "Save services", update: "Update", edit: "Edit", saveChanges: "Save changes", deactivated: "Inactive", createFirst: "Add records to get started." };

  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [myBarber, setMyBarber] = useState<Barber | null>(null);
  const [hours, setHours] = useState<Tables<"working_hours">[]>([]);
  const [breaks, setBreaks] = useState<Tables<"breaks">[]>([]);
  const [holidays, setHolidays] = useState<Tables<"holidays">[]>([]);
  const [selectedBarber, setSelectedBarber] = useState("");
  const [communityForm, setCommunityForm] = useState({ id: "", name_en: "", name_ar: "", slug: "", is_active: true });
  const [shopForm, setShopForm] = useState({ id: "", community_id: "", slug: "", name_en: "", name_ar: "", description_en: "", description_ar: "", phone: "", location_note: "", is_active: true });
  const [serviceForm, setServiceForm] = useState({ id: "", shop_id: "", name_en: "", name_ar: "", price_sar: "", duration_min: "30", is_active: true });
  const [barberForm, setBarberForm] = useState({ shop_id: "", name_en: "", name_ar: "", email: "", password: "" });
  const [barberServiceIds, setBarberServiceIds] = useState<string[]>([]);
  const [holidayForm, setHolidayForm] = useState({ date: "", reason: "" });
  const [breakForm, setBreakForm] = useState({ weekday: "0", start_time: "12:00", end_time: "13:00" });
  const weekdays = ar ? ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const refresh = useCallback(async (currentUser: User, currentRole: string) => {
    const bookingQuery = supabase.from("bookings").select("*").order("starts_at").limit(250);
    const filteredBookings = currentRole === "admin" ? bookingQuery : bookingQuery.gte("starts_at", new Date().toISOString());
    const [communityResult, shopResult, serviceResult, barberResult, bookingResult] = await Promise.all([
      supabase.from("communities").select("*").order("name_en"),
      supabase.from("shops").select("*").order("name_en"),
      supabase.from("services").select("*").order("sort_order"),
      supabase.from("barbers").select("*").order("name_en"),
      filteredBookings,
    ]);
    setCommunities(communityResult.data ?? []);
    setShops(shopResult.data ?? []);
    setServices(serviceResult.data ?? []);
    setBarbers(barberResult.data ?? []);
    setBookings(bookingResult.data ?? []);
    if (currentRole === "barber") {
      const own = (barberResult.data ?? []).find((row) => row.user_id === currentUser.id) ?? null;
      setMyBarber(own);
      if (own) {
        setSelectedBarber(own.id);
        const [hoursResult, breaksResult, holidayResult] = await Promise.all([
          supabase.from("working_hours").select("*").eq("barber_id", own.id).order("weekday"),
          supabase.from("breaks").select("*").eq("barber_id", own.id).order("weekday"),
          supabase.from("holidays").select("*").eq("barber_id", own.id).gte("date", new Date().toISOString().slice(0, 10)).order("date"),
        ]);
        setHours(hoursResult.data ?? []);
        setBreaks(breaksResult.data ?? []);
        setHolidays(holidayResult.data ?? []);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session?.user) return;
      setUser(data.session.user);
      const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
      if (!active) return;
      const chosenRole = roleRows?.some((r) => r.role === "admin") ? "admin" : roleRows?.some((r) => r.role === "barber") ? "barber" : null;
      setRole(chosenRole);
      if (chosenRole) await refresh(data.session.user, chosenRole);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setUser(null); setRole(null); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [refresh]);

  const submit = async (action: string, payload: Record<string, unknown>) => {
    setBusy(true); setError(""); setNotice("");
    const { data, error: invokeError } = await supabase.functions.invoke("staff-management", { body: { action, ...payload } });
    setBusy(false);
    if (invokeError || data?.error) { setError(text.failed); return null; }
    setNotice(text.saved);
    if (user && role) await refresh(user, role);
    if (role === "admin" && selectedBarber) await chooseBarber(selectedBarber);
    return data;
  };
  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.user) { setBusy(false); setError(text.failed); return; }
    setUser(data.user);
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const nextRole = roles?.some((r) => r.role === "admin") ? "admin" : roles?.some((r) => r.role === "barber") ? "barber" : null;
    setRole(nextRole);
    if (nextRole) await refresh(data.user, nextRole);
    setBusy(false);
  };
  const saveHours = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const rows = Array.from(new FormData(event.currentTarget).entries()).reduce<Record<string, string>>((acc, [key, value]) => { const [day, field] = key.split("_"); acc[`${day}_${field}`] = String(value); return acc; }, {});
    const list = Array.from({ length: 7 }, (_, weekday) => ({ weekday, open_time: rows[`${weekday}_open`] || "09:00", close_time: rows[`${weekday}_close`] || "17:00" }));
    await submit("save-hours", { barber_id: role === "barber" ? myBarber?.id : selectedBarber, hours: list });
  };
  const changeStatus = async (bookingId: string, status: string) => { await submit("set-booking-status", { booking_id: bookingId, status }); };
  const chooseBarber = async (id: string) => {
    setSelectedBarber(id); setHours([]); setBreaks([]); setHolidays([]);
    if (!id) return;
    const [h, b, hol, bs] = await Promise.all([
      supabase.from("working_hours").select("*").eq("barber_id", id).order("weekday"),
      supabase.from("breaks").select("*").eq("barber_id", id).order("weekday"),
      supabase.from("holidays").select("*").eq("barber_id", id).gte("date", new Date().toISOString().slice(0, 10)).order("date"),
      supabase.from("barber_services").select("service_id").eq("barber_id", id),
    ]);
    setHours(h.data ?? []); setBreaks(b.data ?? []); setHolidays(hol.data ?? []); setBarberServiceIds((bs.data ?? []).map((x) => x.service_id));
  };

  const Field = ({ label, value, onChange, type = "text", required = true }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) => <label className="grid gap-1 text-sm font-medium">{label}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>;
  const Select = ({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) => <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>{children}</select>;
  const section = "grid gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5";

  if (!user) return <section dir={ar ? "rtl" : "ltr"} className="mx-auto grid max-w-md gap-5">
    <PageHeading eyebrow={text.title} title={text.title} subtitle={text.subtitle} />
    <form onSubmit={signIn} className={section}>
      <Field label={text.email} value={email} onChange={setEmail} type="email" />
      <Field label={text.password} value={password} onChange={setPassword} type="password" />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <button disabled={busy} className={buttonClass}>{text.login}</button>
    </form>
  </section>;

  const isAdmin = role === "admin";
  const staffBarber = isAdmin ? barbers.find((b) => b.id === selectedBarber) : myBarber;
  const today = new Date().toISOString().slice(0, 10);
  const displayDate = (iso: string) => new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  const bookingRows = bookings.filter((b) => isAdmin || b.barber_id === myBarber?.id);
  const allBarberIds = isAdmin ? selectedBarber : myBarber?.id ?? "";

  return <section dir={ar ? "rtl" : "ltr"} className="grid gap-5">
    <div className="flex items-start justify-between gap-4">
      <PageHeading eyebrow={isAdmin ? text.admin : text.barber} title={isAdmin ? text.admin : text.barber} subtitle={user.email ?? ""} />
      <button className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm" onClick={() => void supabase.auth.signOut()}>{text.logout}</button>
    </div>
    {!role ? <p role="alert">{text.access}</p> : <>
      {isAdmin ? AdminPanel() : null}
      {isAdmin ? <div className={section}><h2 className="font-semibold">{text.manageBarbers}</h2>{barbers.map((barber) => <div key={barber.id} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm"><span>{barber.name_en} / {barber.name_ar} · {barber.is_active ? text.active : text.deactivated}</span><button type="button" disabled={busy} onClick={() => void submit("set-barber-active", { barber_id: barber.id, is_active: !barber.is_active })} className="rounded border px-3 py-1">{barber.is_active ? text.deactivated : text.active}</button></div>)}</div> : null}
      {isAdmin && barbers.length ? <div className={section}><h2 className="font-semibold">{text.hours} · {text.barber}</h2><Select value={selectedBarber} onChange={(id) => void chooseBarber(id)}><option value="">{text.select}</option>{barbers.map((b) => <option key={b.id} value={b.id}>{b.name_en} / {b.name_ar}</option>)}</Select>{staffBarber ? SchedulePanel() : null}</div> : null}
      {!isAdmin && myBarber ? SchedulePanel() : null}
      {!isAdmin && !myBarber ? <p role="alert">{text.access}</p> : null}
      <div className={section}><h2 className="font-display text-xl font-semibold">{isAdmin ? text.bookings : text.today}</h2>{bookingRows.length === 0 ? <p className="text-sm text-muted-foreground">{text.noBookings}</p> : <ul className="grid gap-3">{bookingRows.map((booking) => {
        const barber = barbers.find((b) => b.id === booking.barber_id);
        const service = services.find((s) => s.id === booking.service_id);
        return <li key={booking.id} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-semibold">{booking.customer_name} · {displayDate(booking.starts_at)}</p><p className="text-sm text-muted-foreground">{booking.customer_mobile} · {text.shop}: {shops.find((s) => s.id === booking.shop_id)?.name_en} · {text.service}: {service?.name_en} · {barber?.name_en} · {booking.building}/{booking.apartment}</p><p className="text-xs">{text.status}: {booking.status}</p></div><div className="flex flex-wrap gap-2">{(isAdmin || booking.barber_id === myBarber?.id) && booking.status === "confirmed" ? <><button className="rounded-md border px-2 py-1 text-xs" onClick={() => void changeStatus(booking.id, "completed")}>{text.completed}</button><button className="rounded-md border px-2 py-1 text-xs" onClick={() => void changeStatus(booking.id, "no_show")}>{text.noShow}</button><button className="rounded-md border px-2 py-1 text-xs" onClick={() => void changeStatus(booking.id, "cancelled")}>{text.cancelled}</button></> : null}</div></li>;
      })}</ul>}</div>
    </>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}{notice ? <p role="status" className="text-sm text-primary">{notice}</p> : null}
  </section>;

  function SchedulePanel() {
    const currentHours = hours.filter((h) => h.barber_id === allBarberIds);
    const scheduleKey = allBarberIds + currentHours.map((h) => `${h.weekday}:${h.open_time}:${h.close_time}`).join(",");
    return <div className={section}>
      <h2 className="font-semibold">{text.hours}</h2>
      <form key={scheduleKey} onSubmit={saveHours} className="grid gap-2">{weekdays.map((day, weekday) => { const existing = currentHours.find((h) => h.weekday === weekday); return <div key={weekday} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2 text-xs"><span>{day}</span><label>{text.open}<input name={`${weekday}_open`} type="time" defaultValue={existing?.open_time.slice(0, 5) ?? "09:00"} className={inputClass}/></label><label>{text.close}<input name={`${weekday}_close`} type="time" defaultValue={existing?.close_time.slice(0, 5) ?? "17:00"} className={inputClass}/></label></div>; })}<button disabled={busy || !staffBarber} className={buttonClass}>{text.save}</button></form>
      <div className="grid gap-3 border-t border-border pt-4"><h3 className="font-semibold">{text.breaks}</h3><form onSubmit={(event) => { event.preventDefault(); void submit("save-breaks", { barber_id: allBarberIds, weekday: Number(breakForm.weekday), breaks: [{ start_time: breakForm.start_time, end_time: breakForm.end_time }] }); }} className="grid gap-2 sm:grid-cols-3"><Select value={breakForm.weekday} onChange={(v) => setBreakForm({ ...breakForm, weekday: v })}><option value="0">{weekdays[0]}</option>{weekdays.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</Select><input name="start_time" type="time" value={breakForm.start_time} onChange={(e) => setBreakForm({ ...breakForm, start_time: e.target.value })} className={inputClass}/><input name="end_time" type="time" value={breakForm.end_time} onChange={(e) => setBreakForm({ ...breakForm, end_time: e.target.value })} className={inputClass}/><button disabled={busy || !staffBarber} className={buttonClass}>{text.saveBreak}</button></form><ul className="text-sm text-muted-foreground">{breaks.filter((b) => b.barber_id === allBarberIds).map((b) => <li key={b.id}>{weekdays[b.weekday]} · {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}</li>)}</ul></div>
      <div className="grid gap-3 border-t border-border pt-4"><h3 className="font-semibold">{text.holidays}</h3><form onSubmit={(event) => { event.preventDefault(); void submit("save-holiday", { barber_id: allBarberIds, date: holidayForm.date, reason: holidayForm.reason }); }} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input required type="date" min={today} value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} className={inputClass}/><input placeholder={text.reason} value={holidayForm.reason} onChange={(e) => setHolidayForm({ ...holidayForm, reason: e.target.value })} className={inputClass}/><button disabled={busy || !staffBarber} className={buttonClass}>{text.addHoliday}</button></form><ul className="grid gap-2 text-sm">{holidays.filter((h) => h.barber_id === allBarberIds).map((h) => <li key={h.id} className="flex justify-between rounded-lg border p-2">{h.date} {h.reason}<button onClick={() => void submit("delete-holiday", { barber_id: allBarberIds, holiday_id: h.id })} className="text-destructive">×</button></li>)}</ul></div>
      {isAdmin ? <div className="grid gap-3 border-t border-border pt-4"><h3 className="font-semibold">{text.serviceAssignments}</h3><div className="grid gap-2">{services.filter((s) => s.shop_id === staffBarber?.shop_id).map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={barberServiceIds.includes(s.id)} onChange={(e) => setBarberServiceIds((prev) => e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id))}/>{s.name_en} / {s.name_ar}</label>)}</div><button disabled={busy} onClick={() => void submit("assign-services", { barber_id: allBarberIds, service_ids: barberServiceIds })} className={buttonClass}>{text.assign}</button></div> : null}
    </div>;
  }

  function AdminPanel() {
    const setCommunityValue = (key: keyof typeof communityForm, value: string | boolean) => setCommunityForm((current) => ({ ...current, [key]: value } as typeof communityForm));
    const setShopValue = (key: keyof typeof shopForm, value: string) => setShopForm((current) => ({ ...current, [key]: value } as typeof shopForm));
    const setServiceValue = (key: keyof typeof serviceForm, value: string) => setServiceForm((current) => ({ ...current, [key]: value } as typeof serviceForm));
    return <div className="grid gap-4">
      <details className={section}><summary className="cursor-pointer font-semibold">{text.manageCommunities}</summary><div className="grid gap-3 pt-3"><Select value={communityForm.id} onChange={(id) => { const c = communities.find((x) => x.id === id); setCommunityForm(c ? { id: c.id, name_en: c.name_en, name_ar: c.name_ar, slug: c.slug, is_active: c.is_active } : { id: "", name_en: "", name_ar: "", slug: "", is_active: true }); }}><option value="">{text.create}</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</Select><div className="grid gap-2 sm:grid-cols-2"><Field label={text.nameEn} value={communityForm.name_en} onChange={(v) => setCommunityValue("name_en", v)}/><Field label={text.nameAr} value={communityForm.name_ar} onChange={(v) => setCommunityValue("name_ar", v)}/><Field label={text.slug} value={communityForm.slug} onChange={(v) => setCommunityValue("slug", v)}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={communityForm.is_active} onChange={(e) => setCommunityValue("is_active", e.target.checked)}/>{text.active}</label></div><button disabled={busy} onClick={() => void submit("save-community", { community: communityForm })} className={buttonClass}>{communityForm.id ? text.saveChanges : text.create}</button></div></details>
      <details className={section}><summary className="cursor-pointer font-semibold">{text.manageShops}</summary><div className="grid gap-3 pt-3"><Select value={shopForm.id} onChange={(id) => { const s = shops.find((x) => x.id === id); setShopForm(s ? { id: s.id, community_id: s.community_id, slug: s.slug, name_en: s.name_en, name_ar: s.name_ar, description_en: s.description_en ?? "", description_ar: s.description_ar ?? "", phone: s.phone ?? "", location_note: s.location_note ?? "", is_active: s.is_active } : { id: "", community_id: "", slug: "", name_en: "", name_ar: "", description_en: "", description_ar: "", phone: "", location_note: "", is_active: true }); }}><option value="">{text.create}</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}</Select><Select value={shopForm.community_id} onChange={(v) => setShopValue("community_id", v)}><option value="">{text.community}</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</Select><div className="grid gap-2 sm:grid-cols-2"><Field label={text.nameEn} value={shopForm.name_en} onChange={(v) => setShopValue("name_en", v)}/><Field label={text.nameAr} value={shopForm.name_ar} onChange={(v) => setShopValue("name_ar", v)}/><Field label={text.slug} value={shopForm.slug} onChange={(v) => setShopValue("slug", v)}/><Field label={text.phone} value={shopForm.phone} onChange={(v) => setShopValue("phone", v)} required={false}/><Field label={text.location} value={shopForm.location_note} onChange={(v) => setShopValue("location_note", v)} required={false}/><Field label={text.descriptionEn} value={shopForm.description_en} onChange={(v) => setShopValue("description_en", v)} required={false}/><Field label={text.descriptionAr} value={shopForm.description_ar} onChange={(v) => setShopValue("description_ar", v)} required={false}/></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shopForm.is_active} onChange={(e) => setShopForm({ ...shopForm, is_active: e.target.checked })}/>{text.active}</label><button disabled={busy} onClick={() => void submit("save-shop", { shop: shopForm })} className={buttonClass}>{shopForm.id ? text.saveChanges : text.create}</button></div></details>
      <details className={section}><summary className="cursor-pointer font-semibold">{text.manageServices}</summary><div className="grid gap-3 pt-3"><Select value={serviceForm.id} onChange={(id) => { const s = services.find((x) => x.id === id); setServiceForm(s ? { id: s.id, shop_id: s.shop_id, name_en: s.name_en, name_ar: s.name_ar, price_sar: String(s.price_sar), duration_min: String(s.duration_min), is_active: s.is_active } : { id: "", shop_id: "", name_en: "", name_ar: "", price_sar: "", duration_min: "30", is_active: true }); }}><option value="">{text.create}</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}</Select><Select value={serviceForm.shop_id} onChange={(v) => setServiceValue("shop_id", v)}><option value="">{text.shop}</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}</Select><div className="grid gap-2 sm:grid-cols-2"><Field label={text.nameEn} value={serviceForm.name_en} onChange={(v) => setServiceValue("name_en", v)}/><Field label={text.nameAr} value={serviceForm.name_ar} onChange={(v) => setServiceValue("name_ar", v)}/><Field label={text.price} value={serviceForm.price_sar} onChange={(v) => setServiceValue("price_sar", v)} type="number"/><Field label={text.duration} value={serviceForm.duration_min} onChange={(v) => setServiceValue("duration_min", v)} type="number"/></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={serviceForm.is_active} onChange={(e) => setServiceForm({ ...serviceForm, is_active: e.target.checked })}/>{text.active}</label><button disabled={busy} onClick={() => void submit("save-service", { service: serviceForm })} className={buttonClass}>{serviceForm.id ? text.saveChanges : text.create}</button></div></details>
      <details className={section}><summary className="cursor-pointer font-semibold">{text.manageBarbers}</summary><form onSubmit={async (event) => { event.preventDefault(); const result = await submit("create-barber", { barber: barberForm }); if (result) setBarberForm({ shop_id: "", name_en: "", name_ar: "", email: "", password: "" }); }} className="grid gap-3 pt-3"><Select value={barberForm.shop_id} onChange={(v) => setBarberForm({ ...barberForm, shop_id: v })}><option value="">{text.shop}</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}</Select><div className="grid gap-2 sm:grid-cols-2"><Field label={text.nameEn} value={barberForm.name_en} onChange={(v) => setBarberForm({ ...barberForm, name_en: v })}/><Field label={text.nameAr} value={barberForm.name_ar} onChange={(v) => setBarberForm({ ...barberForm, name_ar: v })}/><Field label={text.emailBarber} value={barberForm.email} onChange={(v) => setBarberForm({ ...barberForm, email: v })} type="email"/><Field label={text.tempPassword} value={barberForm.password} onChange={(v) => setBarberForm({ ...barberForm, password: v })} type="password"/></div><button disabled={busy} className={buttonClass}>{text.create}</button></form>{barbers.map((b) => <p key={b.id} className="pt-2 text-sm">{b.name_en} / {b.name_ar} · {shops.find((s) => s.id === b.shop_id)?.name_en} · {b.is_active ? text.active : text.deactivated}</p>)}</details>
    </div>;
  }
}
