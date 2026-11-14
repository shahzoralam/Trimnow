import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Store } from "lucide-react";

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
        <ul className="grid gap-3 sm:grid-cols-2">
          {shops.map((shop) => (
            <li key={shop.id}>
              <Link
                to="/$lang/community/$communitySlug/$shopSlug"
                params={{ lang, communitySlug: shop.community_slug, shopSlug: shop.slug }}
                className="group flex min-h-24 items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Store className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{pickLocalized(shop, "name", lang)}</span>
                  {shop.location_note ? <span className="mt-1 block text-sm text-muted-foreground">{shop.location_note}</span> : null}
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground transition group-hover:text-primary rtl:rotate-180" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
