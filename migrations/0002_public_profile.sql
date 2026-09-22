-- Whether a person appears on the public "Удирдлагын баг" page. On by default; anyone may hide themselves.
ALTER TABLE users ADD COLUMN show_public INTEGER NOT NULL DEFAULT 1;
