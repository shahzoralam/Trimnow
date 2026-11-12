import { Outlet, createFileRoute, notFound } from "@tanstack/react-router";

import { SiteHeader } from "@/components/public/site-header";
import { RouteNotFoundView } from "@/components/public/blocks";
import { useLang } from "@/components/public/use-lang";
import { isLang, t } from "@/lib/i18n";

export const Route = createFileRoute("/$lang")({
  beforeLoad: ({ params }) => {
    if (!isLang(params.lang)) throw notFound();
  },
  component: LangLayout,
  notFoundComponent: RouteNotFoundView,
});

function LangLayout() {
  const lang = useLang();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6 sm:pt-10">
        <Outlet />
      </main>
      <footer className="border-t border-border/70 py-6 text-center text-xs text-muted-foreground">
        {t(lang).footer}
      </footer>
    </div>
  );
}
