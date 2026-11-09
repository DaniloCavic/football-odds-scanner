export const TIMEZONE = "Europe/Belgrade";

export function formatRsd(value: number): string {
  return new Intl.NumberFormat("sr-Latn-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " RSD";
}

export function formatOdds(value: number): string {
  return value.toFixed(2);
}

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    timeZone: TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
