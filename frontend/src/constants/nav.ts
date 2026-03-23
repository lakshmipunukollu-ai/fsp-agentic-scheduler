import type { UserRole } from '../types';

/** Staff app paths — use with react-router `navigate()` */
export const STAFF_PATH = {
  dashboard: '/dashboard',
  queue: '/queue',
  activity: '/activity',
  students: '/students',
  analysis: '/analysis',
  config: '/config',
  account: '/account',
} as const;

export type StaffTabId = keyof typeof STAFF_PATH;

export function pathToTab(pathname: string): string {
  const p = pathname.split('?')[0];
  if (p === '/' || p === '/dashboard') return 'dashboard';
  if (p.startsWith('/queue')) return 'queue';
  if (p.startsWith('/activity')) return 'activity';
  if (p.startsWith('/students')) return 'students';
  if (p.startsWith('/analysis')) return 'analysis';
  if (p.startsWith('/config')) return 'config';
  if (p.startsWith('/account')) return 'account';
  return 'dashboard';
}

/** Default staff landing route after login (index `/`). */
export function defaultHomePath(role: UserRole): string {
  if (role === 'scheduler') return '/queue';
  return '/dashboard';
}

export type BreadcrumbItem = { label: string; path?: string };

export function breadcrumbsForPath(pathname: string): BreadcrumbItem[] {
  const p = pathname.split('?')[0];
  if (p === '/' || p === '/dashboard') return [{ label: 'Dashboard', path: '/dashboard' }];
  if (p.startsWith('/queue')) {
    const m = /^\/queue\/([^/]+)/.exec(p);
    const items: BreadcrumbItem[] = [{ label: 'Approval Queue', path: '/queue' }];
    if (m) items.push({ label: 'Suggestion' });
    return items;
  }
  if (p.startsWith('/activity')) return [{ label: 'Activity Feed', path: '/activity' }];
  if (p.startsWith('/students')) return [{ label: 'Students', path: '/students' }];
  if (p.startsWith('/analysis')) return [{ label: 'Analysis', path: '/analysis' }];
  if (p.startsWith('/config')) return [{ label: 'Policy Config', path: '/config' }];
  if (p.startsWith('/account')) return [{ label: 'Account', path: '/account' }];
  return [{ label: 'Dashboard', path: '/dashboard' }];
}
