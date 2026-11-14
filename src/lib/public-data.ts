import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

// Public catalogue reads go straight to the database as the visitor; RLS only returns
// active communities, shops and services, and barbers come from the public_barbers view.

export type CommunitySummary = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  shopCount: number;
};

export type ShopSummary = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  location_note: string | null;
};

export type CommunityDetail = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  shops: ShopSummary[];
};

export type PublicService = {
  id: string;
  name_en: string;
  name_ar: string;
  price_sar: number;
  duration_min: number;
};

export type PublicBarber = {
  id: string;
  name_en: string;
  name_ar: string;
  photo_url: string | null;
  service_ids: string[];
};

export type ShopDetail = {
  community: { id: string; slug: string; name_en: string; name_ar: string };
  shop: ShopSummary & { phone: string | null; booking_window_days: number };
  services: PublicService[];
  barbers: PublicBarber[];
};

export const communitiesQuery = () =>
  queryOptions({
    queryKey: ["public", "communities"],
    queryFn: async (): Promise<CommunitySummary[]> => {
      const { data, error } = await supabase
        .from("communities")
        .select("id, slug, name_en, name_ar, shops(id)")
        .order("name_en");
      if (error) throw new Error(error.message);
      return (data ?? []).map((c) => ({
        id: c.id,
        slug: c.slug,
        name_en: c.name_en,
        name_ar: c.name_ar,
        shopCount: Array.isArray(c.shops) ? c.shops.length : 0,
      }));
    },
  });

export const communityQuery = (communitySlug: string) =>
  queryOptions({
    queryKey: ["public", "community", communitySlug],
    queryFn: async (): Promise<CommunityDetail | null> => {
      const { data, error } = await supabase
        .from("communities")
        .select(
          "id, slug, name_en, name_ar, shops(id, slug, name_en, name_ar, description_en, description_ar, location_note)",
        )
        .eq("slug", communitySlug)
        .order("name_en", { referencedTable: "shops" })
        .limit(1);
      if (error) throw new Error(error.message);
      const row = data?.[0];
      if (!row) return null;
      return {
        id: row.id,
        slug: row.slug,
        name_en: row.name_en,
        name_ar: row.name_ar,
        shops: (row.shops ?? []) as ShopSummary[],
      };
    },
  });

export const shopQuery = (communitySlug: string, shopSlug: string) =>
  queryOptions({
    queryKey: ["public", "shop", communitySlug, shopSlug],
    queryFn: async (): Promise<ShopDetail | null> => {
      const { data: communities, error: cErr } = await supabase
        .from("communities")
        .select("id, slug, name_en, name_ar")
        .eq("slug", communitySlug)
        .limit(1);
      if (cErr) throw new Error(cErr.message);
      const community = communities?.[0];
      if (!community) return null;

      const { data: shops, error: sErr } = await supabase
        .from("shops")
        .select(
          "id, slug, name_en, name_ar, description_en, description_ar, location_note, phone, booking_window_days, services(id, name_en, name_ar, price_sar, duration_min, sort_order)",
        )
        .eq("community_id", community.id)
        .eq("slug", shopSlug)
        .order("sort_order", { referencedTable: "services" })
        .limit(1);
      if (sErr) throw new Error(sErr.message);
      const shopRow = shops?.[0];
      if (!shopRow) return null;

      const { data: barbers, error: bErr } = await supabase
        .from("public_barbers")
        .select("id, name_en, name_ar, photo_url, service_ids, sort_order")
        .eq("shop_id", shopRow.id)
        .order("sort_order")
        .order("name_en");
      if (bErr) throw new Error(bErr.message);

      const { services, ...shop } = shopRow;
      return {
        community,
        shop,
        services: (services ?? []).map((s) => ({
          id: s.id,
          name_en: s.name_en,
          name_ar: s.name_ar,
          price_sar: Number(s.price_sar),
          duration_min: s.duration_min,
        })),
        barbers: (barbers ?? [])
          .filter((b): b is typeof b & { id: string } => Boolean(b.id))
          .map((b) => ({
            id: b.id,
            name_en: b.name_en ?? "",
            name_ar: b.name_ar ?? "",
            photo_url: b.photo_url,
            service_ids: b.service_ids ?? [],
          })),
      };
    },
  });

// Availability comes from the check-availability Supabase Edge Function. It returns time
// slots only; barber assignment for "Any Available Barber" happens server-side at booking.
export type AvailabilitySlot = { time: string; starts_at: string; ends_at: string };
export type AvailabilityResult = {
  slots: AvailabilitySlot[];
  error: string | null;
};

export const availabilityQuery = (params: {
  shopId: string;
  serviceId: string;
  date: string;
  barberId: string | null;
}) =>
  queryOptions({
    queryKey: ["public", "availability", params.shopId, params.serviceId, params.date, params.barberId],
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    queryFn: async (): Promise<AvailabilityResult> => {
      const { data, error } = await supabase.functions.invoke("check-availability", {
        body: {
          shop_id: params.shopId,
          service_id: params.serviceId,
          date: params.date,
          barber_id: params.barberId,
        },
      });
      if (error) {
        let code = "unavailable";
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = (await ctx.json()) as { error?: string };
            if (body?.error) code = body.error;
          } catch {
            // keep generic code
          }
        }
        return { slots: [], error: code };
      }
      const slots = Array.isArray(data?.slots) ? (data.slots as AvailabilitySlot[]) : [];
      return { slots, error: null };
    },
  });

/** Today's date (YYYY-MM-DD) in Asia/Riyadh, plus the following days. */
export function riyadhDates(count: number, from = new Date()): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y = 1970, m = 1, d = 1] = fmt.format(from).split("-").map(Number);
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10),
  );
}
