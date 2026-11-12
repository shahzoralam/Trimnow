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
  shop: ShopSummary & { phone: string | null };
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
          "id, slug, name_en, name_ar, description_en, description_ar, location_note, phone, services(id, name_en, name_ar, price_sar, duration_min, sort_order)",
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
