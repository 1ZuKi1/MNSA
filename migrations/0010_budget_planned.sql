-- Planned purchases: a line can be listed before the money is spent («Авахаар төлөвлөсөн»). It shows on the
-- public page apart from the spending and counts in no "spent" sum until the «Төсвийн хариуцагч» marks it
-- bought («Худалдаж авсан»), with the real quantity, price and date. Existing lines are all spent.
ALTER TABLE budget_items ADD COLUMN status TEXT NOT NULL DEFAULT 'spent' CHECK (status IN ('planned','spent'));
ALTER TABLE budget_items ADD COLUMN confirmed_by INTEGER REFERENCES users(id);
ALTER TABLE budget_items ADD COLUMN confirmed_at INTEGER;
