import { createFileRoute, redirect } from "@tanstack/react-router";

import { LANG_STORAGE_KEY, isLang } from "@/lib/i18n";

// "/" sends visitors to their saved language (English by default); every public page lives under /en or /ar.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    let saved: string | null = null;
    if (typeof window !== "undefined") {
      try {
        saved = window.localStorage.getItem(LANG_STORAGE_KEY);
      } catch {
        saved = null;
      }
    }
    throw redirect({ to: "/$lang", params: { lang: isLang(saved) ? saved : "en" } });
  },
  head: () => ({
    meta: [
      { title: "TrimTime — Book a barber in your community" },
      {
        name: "description",
        content: "Book a haircut with barbers inside your gated community in Dammam. English and Arabic.",
      },
      { property: "og:title", content: "TrimTime — Book a barber in your community" },
      {
        property: "og:description",
        content: "Book a haircut with barbers inside your gated community in Dammam.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
