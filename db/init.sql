-- CRM schema for the lead agent. Runs once when the Postgres volume is created.

-- Same shape n8n's Postgres Chat Memory node creates. Made up front so the
-- handoff tool can read a transcript even before the first reply is saved.
CREATE TABLE n8n_chat_histories (
  id          serial PRIMARY KEY,
  session_id  varchar(255) NOT NULL,
  message     jsonb NOT NULL
);

CREATE TABLE leads (
  id              bigserial PRIMARY KEY,
  session_id      text UNIQUE NOT NULL,
  name            text,
  phone           text,
  email           text,
  service         text,
  urgency         text CHECK (urgency IN ('emergency', 'pain', 'routine')),
  is_new_patient  boolean,
  payment         text,
  preferred_time  text,
  notes           text,
  score           int NOT NULL DEFAULT 0,
  tier            text NOT NULL DEFAULT 'cold' CHECK (tier IN ('hot', 'warm', 'cold')),
  status          text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'qualified', 'booked', 'handoff', 'no_show', 'completed', 'lost')),
  tags            text[] NOT NULL DEFAULT '{}',
  source          text NOT NULL DEFAULT 'website-chat',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appointments (
  id                 bigserial PRIMARY KEY,
  lead_id            bigint NOT NULL REFERENCES leads(id),
  calendar_event_id  text,
  service            text NOT NULL,
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'booked'
                     CHECK (status IN ('booked', 'cancelled', 'no_show', 'completed')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Last line of defence against double booking: two booked appointments can't overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&) WHERE (status = 'booked');

CREATE TABLE handoffs (
  id           bigserial PRIMARY KEY,
  lead_id      bigint REFERENCES leads(id),
  session_id   text NOT NULL,
  reason       text NOT NULL,
  transcript   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

-- One row per reminder sent, so the follow-up workflow never sends the same one twice.
CREATE TABLE followups (
  id              bigserial PRIMARY KEY,
  lead_id         bigint NOT NULL REFERENCES leads(id),
  appointment_id  bigint REFERENCES appointments(id),
  kind            text NOT NULL CHECK (kind IN ('nudge_24h', 'nudge_72h', 'appt_reminder')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (lead_id, kind, appointment_id)
);

-- Analytics
CREATE VIEW v_daily_leads AS
SELECT date_trunc('day', created_at)::date AS day,
       count(*)                                   AS leads,
       count(*) FILTER (WHERE tier = 'hot')       AS hot,
       count(*) FILTER (WHERE status = 'booked')  AS booked
FROM leads GROUP BY 1 ORDER BY 1 DESC;

CREATE VIEW v_funnel AS
SELECT count(*)                                                        AS conversations,
       count(*) FILTER (WHERE status <> 'new')                          AS qualified,
       count(*) FILTER (WHERE status IN ('booked', 'completed', 'no_show')) AS booked,
       round(100.0 * count(*) FILTER (WHERE status IN ('booked', 'completed', 'no_show'))
             / nullif(count(*), 0), 1)                                  AS booking_rate_pct
FROM leads;

CREATE VIEW v_handoff_rate AS
SELECT count(DISTINCT h.session_id)                                       AS handoffs,
       (SELECT count(*) FROM leads)                                       AS leads,
       round(100.0 * count(DISTINCT h.session_id) / nullif((SELECT count(*) FROM leads), 0), 1) AS handoff_rate_pct
FROM handoffs h;
