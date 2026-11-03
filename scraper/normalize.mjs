// 各市のデータを、アプリで使う形にそろえて「休日にふらっと行ける」ものに絞る。

// 行政手続き・相談・定例の教室など、ふらっと行くイベントではないもの
const EXCLUDE = new RegExp([
  '相談|説明会|保育園|園庭開放|誕生会|見学|会議|審議会|懇談会|研修|講習会|健診|検診|募集|オンライン|Zoom|申込|ワークショップ|講座|教室|サークル|中高生タイム|追悼式|ママ・パパ|ベビー|防災訓練|要約筆記|手話|掲載しています|入居者|議会|パブリックコメント|の集い|共同参画|美化の日|する会|交流会|歌声広場|児童館|委員会|就活|創業|二十歳|特別支援|虐待|ひきこもり|居場所',
  // 子育て・乳幼児向け、健診、就労支援、定例の教室など
  '親子ひろば|子育てひろば|ひろば「|健康診査|健康診断|学級|就職|面接会|セミナー|測定会|開庁|窓口|回収|登録会|ボランティア|アンケート|審査会|キャンペーン|チケット販売|割引|サロン|赤ちゃん|乳幼児|幼児|0歳|０歳|お誕生日会|誕生会|リトミック|保育室|プレママ|プレパパ|（[1-9１-９]）|\\([1-9]\\)|おもちゃの病院|わかちあい|支援会員|連絡会',
].join('|'));
const MAX_DATES = 60; // 毎日のようにある定例行事は除く
const HORIZON_DAYS = 180; // 半年より先は載せない（入力ミスや気の早すぎる告知）

/** 日付の配列 → 連続する日をまとめた [start, end] の配列 */
export function toRanges(dates) {
  const sorted = [...new Set(dates)].sort();
  const ranges = [];
  for (const d of sorted) {
    const last = ranges.at(-1);
    if (last && nextDay(last[1]) === d) last[1] = d;
    else ranges.push([d, d]);
  }
  return ranges;
}

function addDays(ymd, n) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}
const nextDay = (ymd) => addDays(ymd, 1);

function guessPlace(ev) {
  if (ev.place) return ev.place.replace(/\[.*?\]/g, '').replace(/(アクセス[:：]|東京都|〒).*/, '').slice(0, 40);
  return ev.title.match(/（([^）]*(?:センター|館|公園|ホール|フチュール|広場)[^）]*)）/)?.[1] || '';
}

export function isFuraOk(ev) {
  return ev.dates.length > 0 && ev.dates.length <= MAX_DATES && !EXCLUDE.test(ev.title);
}

/**
 * 共通形式の配列を、アプリ用のイベントに変換する。
 * from 以降に開催日があるものだけ残す。city: { name, lat, lng }（座標は距離の目安）
 */
export function normalize(raw, from, city) {
  return raw
    .filter(isFuraOk)
    .map((ev) => ({ ...ev, dates: ev.dates.filter((d) => d >= from && d <= addDays(from, HORIZON_DAYS)) }))
    .filter((ev) => ev.dates.length > 0)
    .map((ev) => ({
      id: `${city.name}:${ev.url}`,
      name: ev.title,
      city: city.name,
      lat: city.lat,
      lng: city.lng,
      approxLoc: true,
      place: guessPlace(ev),
      url: ev.url,
      category: 'city',
      tags: ev.category,
      note: ev.time ? `時間: ${ev.time}`.slice(0, 80) : '', // 説明文は転載せず、詳細は公式ページへ
      accuracy: 'official',
      rule: { type: 'ranges', ranges: toRanges(ev.dates) },
    }))
    .sort((a, b) => a.rule.ranges[0][0].localeCompare(b.rule.ranges[0][0]));
}
