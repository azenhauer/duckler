import { describe, expect, it } from 'vitest';
import { cleanPageTitle, screenshotTitle, shorten } from './naming';

describe('screenshot names', () => {
  it('prefers the text inside the captured region, then the page title, plus the site', () => {
    expect(screenshotTitle({ subject: 'Sony WH-1000XM5 Wireless Headphones', pageTitle: 'Amazon.com: Sony WH-1000XM5', host: 'www.amazon.com' })).toBe('Sony WH-1000XM5 Wireless Headphones · amazon.com');
    expect(screenshotTitle({ pageTitle: 'Pricing | Stripe', siteName: 'Stripe', host: 'stripe.com' })).toBe('Pricing · Stripe');
    expect(screenshotTitle({ ogTitle: 'A calm reading room', pageTitle: 'ignored', host: 'example.org' })).toBe('A calm reading room · example.org');
    expect(screenshotTitle(undefined, '(3) Inbox — Gmail')).toBe('Inbox — Gmail');
    expect(screenshotTitle({ host: 'example.org' })).toBe('example.org');
    expect(screenshotTitle(undefined)).toBe('Captured area');
  });

  it('never starts with "Screenshot" and keeps names short, clean and single-line', () => {
    const long = screenshotTitle({ subject: 'word '.repeat(60), host: 'example.org' });
    expect(long.length).toBeLessThanOrEqual(90 + ' · example.org'.length);
    expect(long).toMatch(/…\s·\sexample\.org$/);
    expect(screenshotTitle({ subject: 'Line one\nLine\u0000 two‮', host: 'a.dev' })).toBe('Line one Line two · a.dev');
    expect(screenshotTitle({ subject: 42, pageTitle: { evil: true }, host: ['x'] }, 'Docs')).toBe('Docs');
    expect(screenshotTitle({ subject: '—', pageTitle: 'Real title' })).toBe('Real title');
  });

  it('does not repeat the site when the name already contains it', () => {
    expect(screenshotTitle({ subject: 'GitHub Actions overview', siteName: 'GitHub', host: 'github.com' })).toBe('GitHub Actions overview');
  });

  it('strips site segments and notification counts from page titles', () => {
    expect(cleanPageTitle('(12) Home / X', 'X', 'x.com')).toBe('(12) Home / X'.replace('(12) ', ''));
    expect(cleanPageTitle('Stripe | Payments infrastructure', 'Stripe', 'stripe.com')).toBe('Payments infrastructure');
    expect(cleanPageTitle('How to cook rice - BBC Food', '', 'www.bbc.co.uk')).toBe('How to cook rice');
    expect(cleanPageTitle('Plain title', '', 'example.com')).toBe('Plain title');
    expect(shorten('alpha beta gamma', 11)).toBe('alpha beta…');
  });
});
