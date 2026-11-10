import { describe, expect, it } from 'vitest';
import { rankPages, tokenize } from '../../src/domain/retrieval';
import { headingsOf, plainText } from '../../src/domain/library';

const pages = [
  { id: 'w/sales/create-an-invoice', product: 'w', title: 'Create an invoice', summary: 'Bill a customer for goods or services.', headings: ['Open invoices', 'Add lines'], body: 'Select New invoice. Choose the customer. Add lines.' },
  { id: 'w/sales/add-a-customer', product: 'w', title: 'Add a customer', summary: 'Create a customer record.', headings: ['Customer details'], body: 'Open Customers and select New customer.' },
  { id: 'c/deals/track-a-deal', product: 'c', title: 'Track a deal', summary: 'Follow a sale.', headings: [], body: 'Deals move through stages.' },
];

describe('keyword retrieval', () => {
  it('tokenizes with stop words and a light stemmer', () => {
    expect(tokenize('How do I create invoices?')).toEqual(['creat', 'invoic']);
  });

  it('ranks the page whose title matches first', () => {
    const r = rankPages(pages, 'how do I create an invoice');
    expect(r[0]?.page.id).toBe('w/sales/create-an-invoice');
  });

  it('returns nothing when nothing is relevant', () => {
    expect(rankPages(pages, 'weather in Lagos tomorrow')).toEqual([]);
    expect(rankPages(pages, 'the and of')).toEqual([]);
  });

  it('boosts the product and page the reader is on', () => {
    const r = rankPages(pages, 'customer', { pageId: 'w/sales/create-an-invoice' });
    expect(r.map((x) => x.page.id)).toContain('w/sales/create-an-invoice');
    expect(rankPages(pages, 'customer', { limit: 1 })).toHaveLength(1);
  });
});

describe('page text helpers', () => {
  const body = '## Before you start\n\n::::::steps\n::::step{title="Open invoices"}\nSelect **New**. ![shot](images/a.webp "x") See [the guide](guide:sales/x).\n:::legend\n1. Button\n:::\n::::\n::::::';
  it('finds headings and step titles', () => {
    expect(headingsOf(body)).toEqual(['Before you start', 'Open invoices']);
  });
  it('drops directives and image syntax, keeps link text', () => {
    const t = plainText(body);
    expect(t).toContain('Open invoices');
    expect(t).toContain('See the guide.');
    expect(t).not.toContain('images/a.webp');
    expect(t).not.toContain(':::');
  });
});
