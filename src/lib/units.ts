// Unit conversion helpers. Internally we ALWAYS store metric (kg, cm)
// in the database so existing edge functions and calculations keep working.
// The user's preferred display unit is stored in profiles.units.

export type Units = "imperial" | "metric";

export const DEFAULT_UNITS: Units = "imperial";

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const inToCm = (inch: number) => inch * CM_PER_IN;
export const cmToIn = (cm: number) => cm / CM_PER_IN;

export const weightLabel = (u: Units) => (u === "imperial" ? "lbs" : "kg");
export const heightLabel = (u: Units) => (u === "imperial" ? "in" : "cm");

/** Convert metric DB value -> display string in chosen units */
export function fromMetricWeight(kg: number | null | undefined, u: Units): string {
  if (kg == null || isNaN(Number(kg))) return "";
  const v = u === "imperial" ? kgToLb(Number(kg)) : Number(kg);
  return String(Math.round(v * 10) / 10);
}
export function fromMetricHeight(cm: number | null | undefined, u: Units): string {
  if (cm == null || isNaN(Number(cm))) return "";
  const v = u === "imperial" ? cmToIn(Number(cm)) : Number(cm);
  return String(Math.round(v * 10) / 10);
}

/** Convert user-entered display string -> metric number for DB */
export function toMetricWeight(input: string, u: Units): number | null {
  if (!input) return null;
  const n = parseFloat(input);
  if (isNaN(n)) return null;
  return u === "imperial" ? lbToKg(n) : n;
}
export function toMetricHeight(input: string, u: Units): number | null {
  if (!input) return null;
  const n = parseFloat(input);
  if (isNaN(n)) return null;
  return u === "imperial" ? inToCm(n) : n;
}

/** Display a metric DB weight in user's preferred units, e.g. "165 lbs" */
export function displayWeight(kg: number | null | undefined, u: Units): string {
  if (kg == null) return "—";
  const n = u === "imperial" ? kgToLb(Number(kg)) : Number(kg);
  return `${Math.round(n)} ${weightLabel(u)}`;
}
export function displayHeight(cm: number | null | undefined, u: Units): string {
  if (cm == null) return "—";
  const n = u === "imperial" ? cmToIn(Number(cm)) : Number(cm);
  return `${Math.round(n)} ${heightLabel(u)}`;
}
