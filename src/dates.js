// 日付ユーティリティと「例年ルール」から開催日を計算するエンジン。
// 日付はすべて 'YYYY-MM-DD' 文字列で扱い、タイムゾーンの影響を受けないよう UTC で計算する。

const DAY = 86400000;

export function parse(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmt(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(ymd, n) {
  return fmt(new Date(parse(ymd).getTime() + n * DAY));
}

export function weekday(ymd) {
  return parse(ymd).getUTCDay(); // 0=日 ... 6=土
}

export function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / DAY);
}

export function todayYmd(now = new Date()) {
  // 日本時間の「今日」
  return fmt(new Date(now.getTime() + 9 * 3600000));
}

const pad = (n) => String(n).padStart(2, '0');

/** year年month月の第n wd曜日 (n=-1 で最終) */
export function nthWeekday(year, month, n, wd) {
  if (n > 0) {
    const first = `${year}-${pad(month)}-01`;
    const offset = (wd - weekday(first) + 7) % 7;
    const ymd = addDays(first, offset + (n - 1) * 7);
    return Number(ymd.slice(5, 7)) === month ? ymd : null;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${pad(month)}-${pad(lastDay)}`;
  return addDays(last, -((weekday(last) - wd + 7) % 7));
}

// 酉の日: 2024-11-05 が酉の日（2024年 一の酉）。十二支は12日周期。
const TORI_REF = '2024-11-05';
export function toriDays(year) {
  const days = [];
  for (let d = 1; d <= 30; d++) {
    const ymd = `${year}-11-${pad(d)}`;
    if (((diffDays(TORI_REF, ymd) % 12) + 12) % 12 === 0) days.push(ymd);
  }
  return days;
}

/**
 * ルールから [from, to] 期間に重なる開催日程を返す。
 * 戻り値: [{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', label?: string }]
 */
export function occurrences(rule, from, to) {
  const out = [];
  const y0 = Number(from.slice(0, 4)) - 1;
  const y1 = Number(to.slice(0, 4));
  const push = (start, end, label) => {
    if (start && end >= from && start <= to) out.push({ start, end, ...(label ? { label } : {}) });
  };

  switch (rule.type) {
    case 'once':
      push(rule.start, rule.end || rule.start);
      break;
    case 'ranges': // 開催日が決まっているもの（市の公式データなど）
      for (const [start, end] of rule.ranges) push(start, end);
      break;
    case 'fixed': // 毎年 MM-DD〜MM-DD（年またぎ可）
      for (let y = y0; y <= y1; y++) {
        const start = `${y}-${rule.start}`;
        let end = `${y}-${rule.end || rule.start}`;
        if (end < start) end = `${y + 1}-${rule.end}`;
        push(start, end);
      }
      break;
    case 'nthWeekday': // 毎年 month月の第n wd曜日から days日間
      for (let y = y0; y <= y1; y++) {
        const start = nthWeekday(y, rule.month, rule.n, rule.weekday);
        if (start) push(start, addDays(start, (rule.days || 1) - 1));
      }
      break;
    case 'monthly': // 毎月 第n wd曜日（months で月を限定可）
      for (let y = y0; y <= y1; y++) {
        for (let m = 1; m <= 12; m++) {
          if (rule.months && !rule.months.includes(m)) continue;
          const start = nthWeekday(y, m, rule.n, rule.weekday);
          if (start) push(start, addDays(start, (rule.days || 1) - 1));
        }
      }
      break;
    case 'monthlyDate': // 毎月 day日
      for (let y = y0; y <= y1; y++) {
        for (let m = 1; m <= 12; m++) {
          if (rule.months && !rule.months.includes(m)) continue;
          const start = `${y}-${pad(m)}-${pad(rule.day)}`;
          push(start, start);
        }
      }
      break;
    case 'tori': // 11月の酉の日
      for (let y = y0; y <= y1; y++) {
        const names = ['一の酉', '二の酉', '三の酉'];
        toriDays(y).forEach((d, i) => push(d, d, names[i]));
      }
      break;
    default:
      throw new Error(`unknown rule type: ${rule.type}`);
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

// 国民の祝日・振替休日（2026〜2027）。年が進んだらここに追記する。
export const HOLIDAYS = {
  '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日', '2026-03-20': '春分の日', '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日', '2026-07-20': '海の日', '2026-08-11': '山の日',
  '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日', '2027-03-21': '春分の日', '2027-03-22': '振替休日',
  '2027-04-29': '昭和の日', '2027-05-03': '憲法記念日', '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日', '2027-07-19': '海の日', '2027-08-11': '山の日',
  '2027-09-20': '敬老の日', '2027-09-23': '秋分の日', '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日', '2027-11-23': '勤労感謝の日',
};

export function isDayOff(ymd) {
  const wd = weekday(ymd);
  return wd === 0 || wd === 6 || ymd in HOLIDAYS;
}

/** today 以降で最初に来る連続した休み（土日祝）の [start, end] */
export function nextDaysOff(today) {
  let d = today;
  while (!isDayOff(d)) d = addDays(d, 1);
  let end = d;
  while (isDayOff(addDays(end, 1))) end = addDays(end, 1);
  return [d, end];
}

export function overlaps(occ, from, to) {
  return occ.end >= from && occ.start <= to;
}
