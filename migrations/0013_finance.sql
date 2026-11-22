-- «Санхүү» — how money moves through the association, kept on the staff site only (never on the public
-- site). One row per request, as on the association's paper form «САНХҮҮГИЙН ХҮСЭЛТИЙН МАЯГТ»:
--   advance    «Урьдчилгаа авах»            money paid out before spending
--   reimburse  «Гарсан зардал нөхөн авах»   money paid back after spending
--   income     «Орлогын бүртгэл»            money received
-- The «Төсвийн хариуцагч» (users.is_budget_keeper) decides first, then the President; neither decides their
-- own request. Once approved, the keeper records the money given or received (form section 7).
-- Money is in hundredths of the currency (fen for CNY, мөнгө for MNT), as integers. Nothing is deleted.

CREATE TABLE finance_requests (
  id              INTEGER PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('advance','reimburse','income')),
  academic_year   TEXT NOT NULL,
  number          TEXT NOT NULL UNIQUE,                 -- МОХ-САН/2627/001, given on creation
  requester_id    INTEGER NOT NULL REFERENCES users(id),
  department_id   INTEGER REFERENCES departments(id),   -- NULL = «Бусад»
  contact         TEXT,
  event_name      TEXT NOT NULL,                        -- «Арга хэмжээний нэр»
  spent_on        INTEGER NOT NULL,                     -- «Зардал гарах огноо» (Beijing midnight)
  purpose         TEXT,                                 -- «Зорилго, тайлбар»
  currency        TEXT NOT NULL DEFAULT 'CNY',          -- CNY | MNT | anything else typed
  total_minor     INTEGER NOT NULL,                     -- summed from the lines on saving
  pay_method      TEXT CHECK (pay_method IN ('cash','wechat')),
  payee_name      TEXT,
  payee_account   TEXT,                                 -- «Данс / WeChat ID»: only the requester and the deciders see it
  receipts_stated INTEGER NOT NULL DEFAULT 0,           -- «Баримт хавсаргасан: ___ ширхэг»
  no_receipt_reason TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid','cancelled')),
  awaiting        TEXT CHECK (awaiting IN ('keeper','president')),
  keeper_id       INTEGER REFERENCES users(id),         -- who approved as «Санхүү хариуцсан гишүүн»
  keeper_at       INTEGER,
  president_id    INTEGER REFERENCES users(id),
  president_at    INTEGER,
  rejected_by     INTEGER REFERENCES users(id),
  rejected_at     INTEGER,
  reject_reason   TEXT,
  paid_minor      INTEGER,                              -- «Олгосон дүн» / received
  paid_on         INTEGER,                              -- «Хүлээн авсан огноо»
  paid_by         INTEGER REFERENCES users(id),         -- «Олгосон хүн»
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_finance_year ON finance_requests(academic_year, status);
CREATE INDEX idx_finance_requester ON finance_requests(requester_id, created_at DESC);

CREATE TABLE finance_lines (
  id          INTEGER PRIMARY KEY,
  request_id  INTEGER NOT NULL REFERENCES finance_requests(id),
  sort        INTEGER NOT NULL,
  item        TEXT NOT NULL,             -- «Зүйлийн нэр, тайлбар»
  qty_c       INTEGER NOT NULL,          -- quantity × 100
  unit_minor  INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  note        TEXT
);
CREATE INDEX idx_finance_lines ON finance_lines(request_id, sort);

-- Photos of receipts (чек, QR төлбөрийн зураг, нэхэмжлэх), kept private in the media database.
CREATE TABLE finance_receipts (
  id          INTEGER PRIMARY KEY,
  request_id  INTEGER NOT NULL REFERENCES finance_requests(id),
  media_id    TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  removed_at  INTEGER,
  removed_by  INTEGER REFERENCES users(id)
);
CREATE INDEX idx_finance_receipts ON finance_receipts(request_id);
