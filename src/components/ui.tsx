import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABELS, type DisplayStatus } from "@/lib/domain/invoicing";

export { formatDate } from "@/lib/domain/dates";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_TONES: Record<DisplayStatus, "neutral" | "ok" | "warn" | "risk"> = {
  a_payer: "neutral",
  partielle: "warn",
  en_retard: "risk",
  payee: "ok",
  annulee: "neutral",
};

export function StatusPill({ status }: { status: DisplayStatus }) {
  return <Pill tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Pill>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "risk" }) {
  const tones = {
    neutral: "bg-slate-50 text-slate-700 border-slate-300",
    ok: "bg-emerald-50 text-ok border-ok/30",
    warn: "bg-amber-50 text-warn border-warn/30",
    risk: "bg-red-50 text-risk border-risk/30",
  };
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[11px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Field({ label, name, children, hint }: { label: string; name: string; children?: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={name} className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-2 border-dashed py-8">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="max-w-prose text-sm text-slate-600">{children}</div>}
      {action}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const tones = {
    info: "border-brand bg-brand-soft",
    error: "border-risk bg-red-50 text-risk",
    ok: "border-ok bg-emerald-50 text-ok",
  };
  return <div className={`mb-4 border-l-4 px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

/** Affiche le message d'erreur ou de succès passé dans l'URL par une action. */
export function Flash({ erreur, ok }: { erreur?: string; ok?: string }) {
  if (erreur) return <Notice tone="error">{erreur}</Notice>;
  if (ok) return <Notice tone="ok">{ok}</Notice>;
  return null;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-2 inline-block text-sm text-slate-600 hover:text-ink">
      ← {children}
    </Link>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "ok" | "risk" | "warn" }) {
  const color = tone === "ok" ? "text-ok" : tone === "risk" ? "text-risk" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`font-display text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
