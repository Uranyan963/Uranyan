import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { futureinnEvents } from '../scraper/parsers/futureinn.mjs';
import { dayTableEvents, LIST_CALENDAR } from '../scraper/parsers/daytable.mjs';
import { kunitachiEvents } from '../scraper/parsers/kunitachi.mjs';
import { mitakaEvents, mitakaNextPage } from '../scraper/parsers/mitaka.mjs';
import { datesFromText, extractJson } from '../scraper/parsers/util.mjs';
import { normalize, toRanges } from '../scraper/normalize.mjs';
import { SOURCES, monthsFrom } from '../scraper/sources.mjs';
import { occurrences } from '../src/dates.js';
import { CITIES } from '../src/data.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const find = (evs, part) => evs.find((e) => e.title.includes(part));

test('JSを実行せずにJSONを取り出す（1行でも複数行でも）', () => {
  assert.deepEqual(extractJson('var x = {events: [{"a":"]}"}], b: 1}', 'events'), [{ a: ']}' }]);
  assert.deepEqual(extractJson('var x = {\ncategories: {"1":"x"},\n};', 'categories'), { 1: 'x' });
  assert.equal(extractJson('var x = 1', 'events'), undefined);
});

test('日付の文字列を読む', () => {
  assert.deepEqual(datesFromText('開催日：2026年11月7日から2026年11月9日'), ['2026-11-07', '2026-11-08', '2026-11-09']);
  assert.deepEqual(datesFromText('2026年11月7日（土曜日）、2026年11月14日（土曜日）'), ['2026-11-07', '2026-11-14']);
});

test('日野市など（同じCMS）のデータファイル', () => {
  const evs = futureinnEvents(fixture('hino-event_data.js'), 'https://www.city.hino.lg.jp/');
  const kiku = find(evs, '菊花展');
  assert.match(kiku.url, /^https:\/\/www\.city\.hino\.lg\.jp\//);
  assert.match(kiku.dates[0], /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(kiku.place, '日野中央公園');
  assert.throws(() => futureinnEvents('var x = 1;', 'https://example.jp/'));
});

test('府中市型のカレンダー', () => {
  const evs = dayTableEvents(fixture('fuchu-202611.html'), { pageUrl: 'https://www.city.fuchu.tokyo.jp/event/calendar/list_calendar.html', ...LIST_CALENDAR });
  const nogyo = find(evs, '第35回農業まつり');
  assert.deepEqual(nogyo.dates, ['2026-11-14', '2026-11-15']);
  assert.equal(nogyo.url, 'https://www.city.fuchu.tokyo.jp/event/kurashi/nougyoumatsuri.html');
  assert.equal(nogyo.category, 'くらし・観光');
  assert.throws(() => dayTableEvents('<html></html>', { pageUrl: 'https://example.jp/', ...LIST_CALENDAR }));
});

test('日付の表・見出し型のカレンダー（各市）', () => {
  const cases = [
    ['chofu-202611.html', 'https://www.city.chofu.lg.jp/cgi-bin/event_cal_multi/calendar.cgi?type=2', /<span class="date_number">(\d{1,2})日<\/span>/, '</tr>', '秋のバラフェスタ', '2026-11-01'],
    ['fussa-202611.html', 'https://www.city.fussa.tokyo.jp/cgi-evt/event.cgi', /<th scope="row" class="[^"]*">(\d{1,2})日（/, '</tr>', '福生市民文化祭', '2026-11-01'],
    ['akiruno-202611.html', 'https://www.city.akiruno.tokyo.jp/event2/202611.html', /<th scope="row" class="cal_date">(?:<strong>)?(\d{1,2})(?:<\/strong>)?<\/th>/, '</tr>', 'わらべうた', '2026-11-02'],
    ['hachioji-202611.html', 'https://www.city.hachioji.tokyo.jp/event/event202611.html', /<span>\d{4}年\d{1,2}月(\d{1,2})日（/, '</dl>', '日本語教室', '2026-11-01'],
    ['ome-202611.html', 'https://www.city.ome.tokyo.jp/calendar/', /<span class="t_day">\s*<span>(\d{1,2})<\/span>日/, '</dl>', 'パパママカレッジ', '2026-11-03'],
    ['komae.html', 'https://www.city.komae.tokyo.jp/events/index.cfm/view.4.-.-.html', /<time datetime="(\d{4})-(\d{2})-(\d{2})">/, '</dl>', 'かわせみコンサート', '2026-11-08'],
  ];
  for (const [file, pageUrl, dayRe, end, title, firstDate] of cases) {
    const evs = dayTableEvents(fixture(file), { pageUrl, year: 2026, month: 11, dayRe, end });
    const ev = find(evs, title);
    assert.ok(ev, `${file}: ${title}`);
    assert.equal(ev.dates[0], firstDate, file);
    assert.ok(evs.every((e) => /^https:\/\//.test(e.url) && !/calendar|\/$/.test(e.url)), `${file}: リンクの絞り込み`);
  }
});

test('国立市（JSON）', () => {
  const ev = find(kunitachiEvents(fixture('kunitachi-calendar.json')), '農業まつり');
  assert.deepEqual(ev.dates, ['2026-11-14', '2026-11-15']);
});

test('三鷹市（一覧とページ送り）', () => {
  const html = fixture('mitaka.html');
  const evs = mitakaEvents(html, 'https://www.city.mitaka.lg.jp/cgi-bin/event/index.cgi');
  assert.equal(evs.length, 15);
  assert.equal(evs.at(-1).dates[0], '2026-10-30');
  assert.match(mitakaNextPage(html, 'https://www.city.mitaka.lg.jp/cgi-bin/event/index.cgi'), /page=2$/);
});

test('連続する日をまとめる', () => {
  assert.deepEqual(toRanges(['2026-11-15', '2026-11-14', '2026-11-21', '2026-11-30', '2026-12-01']),
    [['2026-11-14', '2026-11-15'], ['2026-11-21', '2026-11-21'], ['2026-11-30', '2026-12-01']]);
});

test('ふらっと向けでないものを除き、アプリの形式にする', () => {
  const hino = CITIES.find((c) => c.name === '日野市');
  const fuchu = CITIES.find((c) => c.name === '府中市');
  const evs = [
    ...normalize(futureinnEvents(fixture('hino-event_data.js'), hino.url), '2026-11-01', hino),
    ...normalize(dayTableEvents(fixture('fuchu-202611.html'), { pageUrl: fuchu.url, ...LIST_CALENDAR }), '2026-11-01', fuchu),
  ];
  const names = evs.map((e) => e.name);
  assert.ok(names.includes('第35回農業まつり'));
  assert.ok(names.includes('日野市菊花展・菊花コンテスト'));
  assert.ok(!names.some((n) => /法律相談|防災訓練/.test(n)));
  const nogyo = evs.find((e) => e.name === '第35回農業まつり');
  assert.equal(nogyo.city, '府中市');
  assert.equal(nogyo.lat, fuchu.lat);
  assert.deepEqual(occurrences(nogyo.rule, '2026-11-14', '2026-11-15'), [{ start: '2026-11-14', end: '2026-11-15' }]);
  assert.equal(evs.find((e) => e.name.includes('子ども科学体験')).place, '押立文化センター');
});

test('26市すべてに設定がある', () => {
  assert.equal(CITIES.length, 26);
  for (const c of CITIES) assert.ok(c.name in SOURCES, c.name);
  assert.deepEqual(monthsFrom('2026-12-15', 3), [[2026, 12], [2027, 1], [2027, 2]]);
});
