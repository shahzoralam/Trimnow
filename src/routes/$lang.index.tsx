import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Building2, ChevronRight } from "lucide-react";

import { EmptyState, PageHeading, RouteErrorView, RouteNotFoundView } from "@/components/public/blocks";
import { useLang } from "@/components/public/use-lang";
import { isLang, pickLocalized, t } from "@/lib/i18n";
import { communitiesQuery } from "@/lib/public-data";

export const Route = createFileRoute("/$lang/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(communitiesQuery()),
  head: ({ params }) => {
    const ar = isLang(params.lang) && params.lang === "ar";
    const title = ar ? "تريم تايم — اختر مجمّعك السكني" : "TrimTime — Choose your community";
    const description = ar
      ? "احجز موعد الحلاقة مع حلاقي مجمّعك السكني في الدمام."
      : "Pick your gated community in Dammam and book a haircut with its barbers.";
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
  const { data: communities } = useSuspenseQuery(communitiesQuery());

  return (
    <section>
      <PageHeading eyebrow={copy.homeEyebrow} title={copy.homeTitle} subtitle={copy.homeSubtitle} />
      {communities.length === 0 ? (
        <EmptyState icon={Building2} title={copy.noCommunities} hint={copy.noCommunitiesHint} />
      ) : (
        <ul className="grid gap-3">
          {communities.map((c) => (
            <li key={c.id}>
              <Link
                to="/$lang/community/$communitySlug"
                params={{ lang, communitySlug: c.slug }}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                  <Building2 className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold">{pickLocalized(c, "name", lang)}</span>
                  <span className="block text-sm text-muted-foreground">{copy.shopsCount(c.shopCount)}</span>
                </span>
                <ChevronRight
                  className="size-5 text-muted-foreground transition group-hover:text-primary rtl:rotate-180"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
