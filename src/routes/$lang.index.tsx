import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, MapPin, Store } from "lucide-react";

import { EmptyState, PageHeading, RouteErrorView, RouteNotFoundView } from "@/components/public/blocks";
import { useLang } from "@/components/public/use-lang";
import { isLang, pickLocalized, t } from "@/lib/i18n";
import { alIskanShopsQuery } from "@/lib/public-data";

export const Route = createFileRoute("/$lang/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(alIskanShopsQuery()),
  head: ({ params }) => {
    const ar = isLang(params.lang) && params.lang === "ar";
    const title = ar ? "تريم تايم — مجمع الإسكان السكني المسوّر" : "TrimTime — Al Iskan Gated Community";
    const description = ar
      ? "اختر محل الحلاقة واحجز موعدك في مجمع الإسكان."
      : "Choose your barber shop and book your appointment in Al Iskan.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: HomePage,
  errorComponent: RouteErrorView,
  notFoundComponent: RouteNotFoundView,
});

const SHOP_DETAILS: Record<string, { location: string; locationAr: string; description: string; descriptionAr: string }> = {
  "Royal Gents Salon": {
    location: "Palm Court – Buildings 1–8",
    locationAr: "بالم كورت – المباني ١–٨",
    description: "A neighborhood barber shop serving Palm Court residents.",
    descriptionAr: "صالون حلاقة لخدمة سكان بالم كورت.",
  },
  "Urban Clippers": {
    location: "Garden View – Buildings 9–16",
    locationAr: "جاردن فيو – المباني ٩–١٦",
    description: "Convenient barber services for Garden View residents.",
    descriptionAr: "خدمات حلاقة مريحة لسكان جاردن فيو.",
  },
  "Al Noor Barber": {
    location: "Central Square – Buildings 17–24",
    locationAr: "الساحة المركزية – المباني ١٧–٢٤",
    description: "Your local barber shop at Central Square.",
    descriptionAr: "صالون الحلاقة المحلي في الساحة المركزية.",
  },
  "City Gents Salon": {
    location: "Oasis Court – Buildings 25–32",
    locationAr: "واحة كورت – المباني ٢٥–٣٢",
    description: "A nearby salon for the Oasis Court community.",
    descriptionAr: "صالون قريب لخدمة سكان واحة كورت.",
  },
};

function HomePage() {
  const lang = useLang();
  const copy = t(lang);
  const { data: shops } = useSuspenseQuery(alIskanShopsQuery());

  return (
    <section>
      <PageHeading title={copy.homeTitle} subtitle={copy.homeSubtitle} />
      {shops.length === 0 ? (
        <EmptyState icon={Store} title={copy.noShops} hint={copy.noShopsHint} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {shops.map((shop) => {
            const details = SHOP_DETAILS[shop.name_en.trim()];
            const description = pickLocalized(shop, "description", lang) ||
              (details ? (lang === "ar" ? details.descriptionAr : details.description) : "");
            const location = details
              ? (lang === "ar" ? details.locationAr : details.location)
              : shop.location_note;
            return (
              <li key={shop.id}>
                <Link
                  to="/$lang/community/$communitySlug/$shopSlug"
                  params={{ lang, communitySlug: shop.community_slug, shopSlug: shop.slug }}
                  className="group flex h-full min-h-64 flex-col rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="mb-4 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
                    <Store className="size-5" aria-hidden />
                  </span>
                  <span className="text-lg font-semibold">{pickLocalized(shop, "name", lang)}</span>
                  {description ? <span className="mt-1.5 text-sm text-muted-foreground">{description}</span> : null}
                  {location ? (
                    <span className="mt-3 inline-flex items-start gap-1.5 text-sm font-medium text-foreground">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      {location}
                    </span>
                  ) : null}
                  <ChevronRight className="mt-auto size-5 self-end text-muted-foreground transition group-hover:text-primary rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
