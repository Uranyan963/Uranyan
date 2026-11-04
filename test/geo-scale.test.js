import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBig } from '../scraper/normalize.mjs';
import { cleanPlace, pickResult } from '../scraper/geocode.mjs';

test('大きなイベントの判定', () => {
  assert.equal(isBig({ title: '第35回農業まつり' }), true);
  assert.equal(isBig({ title: '府中まんなかイルミ2026', category: '' }), false); // 「イルミネーション」と書いていないもの
  assert.equal(isBig({ title: '多摩センターイルミネーション' }), true);
  assert.equal(isBig({ title: '昭和記念公園花火大会' }), true);
  assert.equal(isBig({ title: 'のびのびこどもフェスタ' }), true);
  assert.equal(isBig({ title: '第19回たきび祭前夜祭 お話と朗読' }), false);
  assert.equal(isBig({ title: '大正琴演奏会' }), false);
  assert.equal(isBig({ title: '菊花展', category: '記念行事・フェスタ・複合イベント' }), true);
});

test('会場名を検索しやすくする', () => {
  assert.equal(cleanPlace('ひの煉瓦ホール（日野市民会館）小ホール'), 'ひの煉瓦ホール');
  assert.equal(cleanPlace('多摩平の森ふれあい館 3階 '), '多摩平の森ふれあい館');
  assert.equal(cleanPlace('日野中央公園'), '日野中央公園');
  assert.equal(cleanPlace(''), '');
});

test('検索結果はその市の近くのものだけ使う', () => {
  const city = { name: '日野市', lat: 35.6713, lng: 139.3950 };
  const near = { geometry: { coordinates: [139.40, 35.67] }, properties: { title: '東京都日野市神明' } };
  const far = { geometry: { coordinates: [135.5, 34.7] }, properties: { title: '大阪府大阪市' } };
  assert.deepEqual(pickResult([far, near], city), { lat: 35.67, lng: 139.4, title: '東京都日野市神明' });
  assert.equal(pickResult([far], city), null);
  assert.equal(pickResult('not a list', city), null);
});
