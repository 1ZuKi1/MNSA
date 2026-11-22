/** The numbers shown next to the staff menu: one query for the work, one for the money. */
import { one } from './db';
import { awaitingWhere } from './records';
import type { SessionUser } from './types';

export interface NavCounts {
  /** Documents waiting for this person's decision. */
  awaiting: number;
  /** Event tasks this person has taken on and not finished. */
  tasks: number;
  /** Jobs («Ажлууд») this person is on — accountable or helping — not done yet. */
  jobs: number;
  /** Money requests («Санхүү») waiting on this person: a decision (keeper, President) or recording the money (keeper). */
  money: number;
}

export async function navCounts(a: SessionUser): Promise<NavCounts> {
  const w = awaitingWhere(a);
  // awaitingWhere numbers its own parameters from ?1; the task count's user id goes after them.
  const n = (w?.params.length ?? 0) + 1;
  const [row, money] = await Promise.all([
    one<Omit<NavCounts, 'money'>>(
      `SELECT ${w ? `(SELECT COUNT(*) FROM records r WHERE ${w.sql})` : '0'} AS awaiting,
              (SELECT COUNT(*) FROM task_assignments x JOIN event_tasks k ON k.id = x.task_id
                WHERE x.user_id = ?${n} AND x.status = 'active' AND k.status = 'open') AS tasks,
              (SELECT COUNT(*) FROM jobs j WHERE j.status IN ('todo','doing')
                  AND (j.owner_id = ?${n} OR EXISTS (SELECT 1 FROM job_helpers h WHERE h.job_id = j.id AND h.user_id = ?${n} AND h.left_at IS NULL))) AS jobs`,
      ...(w?.params ?? []),
      a.id,
    ),
    moneyCount(a),
  ]);
  return { awaiting: row?.awaiting ?? 0, tasks: row?.tasks ?? 0, jobs: row?.jobs ?? 0, money };
}

/**
 * Requests waiting on this person: the President's decisions; for the «Төсвийн хариуцагч», the decisions
 * that are theirs and the approved requests to record. A database without the money tables yet (migration
 * 0013 not run) counts 0 instead of breaking every staff page.
 */
async function moneyCount(a: SessionUser): Promise<number> {
  try {
    const r = await one<{ c: number }>(
      `SELECT COUNT(*) AS c FROM finance_requests f
        WHERE (f.status = 'pending' AND f.awaiting = 'president' AND ?2 = 'president' AND f.requester_id <> ?1)
           OR (EXISTS (SELECT 1 FROM users k WHERE k.id = ?1 AND k.is_budget_keeper = 1 AND k.status = 'active' AND k.role NOT IN ('president','maintainer'))
               AND (f.status = 'approved' OR (f.status = 'pending' AND f.awaiting = 'keeper' AND f.requester_id <> ?1)))`,
      a.id,
      a.role,
    );
    return r?.c ?? 0;
  } catch {
    return 0;
  }
}
