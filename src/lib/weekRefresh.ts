// Shared helpers for the weekly meal rotation.
// Meals rotate every Monday; users can also request an early batch.

export function weekKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dayNum = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dayNum);
  return d.toISOString().slice(0, 10);
}

export function nextMondayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dayNum = (d.getDay() + 6) % 7; // Monday = 0
  const daysUntil = (7 - dayNum) % 7 || 7;
  d.setDate(d.getDate() + daysUntil);
  return d;
}

export function nextRefreshLabel(): string {
  const next = nextMondayDate();
  const now = new Date();
  const days = Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 86400000));
  const dayStr = next.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `Next refresh · ${dayStr} · in ${days}d`;
}
