-- The database table that keeps every lead from the contact form.
-- Create it once with: npx wrangler d1 execute zuo-leads --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  first_name TEXT    NOT NULL,
  last_name  TEXT    NOT NULL,
  street     TEXT    NOT NULL,
  unit       TEXT,
  city       TEXT    NOT NULL,
  state      TEXT    NOT NULL,
  zip        TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  phone      TEXT    NOT NULL,
  units      TEXT,
  notes      TEXT,
  emailed    INTEGER NOT NULL DEFAULT 0
);
