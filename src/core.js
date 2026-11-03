import { occurrences, overlaps } from './dates.js';

/** 2点間の距離(km)。ハバーサイン式 */
export function distanceKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 期間内の開催を展開し、距離などで絞り込んで日付順に返す。
 * opts: { from, to, bases, maxKm, categories:Set|null }
 */
export function listOccurrences(events, opts) {
  const { from, to, bases, maxKm = Infinity, categories = null } = opts;
  const rows = [];
  for (const ev of events) {
    if (categories && !categories.has(ev.category)) continue;
    const hasLoc = Number.isFinite(ev.lat) && Number.isFinite(ev.lng);
    const distances = hasLoc ? bases.map((b) => ({ base: b, km: distanceKm(b, ev) })) : [];
    const nearest = distances.length ? Math.min(...distances.map((d) => d.km)) : null;
    if (nearest !== null && nearest > maxKm) continue;
    for (const occ of occurrences(ev.rule, from, to)) {
      if (overlaps(occ, from, to)) rows.push({ event: ev, occ, distances, nearest });
    }
  }
  return rows.sort(
    (a, b) => a.occ.start.localeCompare(b.occ.start) || (a.nearest ?? 99) - (b.nearest ?? 99),
  );
}
