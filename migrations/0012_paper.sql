-- Documents from before the website: the association's paper (Word) documents, entered into the archive so
-- every year's papers sit in one place («Баримт бичиг»). Such a record was approved on paper, not through the
-- site: paper_json holds what the paper itself says — its heading, its date and who signed it — and the record
-- is stored as already approved, so nobody can edit it and it never enters an approval chain.
--
-- paper_json: {"source": "J-0001.docx", "kind": "ЖУРАМ", "subject": "…", "date": "2025-10-14",
--              "signers": [{"title": "Холбооны Тэргүүн", "names": ["Б. Амгаланбаяр"]}, …],
--              "paper_number": "0003", "note": "…", "imported_at": 1791533000}
-- The full text is in fields_json under "text". NULL = an ordinary record written on the site.
ALTER TABLE records ADD COLUMN paper_json TEXT;
