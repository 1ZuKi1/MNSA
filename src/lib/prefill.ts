/**
 * Starting values for a new document, taken from the member list so nobody retypes who is in a
 * department or who sits at a heads' meeting (the old paper form forgot the Сургалтын хэлтэс).
 */
import { departments } from './db';
import type { RecordType } from './record-types';
import { deptLine, staffTeam } from './team';
import { now, toDateInput } from './time';
import type { DeptSlug, SessionUser } from './types';

export async function prefill(type: RecordType, dept: DeptSlug, user: SessionUser): Promise<Record<string, string>> {
  if (type.slug === 'tailan') {
    return { members: deptLine(await staffTeam(), dept) };
  }
  if (type.slug === 'protokol') {
    const [team, depts] = await Promise.all([staffTeam(), departments()]);
    const president = team.find((p) => p.role === 'president');
    const lines = [`Тэргүүн: ${president?.name ?? ''}`];
    for (const d of depts.filter((x) => !x.is_leadership)) {
      const head = team.find((p) => p.dept === d.slug && p.role === 'head');
      lines.push(`${d.name_mn}: ${head?.name ?? ''}`);
    }
    return { attendees: lines.join('\n'), secretary: user.name, meeting_date: toDateInput(now()) };
  }
  // the request is usually written the day it is made
  if (type.slug === 'choloolol') return { request_date: toDateInput(now()) };
  return {};
}
