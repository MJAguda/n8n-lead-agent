import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode } from './harness.js';

// --- book appointment ---------------------------------------------------------
const slot = (start, end) => ({ start, end, label: '' });
const ANA = { id: 1, name: 'Ana', email: 'ana@example.com', phone: null };
const verify = (start, freeSlots, lead = ANA) =>
  runCode('tool-book-appointment.json', 'Verify Slot', [{ date: start.slice(0, 10), slots: freeSlots }], {
    'When Executed by Another Workflow': [{ session_id: 's1', start, service: 'cleaning' }],
    'Load Lead': [lead],
  })[0];

test('a requested start that is still a free slot is confirmed', () => {
  const r = verify('2026-11-04T10:00:00+08:00', [slot('2026-11-04T10:00:00.000+08:00', '2026-11-04T11:00:00.000+08:00')]);
  assert.equal(r.free, true);
  assert.equal(r.end, '2026-11-04T11:00:00.000+08:00');
  assert.equal(r.lead_id, 1);
  assert.equal(r.email, 'ana@example.com');
});

test('the same instant written in UTC still matches', () => {
  const r = verify('2026-11-04T02:00:00Z', [slot('2026-11-04T10:00:00.000+08:00', '2026-11-04T11:00:00.000+08:00')]);
  assert.equal(r.free, true);
});

test('a start that is no longer free is refused with alternatives', () => {
  const r = verify('2026-11-04T09:00:00+08:00', [
    slot('2026-11-04T10:00:00.000+08:00', '2026-11-04T11:00:00.000+08:00'),
    slot('2026-11-04T10:30:00.000+08:00', '2026-11-04T11:30:00.000+08:00'),
  ]);
  assert.equal(r.free, false);
  assert.equal(r.alternatives.length, 2);
  assert.match(r.message, /no longer available/i);
});

test('refuses to book before the patient has a name and a phone or email on file', () => {
  const r = verify('2026-11-04T10:00:00+08:00', [slot('2026-11-04T10:00:00.000+08:00', '2026-11-04T11:00:00.000+08:00')], {});
  assert.equal(r.free, false);
  assert.match(r.message, /save_lead/);
});

test('an unparseable start is refused', () => {
  assert.equal(verify('next tuesday', []).free, false);
});

// --- handoff ------------------------------------------------------------------
test('transcript lists messages oldest first with speaker labels', () => {
  const [r] = runCode('tool-handoff.json', 'Format Transcript', [
    { message: { type: 'human', content: 'Hi, my tooth hurts' } },
    { message: { type: 'ai', content: 'Sorry to hear that!' } },
  ], { 'When Executed by Another Workflow': [{ session_id: 's1', reason: 'Asked for a person' }] });
  assert.equal(r.transcript, 'Patient: Hi, my tooth hurts\nAssistant: Sorry to hear that!');
  assert.equal(r.reason, 'Asked for a person');
});

test('an empty chat history still produces a transcript', () => {
  const [r] = runCode('tool-handoff.json', 'Format Transcript', [{}], {
    'When Executed by Another Workflow': [{ session_id: 's1', reason: 'Emergency' }],
  });
  assert.equal(r.transcript, '(no messages yet)');
});

// --- follow-ups ---------------------------------------------------------------
const email = (row) => runCode('followups.json', 'Build Emails', [row])[0];

test('24h nudge invites the lead back to book', () => {
  const r = email({ lead_id: 1, kind: 'nudge_24h', name: 'Ana Santos', email: 'ana@example.com', service: 'cleaning' });
  assert.equal(r.to, 'ana@example.com');
  assert.match(r.subject, /cleaning/i);
  assert.match(r.body, /Hi Ana,/);
});

test('72h nudge is the last, softer reminder', () => {
  assert.match(email({ lead_id: 1, kind: 'nudge_72h', name: 'Ana', email: 'a@x.co', service: 'cleaning' }).body, /last/i);
});

test('appointment reminder shows the time in clinic time', () => {
  const r = email({ lead_id: 1, appointment_id: 9, kind: 'appt_reminder', name: 'Ana', email: 'a@x.co', service: 'cleaning',
    starts_at: '2026-11-04T02:00:00.000Z' });
  assert.match(r.body, /Wed, Nov 4 at 10:00 AM/);
  assert.equal(r.appointment_id, 9);
});

test('a lead with no name gets a neutral greeting', () => {
  assert.match(email({ lead_id: 1, kind: 'nudge_24h', email: 'a@x.co', service: 'cleaning' }).body, /^Hi there,/);
});
