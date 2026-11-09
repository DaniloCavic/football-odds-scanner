import { IconLock } from "./icons";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-panel p-5 ${className}`}>{children}</section>;
}

export function StatCard({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "won" | "lost" | "live" }) {
  const toneCls = { default: "text-text", won: "text-won", lost: "text-lost", live: "text-live" }[tone];
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function PhaseNotice({ phase, children }: { phase: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-line bg-panel-2/50 p-4 text-sm text-muted">
      <IconLock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
      <p><span className="font-medium text-text">Stiže u fazi {phase}.</span> {children}</p>
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
    </div>
  );
}

export const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-pending/15 text-pending",
  LIVE: "bg-live/15 text-live",
  WON: "bg-won/15 text-won",
  LOST: "bg-lost/15 text-lost",
  POSTPONED: "bg-pending/15 text-pending",
  VOID: "bg-pending/15 text-pending",
  NEEDS_REVIEW: "bg-live/15 text-live",
};

export function StatusBadge({ status, label }: { status: keyof typeof STATUS_STYLES; label: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>{label}</span>;
}
