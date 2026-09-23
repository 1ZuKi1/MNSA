-- Images that must never be served on the public site. The official stamp is one: staff see it on printed
-- documents, but its URL only works behind the staff login.
ALTER TABLE media ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
