-- From the association's real budget sheet (Соёлын өдөрлөг, 2026-10): a planned line carries a state —
-- «Авах боломжтой» · «Хойшлуулсан» · «Авах боломжгүй».
ALTER TABLE budget_items ADD COLUMN plan_state TEXT CHECK (plan_state IN ('can','postponed','cannot'));  -- planned lines only
UPDATE budget_items SET plan_state = 'can' WHERE status = 'planned';
