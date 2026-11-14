import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { CalendarDays, Clock, MapPin, Phone, Scissors, Shuffle, UserRound } from "lucide-react";

import {
  BackIcon,
  EmptyState,
  PageHeading,
  RouteErrorView,
  RouteNotFoundView,
} from "@/components/public/blocks";
import { useLang } from "@/components/public/use-lang";
import { formatNumber, formatSar, isLang, pickLocalized, t, type Lang } from "@/lib/i18n";
import {
  availabilityQuery,
  riyadhDates,
  shopQuery,
  type PublicBarber,
  type PublicService,
} from "@/lib/public-data";

export const Route = createFileRoute("/$lang/community/$communitySlug/$shopSlug")({
  loader: async ({ context, params }) => {
    const detail = await context.queryClient.ensureQueryData(
      shopQuery(params.communitySlug, params.shopSlug),
    );
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ params, loaderData }) => {
    const lang: Lang = isLang(params.lang) ? params.lang : "en";
    const shopName = loaderData ? pickLocalized(loaderData.shop, "name", lang) : "";
    const communityName = loaderData ? pickLocalized(loaderData.community, "name", lang) : "";
    const title = shopName ? `${shopName} — ${communityName} | TrimTime` : "TrimTime";
    const description =
      (loaderData && pickLocalized(loaderData.shop, "description", lang)) ||
      (lang === "ar"
        ? `الخدمات والحلاقون في ${shopName || "المحل"}.`
        : `Services and barbers at ${shopName || "this shop"}.`);
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
  component: ShopPage,
  errorComponent: RouteErrorView,
  notFoundComponent: RouteNotFoundView,
});

function ShopPage() {
  const lang = useLang();
  const copy = t(lang);
  const { communitySlug, shopSlug } = Route.useParams();
  const { data } = useSuspenseQuery(shopQuery(communitySlug, shopSlug));
  if (!data) return <RouteNotFoundView />;
  const { community, shop, services, barbers } = data;
  const description = pickLocalized(shop, "description", lang);

  return (
    <section>
      <Link
        to="/$lang/community/$communitySlug"
        params={{ lang, communitySlug: community.slug }}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <BackIcon />
        {pickLocalized(community, "name", lang)}
      </Link>

      <PageHeading
        eyebrow={copy.shopEyebrow}
        title={pickLocalized(shop, "name", lang)}
        subtitle={description || undefined}
      />

      {shop.location_note || shop.phone ? (
        <div className="-mt-2 mb-8 flex flex-wrap items-center gap-2">
          {shop.location_note ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">
              <MapPin className="size-4" aria-hidden />
              {shop.location_note}
            </span>
          ) : null}
          {shop.phone ? (
            <a
              href={`tel:${shop.phone}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary"
            >
              <Phone className="size-4" aria-hidden />
              {copy.callShop}
              <span dir="ltr" className="text-muted-foreground">
                {shop.phone}
              </span>
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-10">
        <ServicesSection services={services} lang={lang} />
        <BarbersSection barbers={barbers} services={services} lang={lang} />
        <AvailabilitySection
          shopId={shop.id}
          windowDays={shop.booking_window_days}
          services={services}
          barbers={barbers}
          lang={lang}
        />
      </div>
    </section>
  );
}

function SectionTitle({ children, count, lang }: { children: string; count?: number; lang: Lang }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2 font-display text-xl font-semibold">
      {children}
      {count ? <span className="text-sm font-normal text-muted-foreground">({formatNumber(count, lang)})</span> : null}
    </h2>
  );
}

function ServicesSection({ services, lang }: { services: PublicService[]; lang: Lang }) {
  const copy = t(lang);
  return (
    <div>
      <SectionTitle count={services.length} lang={lang}>{copy.services}</SectionTitle>
      {services.length === 0 ? (
        <EmptyState icon={Scissors} title={copy.noServices} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {services.map((s) => (
            <li key={s.id} className="flex items-center gap-4 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{pickLocalized(s, "name", lang)}</span>
                <span className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden />
                  {copy.minutes(s.duration_min)}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-primary">{formatSar(s.price_sar, lang)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BarbersSection({
  barbers,
  services,
  lang,
}: {
  barbers: PublicBarber[];
  services: PublicService[];
  lang: Lang;
}) {
  const copy = t(lang);
  const serviceName = new Map(services.map((s) => [s.id, pickLocalized(s, "name", lang)]));

  return (
    <div>
      <SectionTitle count={barbers.length} lang={lang}>{copy.barbers}</SectionTitle>
      {barbers.length === 0 ? (
        <EmptyState icon={UserRound} title={copy.noBarbers} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          <li className="flex items-start gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 sm:col-span-2">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Shuffle className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold">{copy.anyBarber}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{copy.anyBarberHint}</span>
            </span>
          </li>
          {barbers.map((b) => {
            const name = pickLocalized(b, "name", lang);
            const offered = b.service_ids.map((id) => serviceName.get(id)).filter(Boolean) as string[];
            return (
              <li key={b.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                {b.photo_url ? (
                  <img
                    src={b.photo_url}
                    alt={name}
                    loading="lazy"
                    className="size-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-accent font-display text-lg font-semibold text-accent-foreground"
                  >
                    {name.trim().charAt(0)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{name}</span>
                  {offered.length > 0 ? (
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {offered.map((label) => (
                        <span
                          key={label}
                          className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                        >
                          {label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const AVAIL_COPY = {
  en: {
    title: "Available times",
    hint: "Pick a service, a barber and a day to see free times. Booking comes in the next step.",
    service: "Service",
    barber: "Barber",
    day: "Day",
    any: "Any Available Barber",
    loading: "Checking free times…",
    none: "No free times on this day. Try another day or barber.",
    error: "Free times can't be loaded right now. Please try again later.",
    rateLimited: "Too many checks. Please wait a minute and try again.",
    times: "Riyadh time",
  },
  ar: {
    title: "المواعيد المتاحة",
    hint: "اختر الخدمة والحلاق واليوم لعرض المواعيد المتاحة. الحجز في الخطوة التالية.",
    service: "الخدمة",
    barber: "الحلاق",
    day: "اليوم",
    any: "أي حلاق متاح",
    loading: "جارٍ البحث عن المواعيد…",
    none: "لا توجد مواعيد متاحة في هذا اليوم. جرّب يومًا أو حلاقًا آخر.",
    error: "تعذّر تحميل المواعيد الآن. حاول مرة أخرى لاحقًا.",
    rateLimited: "طلبات كثيرة. انتظر دقيقة ثم حاول مجددًا.",
    times: "بتوقيت الرياض",
  },
} as const;

function AvailabilitySection({
  shopId,
  windowDays,
  services,
  barbers,
  lang,
}: {
  shopId: string;
  windowDays: number;
  services: PublicService[];
  barbers: PublicBarber[];
  lang: Lang;
}) {
  const c = AVAIL_COPY[lang];
  const locale = lang === "ar" ? "ar-SA" : "en-GB";
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [barberId, setBarberId] = useState<string | null>(null);
  // Dates depend on "now"; compute after hydration to avoid SSR mismatch.
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>("");
  useEffect(() => {
    const list = riyadhDates(Math.max(1, Math.min(windowDays, 90)));
    setDates(list);
    setDate((d) => d || list[0] || "");
  }, [windowDays]);

  const eligible = useMemo(
    () => barbers.filter((b) => b.service_ids.includes(serviceId)),
    [barbers, serviceId],
  );
  useEffect(() => {
    if (barberId && !eligible.some((b) => b.id === barberId)) setBarberId(null);
  }, [eligible, barberId]);

  const enabled = Boolean(serviceId && date);
  const { data, isFetching } = useQuery({
    ...availabilityQuery({ shopId, serviceId, date, barberId }),
    enabled,
  });

  if (services.length === 0 || barbers.length === 0) return null;

  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${d}T00:00:00Z`));
  const timeLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Riyadh",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card hover:bg-secondary"
    }`;

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-semibold">
        <CalendarDays className="size-5 text-primary" aria-hidden />
        {c.title}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{c.hint}</p>

      <div className="grid gap-4 rounded-2xl border border-border bg-card p-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{c.service}</legend>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={serviceId === s.id}
                onClick={() => setServiceId(s.id)}
                className={chip(serviceId === s.id)}
              >
                {pickLocalized(s, "name", lang)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{c.barber}</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={barberId === null}
              onClick={() => setBarberId(null)}
              className={chip(barberId === null)}
            >
              {c.any}
            </button>
            {eligible.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={barberId === b.id}
                onClick={() => setBarberId(b.id)}
                className={chip(barberId === b.id)}
              >
                {pickLocalized(b, "name", lang)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{c.day}</legend>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {dates.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={date === d}
                onClick={() => setDate(d)}
                className={chip(date === d)}
              >
                {dayLabel(d)}
              </button>
            ))}
          </div>
        </fieldset>

        <div aria-live="polite">
          <p className="mb-2 text-xs text-muted-foreground">{c.times}</p>
          {!enabled || (isFetching && !data) ? (
            <p className="text-sm text-muted-foreground">{c.loading}</p>
          ) : data?.error ? (
            <p className="text-sm text-destructive">
              {data.error === "rate_limited" ? c.rateLimited : c.error}
            </p>
          ) : data && data.slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{c.none}</p>
          ) : (
            <ul className={`flex flex-wrap gap-2 ${isFetching ? "opacity-60" : ""}`}>
              {data?.slots.map((s) => (
                <li
                  key={s.starts_at}
                  className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground"
                >
                  {timeLabel(s.starts_at)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
