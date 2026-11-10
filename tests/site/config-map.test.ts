import { describe, expect, it } from 'vitest';
import { areaOf, buildConfigMap, downstreamOf, isSetupPage, upstreamOf, type MapPageInput } from '@/lib/content/config-map';

const p = (id: string, needs: string[] = [], extra: Partial<MapPageInput> = {}): MapPageInput => {
  const [, moduleSlug = 'settings', slug = id] = id.split('/');
  return { id, moduleSlug, moduleTitle: moduleSlug, slug, title: slug, summary: '', href: `/${id}/`, needs: needs.map((n) => ({ id: n })), ...extra };
};

const pages = [
  p('w/accounting/set-up-the-chart-of-accounts'),
  p('w/settings/set-up-default-accounts', ['w/accounting/set-up-the-chart-of-accounts']),
  p('w/settings/set-up-taxes', ['w/accounting/set-up-the-chart-of-accounts']),
  p('w/settings/set-up-posting-groups', ['w/settings/set-up-default-accounts', 'w/settings/set-up-taxes']),
  p('w/sales/add-a-customer', ['w/settings/set-up-posting-groups']),
  p('w/sales/create-an-invoice', ['w/sales/add-a-customer', 'w/settings/set-up-taxes']),
  p('w/settings/settings-overview', ['w/settings/set-up-taxes']),
  p('w/accounting/what-gets-posted'),
];

describe('configuration center map', () => {
  const map = buildConfigMap(pages);
  it('tells setup pages from tasks, overviews and explainers', () => {
    expect(isSetupPage({ moduleSlug: 'hr-admin', slug: 'set-up-leave' })).toBe(true);
    expect(isSetupPage({ moduleSlug: 'settings', slug: 'settings-overview' })).toBe(false);
    expect(isSetupPage({ moduleSlug: 'settings', slug: 'how-invoices-get-their-accounts' })).toBe(false);
    expect(isSetupPage({ moduleSlug: 'sales', slug: 'create-an-invoice' })).toBe(false);
    expect(isSetupPage({ moduleSlug: 'sales', slug: 'set-up-a-recurring-invoice' })).toBe(false);
    expect(isSetupPage({ moduleSlug: 'accounting', slug: 'set-up-a-recurring-journal', kind: 'setup' })).toBe(true);
    expect(isSetupPage({ moduleSlug: 'settings', slug: 'company-notes', kind: 'reference' })).toBe(false);
    expect(map.setups.map((s) => s.id)).not.toContain('w/settings/settings-overview');
  });
  it('puts each setup one step after the deepest thing it needs', () => {
    const stage = Object.fromEntries(map.setups.map((s) => [s.id.split('/')[2], s.stage]));
    expect(stage).toEqual({ 'set-up-the-chart-of-accounts': 1, 'set-up-default-accounts': 2, 'set-up-taxes': 2, 'set-up-posting-groups': 3 });
    expect(map.stages).toBe(3);
  });
  it('lists every setup a task needs, through other tasks too, in order', () => {
    const invoice = map.processes.find((x) => x.id === 'w/sales/create-an-invoice');
    expect(invoice?.chain.map((id) => id.split('/')[2])).toEqual(['set-up-the-chart-of-accounts', 'set-up-default-accounts', 'set-up-taxes', 'set-up-posting-groups']);
  });
  it('knows which tasks use a setup and what builds on it', () => {
    const coa = map.setups.find((s) => s.id.endsWith('chart-of-accounts'));
    expect(coa?.usedBy.sort()).toEqual(['w/sales/add-a-customer', 'w/sales/create-an-invoice']);
    expect(coa?.unlocks.sort()).toEqual(['w/settings/set-up-default-accounts', 'w/settings/set-up-taxes']);
    expect([...downstreamOf(map, 'w/accounting/set-up-the-chart-of-accounts')]).toContain('w/settings/set-up-posting-groups');
    expect([...upstreamOf(map, 'w/settings/set-up-posting-groups')].length).toBe(3);
  });
  it('survives a prerequisite loop', () => {
    const loop = buildConfigMap([p('w/settings/set-up-a', ['w/settings/set-up-b']), p('w/settings/set-up-b', ['w/settings/set-up-a'])]);
    expect(loop.setups).toHaveLength(2);
  });
  it('names areas by module and HR section', () => {
    expect(areaOf({ moduleSlug: 'hr-admin', moduleTitle: 'HR administration', section: 'Leave' })).toBe('HR: Leave');
    expect(areaOf({ moduleSlug: 'procurement', moduleTitle: 'Procurement' })).toBe('Purchases');
    expect(areaOf({ moduleSlug: 'settings', moduleTitle: 'Settings', section: 'Sales' })).toBe('Sales');
  });
});
