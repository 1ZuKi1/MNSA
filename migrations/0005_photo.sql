-- A portrait for the public «Удирдлагын баг» page. Points at a row in the media database (mnsa-media);
-- NULL shows the person's initials instead. Uploaded by the person themselves or by whoever manages members.
ALTER TABLE users ADD COLUMN photo_id TEXT;
