import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode } from './harness.js';

// `existing` is the row Load Lead found for this chat session ({} when it's a new lead).
const score = (lead, existing = {}) =>
  runCode('tool-save-lead.json', 'Normalize and Score', [existing], {
    'When Executed by Another Workflow': [{ session_id: 's1', ...lead }],
  })[0];

test('normalises Philippine mobile numbers to +63 format', () => {
  for (const raw of ['0917 555 0142', '+63 917-555-0142', '639175550142', '9175550142']) {
    assert.equal(score({ phone: raw }).phone, '+639175550142', raw);
  }
});

test('drops phone numbers and emails that are not valid', () => {
  const lead = score({ phone: '12345', email: 'not-an-email' });
  assert.equal(lead.phone, null);
  assert.equal(lead.email, null);
});

test('lowercases and trims email', () => {
  assert.equal(score({ email: '  Juan.Cruz@Gmail.COM ' }).email, 'juan.cruz@gmail.com');
});

test('an emergency implant patient with full contact details is hot', () => {
  const lead = score({
    name: 'Juan Cruz', phone: '09175550142', email: 'juan@example.com',
    service: 'Dental implant consultation', urgency: 'emergency', preferred_time: 'tomorrow morning',
    is_new_patient: 'yes',
  });
  assert.equal(lead.tier, 'hot');
  assert.ok(lead.score >= 70 && lead.score <= 100);
  assert.ok(lead.tags.includes('emergency'));
  assert.ok(lead.tags.includes('new-patient'));
});

test('a routine cleaning with only a name is cold', () => {
  const lead = score({ name: 'Maria', service: 'cleaning', urgency: 'routine', preferred_time: 'sometime next month' });
  assert.equal(lead.tier, 'cold');
});

test('a lead with pain and a phone number is at least warm', () => {
  const lead = score({ name: 'Ana', phone: '09171234567', service: 'tooth filling', urgency: 'pain' });
  assert.ok(['warm', 'hot'].includes(lead.tier));
});

test('status is qualified only once name, a contact and a service are known', () => {
  assert.equal(score({ name: 'Ana', service: 'cleaning' }).status, 'new');
  assert.equal(score({ name: 'Ana', service: 'cleaning', email: 'ana@example.com' }).status, 'qualified');
});

test('tags HMO payers', () => {
  assert.ok(score({ payment: 'Maxicare HMO' }).tags.includes('hmo'));
});

test('flags hot and emergency leads for a staff alert', () => {
  assert.equal(score({ urgency: 'emergency' }).alert_staff, true);
  assert.equal(score({ name: 'Maria', service: 'cleaning' }).alert_staff, false);
});

test('unknown urgency values become null so the DB check constraint holds', () => {
  assert.equal(score({ urgency: 'whenever' }).urgency, null);
});

test('merges with what was saved earlier in the chat, newest non-empty value wins', () => {
  const lead = score({ phone: '', service: 'cleaning' }, { id: 7, name: 'Ana', phone: '+639171234567', service: 'consultation' });
  assert.equal(lead.name, 'Ana');
  assert.equal(lead.phone, '+639171234567');
  assert.equal(lead.service, 'cleaning');
});

test('never moves a booked or handed-off lead back to qualified', () => {
  assert.equal(score({ name: 'Ana', email: 'a@x.co', service: 'cleaning' }, { status: 'booked' }).status, 'booked');
  assert.equal(score({ name: 'Ana' }, { status: 'handoff' }).status, 'handoff');
});

test('lists the details still missing so the agent knows what to ask next', () => {
  assert.deepEqual(score({ name: 'Ana' }).missing, ['phone or email', 'service', 'preferred_time']);
});

test('an unknown new-patient answer keeps what was saved earlier', () => {
  assert.equal(score({ is_new_patient: '' }, { is_new_patient: true }).is_new_patient, true);
  assert.equal(score({ is_new_patient: 'no' }, { is_new_patient: true }).is_new_patient, false);
});
