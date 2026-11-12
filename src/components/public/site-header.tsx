import { Link } from "@tanstack/react-router";
import { Languages, Scissors } from "lucide-react";

import { LANG_STORAGE_KEY, otherLang, t } from "@/lib/i18n";
import { useLang } from "./use-lang";

export function SiteHeader() {
  const lang = useLang();
  const next = otherLang(lang);
  const copy = t(lang);

  return (
    <header className="border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/$lang" params={{ lang }} className="group flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
            <Scissors className="size-4" aria-hidden />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-display text-lg font-semibold tracking-tight">TrimTime</span>
            <span className="text-xs text-muted-foreground">{copy.tagline}</span>
          </span>
        </Link>
        <Link
          to="."
          params={(prev) => ({ ...prev, lang: next })}
          onClick={() => {
            try {
              window.localStorage.setItem(LANG_STORAGE_KEY, next);
            } catch {
              // Storage can be unavailable (private mode); the URL still carries the language.
            }
          }}
          aria-label={copy.switchAria}
          lang={next}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Languages className="size-4" aria-hidden />
          {copy.switchLabel}
        </Link>
      </div>
    </header>
  );
}
