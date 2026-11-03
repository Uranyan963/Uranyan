import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, isAllowed } from '../scraper/fetch.mjs';

test('robots.txt を守る', () => {
  const rules = parseRobots(`
User-agent: *
Disallow: /cgi-bin/
Allow: /cgi-bin/event_cal_multi/
Disallow: /*.pdf$

User-agent: Googlebot
Disallow: /
`);
  assert.equal(isAllowed(rules, '/event/index.html'), true);
  assert.equal(isAllowed(rules, '/cgi-bin/secret.cgi'), false);
  assert.equal(isAllowed(rules, '/cgi-bin/event_cal_multi/calendar.cgi?type=2'), true);
  assert.equal(isAllowed(rules, '/files/a.pdf'), false);
});

test('自分宛ての指定があればそちらを優先、空の Disallow は全許可', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: tamafura\nDisallow:\n');
  assert.equal(isAllowed(rules, '/anything'), true);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow: /\n'), '/anything'), false);
  assert.equal(isAllowed(parseRobots(''), '/anything'), true);
});
