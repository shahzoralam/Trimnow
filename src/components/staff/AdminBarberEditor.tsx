import { useState, type FormEvent } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Barber = Pick<Tables<"barbers">, "id" | "name_en" | "name_ar" | "shop_id">;
type Shop = Pick<Tables<"shops">, "id" | "name_en">;

export function AdminBarberEditor({ barbers, shops, busy, isArabic, onSave }: {
  barbers: Barber[];
  shops: Shop[];
  busy: boolean;
  isArabic: boolean;
  onSave: (barber: Barber) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = barbers.find((barber) => barber.id === selectedId);
  const [shopId, setShopId] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");

  const chooseBarber = (id: string) => {
    setSelectedId(id);
    const barber = barbers.find((row) => row.id === id);
    setShopId(barber?.shop_id ?? "");
    setNameEn(barber?.name_en ?? "");
    setNameAr(barber?.name_ar ?? "");
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    onSave({ ...selected, shop_id: shopId, name_en: nameEn, name_ar: nameAr });
  };

  return (
    <form onSubmit={save} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="font-semibold">{isArabic ? "تعديل بيانات الحلاق" : "Edit barber details"}</h2>
      <select value={selectedId} onChange={(event) => chooseBarber(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
        <option value="">{isArabic ? "اختر حلاقًا" : "Select a barber"}</option>
        {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name_en} · {shops.find((shop) => shop.id === barber.shop_id)?.name_en}</option>)}
      </select>
      {selected ? <>
        <label className="grid gap-1 text-sm font-medium">{isArabic ? "المحل" : "Shop"}<select required value={shopId} onChange={(event) => setShopId(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="">{isArabic ? "اختر المحل" : "Select shop"}</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name_en}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">{isArabic ? "الاسم بالإنجليزية" : "Name in English"}<input required value={nameEn} onChange={(event) => setNameEn(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label>
        <label className="grid gap-1 text-sm font-medium">{isArabic ? "الاسم بالعربية" : "Name in Arabic"}<input required value={nameAr} onChange={(event) => setNameAr(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label>
        <button disabled={busy} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{isArabic ? "حفظ التغييرات" : "Save changes"}</button>
      </> : null}
    </form>
  );
}
