import { useParams } from "@tanstack/react-router";

import { isLang, type Lang } from "@/lib/i18n";

/** Current language from the /$lang URL segment; English outside it. */
export function useLang(): Lang {
  const params = useParams({ strict: false }) as { lang?: string };
  return isLang(params.lang) ? params.lang : "en";
}
