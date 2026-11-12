import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ChevronRight, MapPin, Store } from "lucide-react";

import {
  BackIcon,
  EmptyState,
  PageHeading,
  RouteErrorView,
  RouteNotFoundView,
} from "@/components/public/blocks";
import { useLang } from "@/components/public/use-lang";
import { isLang, pickLocalized, t, type Lang } from "@/lib/i18n";
import { communityQuery } from "@/lib/public-data";

export const Route = createFileRoute("/$lang/community/$communitySlug/")({
  loader: async ({ context, params }) => {
    const community = await context.queryClient.ensureQueryData(communityQuery(params.communitySlug));
    if (!community) throw notFound();
    return community;
  },
  head: ({ params, loaderData }) => {
    const lang: Lang = isLang(params.lang) ? params.lang : "en";
    const name = loaderData ? pickLocalized(loaderData, "name", lang) : "";
    const title = name
      ? lang === "ar"
        ? `محلات الحلاقة في ${name} — تريم تايم`
        : `Barber shops in ${name} — TrimTime`
      : "TrimTime";
    const description =
      lang === "ar"
        ? `اختر محل حلاقة في ${name || "مجمّعك"} واحجز موعدك.`
        : `Choose a barber shop in ${name || "your community"} and book your appointment.`;
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
  component: CommunityPage,
  errorComponent: RouteErrorView,
  notFoundComponent: RouteNotFoundView,
});

function CommunityPage() {
  const lang = useLang();
  const copy = t(lang);
  const { communitySlug } = Route.useParams();
  const { data: community } = useSuspenseQuery(communityQuery(communitySlug));
  if (!community) return <RouteNotFoundView />;

  return (
    <section>
      <Link
        to="/$lang"
        params={{ lang }}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <BackIcon />
        {copy.allCommunities}
      </Link>
      <PageHeading
        eyebrow={copy.communityEyebrow}
        title={copy.chooseShop}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden />
            {pickLocalized(community, "name", lang)}
          </span>
        }
      />
      {community.shops.length === 0 ? (
        <EmptyState icon={Store} title={copy.noShops} hint={copy.noShopsHint} />
      ) : (
        <ul className="grid gap-3">
          {community.shops.map((shop) => {
            const description = pickLocalized(shop, "description", lang);
            return (
              <li key={shop.id}>
                <Link
                  to="/$lang/community/$communitySlug/$shopSlug"
                  params={{ lang, communitySlug: community.slug, shopSlug: shop.slug }}
                  className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                    <Store className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold">{pickLocalized(shop, "name", lang)}</span>
                    {description ? (
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{description}</span>
                    ) : null}
                    {shop.location_note ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3.5" aria-hidden />
                        {shop.location_note}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className="mt-3 size-5 text-muted-foreground transition group-hover:text-primary rtl:rotate-180"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
