-- A person's full name as written on official papers («Мягмарбаатар Эмүжин»), next to the short name the
-- site shows everywhere («М. Эмүжин»). Optional: duty letters use it when present.
ALTER TABLE users ADD COLUMN full_name TEXT;
