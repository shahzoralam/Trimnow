import type { Tables } from "@/integrations/supabase/types";

type Shop = Pick<Tables<"shops">, "id" | "name_en">;
type Barber = Pick<Tables<"barbers">, "id" | "name_en">;

export function AdminDeletionPanel({ shops, barbers, busy, onDeleteShop, onDeleteBarber, isArabic }: {
  shops: Shop[];
  barbers: Barber[];
  busy: boolean;
  onDeleteShop: (shop: Shop) => void;
  onDeleteBarber: (barber: Barber) => void;
  isArabic: boolean;
}) {
  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="font-semibold">{isArabic ? "حذف المحلات والحلاقين" : "Delete shops and barbers"}</h2>
      <ul className="grid gap-2">
        {shops.map((shop) => (
          <li key={shop.id} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm">
            <span>{shop.name_en}</span>
            <button type="button" disabled={busy} onClick={() => onDeleteShop(shop)} className="text-destructive">
              {isArabic ? "حذف" : "Delete shop"}
            </button>
          </li>
        ))}
        {barbers.map((barber) => (
          <li key={barber.id} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm">
            <span>{barber.name_en}</span>
            <button type="button" disabled={busy} onClick={() => onDeleteBarber(barber)} className="text-destructive">
              {isArabic ? "حذف" : "Delete barber"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
