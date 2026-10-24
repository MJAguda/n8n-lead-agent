import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode } from './harness.js';

// Wednesday 2026-11-04. "now" is pinned to the Monday before so no slot is in the past.
const MONDAY = '2026-11-02T08:00:00+08:00';

const slots = ({ date = '2026-11-04', service = 'consultation', limit = 5, now = MONDAY, events = [] }) =>
  runCode('tool-check-availability.json', 'Build Free Slots', events.length ? events : [{}], {
    'When Executed by Another Workflow': [{ date, service, limit, now }],
  })[0];

const event = (start, end) => ({ start: { dateTime: `2026-11-04T${start}:00+08:00` }, end: { dateTime: `2026-11-04T${end}:00+08:00` } });

test('an empty day starts at 9:00 and returns at most `limit` slots', () => {
  const r = slots({});
  assert.equal(r.slots.length, 5);
  assert.equal(r.slots[0].start, '2026-11-04T09:00:00.000+08:00');
  assert.equal(r.slots[1].start, '2026-11-04T09:30:00.000+08:00');
});

test('limit 0 returns every free slot of the day', () => {
  // 30-min consultations: 9:00-12:00 (6 slots) + 13:00-18:00 (10 slots)
  assert.equal(slots({ limit: 0 }).slots.length, 16);
});

test('no slot overlaps the lunch break', () => {
  for (const s of slots({ limit: 0, service: 'cleaning' }).slots) {
    const start = s.start.slice(11, 16);
    const end = s.end.slice(11, 16);
    assert.ok(end <= '12:00' || start >= '13:00', `${start}-${end} overlaps lunch`);
  }
});

test('longer services get longer slots that still end by closing time', () => {
  const r = slots({ limit: 0, service: 'Root canal treatment' });
  assert.equal(r.duration_minutes, 90);
  assert.equal(r.slots.at(-1).end.slice(11, 16), '18:00');
});

test('busy calendar events block overlapping slots', () => {
  const r = slots({ limit: 0, events: [event('09:00', '10:00'), event('14:30', '15:00')] });
  const starts = r.slots.map((s) => s.start.slice(11, 16));
  assert.ok(!starts.includes('09:00'));
  assert.ok(!starts.includes('09:30'));
  assert.ok(starts.includes('10:00'));
  assert.ok(!starts.includes('14:30'));
});

test('an all-day event blocks the whole day', () => {
  const r = slots({ events: [{ start: { date: '2026-11-04' }, end: { date: '2026-11-05' } }] });
  assert.equal(r.slots.length, 0);
});

test('Sundays are closed', () => {
  const r = slots({ date: '2026-11-08' });
  assert.equal(r.slots.length, 0);
  assert.match(r.message, /closed/i);
});

test('slots less than an hour from now are not offered', () => {
  const r = slots({ now: '2026-11-04T10:10:00+08:00' });
  assert.equal(r.slots[0].start.slice(11, 16), '11:30');
});

test('dates in the past return no slots', () => {
  assert.equal(slots({ date: '2026-11-01' }).slots.length, 0);
});

test('slots carry a human-friendly label in clinic time', () => {
  assert.equal(slots({}).slots[0].label, 'Wed, Nov 4 · 9:00 AM');
});

test('the Day Window node asks the calendar for the whole clinic day', () => {
  const [w] = runCode('tool-check-availability.json', 'Day Window', [{ date: '2026-11-04' }]);
  assert.equal(w.timeMin, '2026-11-04T00:00:00.000+08:00');
  assert.equal(w.timeMax, '2026-11-05T00:00:00.000+08:00');
});
