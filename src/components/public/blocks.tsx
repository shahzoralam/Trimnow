import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { t } from "@/lib/i18n";
import { useLang } from "./use-lang";

export function PageHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {eyebrow ? (
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent-foreground/80">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      {subtitle ? <div className="mt-2 text-base text-muted-foreground">{subtitle}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="font-medium text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function BackIcon() {
  return <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />;
}

export function RouteErrorView() {
  const lang = useLang();
  const router = useRouter();
  const copy = t(lang);
  return (
    <div role="alert" className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
      <h1 className="font-display text-xl font-semibold">{copy.errorTitle}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{copy.errorBody}</p>
      <button
        type="button"
        onClick={() => router.invalidate()}
        className="mt-5 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {copy.tryAgain}
      </button>
    </div>
  );
}

export function RouteNotFoundView() {
  const lang = useLang();
  const copy = t(lang);
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
      <h1 className="font-display text-xl font-semibold">{copy.notFoundTitle}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{copy.notFoundBody}</p>
      <Link
        to="/$lang"
        params={{ lang }}
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <BackIcon />
        {copy.goHome}
      </Link>
    </div>
  );
}
