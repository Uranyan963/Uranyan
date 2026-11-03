import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nthWeekday, toriDays, occurrences, nextDaysOff, todayYmd } from '../src/dates.js';
import { distanceKm, listOccurrences } from '../src/core.js';
import { EVENTS, CITIES } from '../src/data.js';

test('第n曜日・最終曜日', () => {
  assert.equal(nthWeekday(2026, 11, -1, 0), '2026-11-29'); // ジャパンカップ想定
  assert.equal(nthWeekday(2026, 5, 2, 6), '2026-05-09'); // 5月第2土曜
  assert.equal(nthWeekday(2026, 11, 3, 0), '2026-11-15');
  assert.equal(nthWeekday(2026, 2, 5, 0), null); // 2026年2月に第5日曜はない
});

test('酉の日（既知の年と一致）', () => {
  assert.deepEqual(toriDays(2024), ['2024-11-05', '2024-11-17', '2024-11-29']);
  assert.deepEqual(toriDays(2025), ['2025-11-12', '2025-11-24']);
  assert.deepEqual(toriDays(2026), ['2026-11-07', '2026-11-19']);
});

test('年またぎの固定期間', () => {
  const occ = occurrences({ type: 'fixed', start: '12-20', end: '01-05' }, '2027-01-01', '2027-01-03');
  assert.deepEqual(occ, [{ start: '2026-12-20', end: '2027-01-05' }]);
});

test('次の休み（祝日を含む）', () => {
  assert.deepEqual(nextDaysOff('2026-11-03'), ['2026-11-03', '2026-11-03']); // 文化の日（火）
  assert.deepEqual(nextDaysOff('2026-11-04'), ['2026-11-07', '2026-11-08']);
  assert.deepEqual(nextDaysOff('2026-11-20'), ['2026-11-21', '2026-11-23']); // 土日+勤労感謝の日
  assert.deepEqual(nextDaysOff('2026-05-01'), ['2026-05-02', '2026-05-06']); // GW
});

test('日本時間の今日', () => {
  assert.equal(todayYmd(new Date('2026-11-02T16:00:00Z')), '2026-11-03');
});

test('距離と一覧', () => {
  const city = (n) => CITIES.find((c) => c.name === n);
  const km = distanceKm(city('日野市'), city('府中市'));
  assert.ok(km > 7 && km < 9, `日野市役所〜府中市役所 ${km}km`);
  const rows = listOccurrences(EVENTS, { from: '2026-11-07', to: '2026-11-08', bases: [] });
  const ids = rows.map((r) => r.event.id);
  assert.ok(ids.includes('fuchu-torinoichi'));
  assert.ok(ids.includes('takahata-momiji'));
  assert.ok(!ids.includes('kurayami'));
  // 拠点を指定すると距離で絞り込まれる
  const near = listOccurrences(EVENTS, { from: '2026-11-07', to: '2026-11-08', bases: [city('日野市')], maxKm: 3 });
  assert.ok(near.every((r) => r.nearest <= 3));
  assert.ok(near.length < rows.length);
});

test('全イベントのルールが展開できる', () => {
  for (const ev of EVENTS) {
    const occ = occurrences(ev.rule, '2026-01-01', '2026-12-31');
    assert.ok(occ.length > 0, ev.id);
  }
});
