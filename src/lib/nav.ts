/** The two numbers shown next to the staff menu. One query per page, both counts at once. */
import { one } from './db';
import { awaitingWhere } from './records';
import type { SessionUser } from './types';

export interface NavCounts {
  /** Documents waiting for this person's decision. */
  awaiting: number;
  /** Event tasks this person has taken on and not finished. */
  tasks: number;
}

export async function navCounts(a: SessionUser): Promise<NavCounts> {
  const w = awaitingWhere(a);
  // awaitingWhere numbers its own parameters from ?1; the task count's user id goes after them.
  const n = (w?.params.length ?? 0) + 1;
  const row = await one<NavCounts>(
    `SELECT ${w ? `(SELECT COUNT(*) FROM records r WHERE ${w.sql})` : '0'} AS awaiting,
            (SELECT COUNT(*) FROM task_assignments x JOIN event_tasks k ON k.id = x.task_id
              WHERE x.user_id = ?${n} AND x.status = 'active' AND k.status = 'open') AS tasks`,
    ...(w?.params ?? []),
    a.id,
  );
  return row ?? { awaiting: 0, tasks: 0 };
}
