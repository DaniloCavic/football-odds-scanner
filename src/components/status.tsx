export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Na čekanju",
  LIVE: "Uživo",
  WON: "Prošlo",
  LOST: "Palo",
  POSTPONED: "Odloženo",
  VOID: "Poništeno",
  NEEDS_REVIEW: "Provera",
};

const STYLES: Record<string, string> = {
  PENDING: "bg-pending/15 text-pending",
  LIVE: "bg-live/15 text-live",
  WON: "bg-won/15 text-won",
  LOST: "bg-lost/15 text-lost",
  POSTPONED: "bg-pending/15 text-pending",
  VOID: "bg-pending/15 text-pending",
  NEEDS_REVIEW: "bg-live/15 text-live ring-1 ring-live/40",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span data-status={status} className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.PENDING}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export const rsd = (n: number) => new Intl.NumberFormat("sr-Latn-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " RSD";
export const signedRsd = (n: number) => (n > 0 ? "+" : "") + rsd(n);
