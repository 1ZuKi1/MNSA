-- Notifications on the phone (the team web installed as an app, see src/lib/push.ts).
-- One row per phone / browser that said yes to notifications. A person can have several (phone + laptop).
-- Rows go when the person turns notifications off, or when Apple/Google say the phone is gone (404/410).

CREATE TABLE push_subscriptions (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  endpoint    TEXT NOT NULL UNIQUE,   -- the push service's address for this one phone
  p256dh      TEXT NOT NULL,          -- the phone's public key (base64url)
  auth        TEXT NOT NULL,          -- the phone's auth secret (base64url)
  device      TEXT,                   -- "iPhone", "Android", "Windows"… shown in the list of devices
  created_at  INTEGER NOT NULL,
  last_ok_at  INTEGER                 -- last time a message reached it
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);
