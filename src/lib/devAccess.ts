// Who counts as "the developer" — the one account allowed to hide
// in-development sidebar pages from the rest of the shop so other users
// don't wander into them mid-build (see contexts/DevGateContext.tsx).
//
// Pinned to the AppUser row id, with the REMAN 4D tech id as a fallback in
// case the account is ever recreated with a new uuid. BRAXON login name
// "Gabhy"; REMAN tech "Gabhy Kiba" / 3569.

import type { AppUser } from '@/contexts/SessionContext';
import type { Page } from '@/lib/pages';

const DEV_USER_IDS = new Set<string>(['2e1c8ded-970e-4f0a-adfd-aa266dce53df']);
const DEV_REMAN_TECH_IDS = new Set<string>(['3569']);

export function isDevUser(user: AppUser | null | undefined): boolean {
  if (!user) return false;
  if (DEV_USER_IDS.has(user.id)) return true;
  return !!user.remanTechId && DEV_REMAN_TECH_IDS.has(user.remanTechId);
}

/** Pages the developer may hide. 'home' is intentionally excluded so there
 *  is always a page left to land on. */
export const HIDEABLE_PAGES: readonly Page[] = [
  'valves', 'motors', 'signal', 'jobs', 'reman',
  'f2evo_hydraulic', 'f2evo_electronics', 'f2evo_gearbox', 'f2evo_sensor', 'f2evo_washing',
];

/** The shared AppSetting key holding the JSON array of hidden page ids. */
export const HIDDEN_PAGES_KEY = 'hidden_pages';

export function parseHiddenPages(raw: string | null | undefined): Page[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((p): p is Page => (HIDEABLE_PAGES as readonly string[]).includes(p));
  } catch {
    return [];
  }
}
