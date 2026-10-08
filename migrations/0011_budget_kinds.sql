-- From the association's real budget sheet (Соёлын өдөрлөг, 2026-10):
--   a planned line carries a state: «Авах боломжтой» · «Хойшлуулсан» · «Авах боломжгүй»;
--   a planned quantity may be a range (хуушуур 300–450 ш → ¥1,500–¥2,250).
ALTER TABLE budget_items ADD COLUMN plan_state TEXT CHECK (plan_state IN ('can','postponed','cannot'));  -- planned lines only
ALTER TABLE budget_items ADD COLUMN qty_max_c INTEGER;      -- the high end of a range, planned lines only; NULL = exact
ALTER TABLE budget_items ADD COLUMN total_max_fen INTEGER;  -- with a range: round(qty_max_c × unit_fen / 100)
UPDATE budget_items SET plan_state = 'can' WHERE status = 'planned';
