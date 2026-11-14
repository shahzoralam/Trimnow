export const LANGS = ["en", "ar"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_STORAGE_KEY = "trimtime-lang";

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "ar";
}

export function dirFor(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

export function otherLang(lang: Lang): Lang {
  return lang === "ar" ? "en" : "ar";
}

/** Picks the field for the current language, falling back to the other language when empty. */
export function pickLocalized<K extends string>(
  row: Partial<Record<`${K}_en` | `${K}_ar`, string | null>>,
  field: K,
  lang: Lang,
): string {
  const primary = row[`${field}_${lang}` as `${K}_${Lang}`];
  const fallback = row[`${field}_${otherLang(lang)}` as `${K}_${Lang}`];
  return (primary && primary.trim()) || (fallback && fallback.trim()) || "";
}

function locale(lang: Lang) {
  return lang === "ar" ? "ar-SA" : "en-SA";
}

export function formatNumber(n: number, lang: Lang) {
  return new Intl.NumberFormat(locale(lang)).format(n);
}

export function formatSar(amount: number, lang: Lang) {
  return new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function arabicShopCount(n: number) {
  const num = formatNumber(n, "ar");
  if (n === 1) return "محل واحد";
  if (n === 2) return "محلّان";
  if (n >= 3 && n <= 10) return `${num} محلات`;
  return `${num} محلًا`;
}

export const dict = {
  en: {
    tagline: "Barber bookings for your community",
    switchLabel: "العربية",
    switchAria: "Switch to Arabic",
    homeEyebrow: "Step 1",
    homeTitle: "Al Iskan Gated Community",
    homeSubtitle: "Choose your barber shop and book your appointment.",
    noCommunities: "No communities are available yet.",
    noCommunitiesHint: "Please check back soon.",
    shopsCount: (n: number) => (n === 1 ? "1 shop" : `${formatNumber(n, "en")} shops`),
    communityEyebrow: "Step 2",
    chooseShop: "Choose a barber shop",
    noShops: "No barber shops are open in this community yet.",
    noShopsHint: "Try another community or check back later.",
    allCommunities: "All communities",
    shopEyebrow: "Step 3",
    services: "Services",
    barbers: "Barbers",
    noServices: "This shop hasn't listed any services yet.",
    noBarbers: "No barbers are available at this shop yet.",
    anyBarber: "Any available barber",
    anyBarberHint: "We'll match you with whoever is free at your chosen time.",
    minutes: (n: number) => `${formatNumber(n, "en")} min`,
    callShop: "Call",
    notFoundTitle: "Page not found",
    notFoundBody: "This page doesn't exist or is no longer available.",
    goHome: "Go to communities",
    errorTitle: "This page didn't load",
    errorBody: "Please check your connection and try again.",
    tryAgain: "Try again",
    footer: "Pay at the shop. No account needed.",
  },
  ar: {
    tagline: "حجز الحلاق داخل مجمّعك السكني",
    switchLabel: "English",
    switchAria: "التبديل إلى الإنجليزية",
    homeEyebrow: "الخطوة ١",
    homeTitle: "مجمع الإسكان السكني المسوّر",
    homeSubtitle: "اختر محل الحلاقة واحجز موعدك.",
    noCommunities: "لا توجد مجمّعات متاحة حاليًا.",
    noCommunitiesHint: "يرجى المحاولة لاحقًا.",
    shopsCount: arabicShopCount,
    communityEyebrow: "الخطوة ٢",
    chooseShop: "اختر محل الحلاقة",
    noShops: "لا توجد محلات حلاقة متاحة في هذا المجمّع حاليًا.",
    noShopsHint: "جرّب مجمّعًا آخر أو عُد لاحقًا.",
    allCommunities: "كل المجمّعات",
    shopEyebrow: "الخطوة ٣",
    services: "الخدمات",
    barbers: "الحلاقون",
    noServices: "لم يضف هذا المحل أي خدمات بعد.",
    noBarbers: "لا يوجد حلاقون متاحون في هذا المحل حاليًا.",
    anyBarber: "أي حلاق متاح",
    anyBarberHint: "سنختار لك الحلاق المتاح في الوقت الذي تحدده.",
    minutes: (n: number) => `${formatNumber(n, "ar")} دقيقة`,
    callShop: "اتصال",
    notFoundTitle: "الصفحة غير موجودة",
    notFoundBody: "هذه الصفحة غير موجودة أو لم تعد متاحة.",
    goHome: "العودة إلى المجمّعات",
    errorTitle: "تعذّر تحميل الصفحة",
    errorBody: "يرجى التحقق من الاتصال والمحاولة مرة أخرى.",
    tryAgain: "إعادة المحاولة",
    footer: "الدفع في المحل. لا حاجة لإنشاء حساب.",
  },
} as const;

export function t(lang: Lang) {
  return dict[lang];
}
