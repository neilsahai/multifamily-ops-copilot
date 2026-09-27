export function fmtPct(value: number | null): string {
  return value === null ? "N/A" : `${Math.round(value * 100)}%`;
}

export function fmtDays(value: number | null): string {
  if (value === null) return "N/A";
  const v = Number.isInteger(value) ? value : value.toFixed(1);
  return `${v} ${value === 1 ? "day" : "days"}`;
}

export function fmtMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
