import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { cardDb, readCards } from './lib/cardDb';
import { createCardFromInput, createCollectionFromInput } from '@visual-library/shared';

beforeEach(async () => {
  localStorage.clear();
  window.scrollTo = vi.fn();
  window.history.replaceState({}, '', '/');
  await cardDb.cards.clear();
  await cardDb.collections.clear();
  const cards = [
    createCardFromInput({ type: 'bookmark', title: 'Spec checklist', sourceUrl: 'https://example.com/spec', note: 'Track the milestone and accepted behavior.', tags: ['planning'] }),
    createCardFromInput({ type: 'text', title: 'Design note', note: 'A design observation', tags: ['research'] }),
  ];
  await cardDb.cards.bulkPut(cards);
  await cardDb.collections.bulkPut([
    createCollectionFromInput({ name: 'Inbox', cardIds: cards.map(card => card.id) }),
    createCollectionFromInput({ name: 'Research', cardIds: [cards[0].id] }),
  ]);
});

describe('App', () => {
  it('defaults to dark and opens settings only through the profile avatar', () => {
    localStorage.removeItem('duckler-theme-mode');
    localStorage.removeItem('visual-library-theme');
    render(<App />);
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(navigation.getAllByRole('button')).toHaveLength(4);
    expect(navigation.queryByText('Settings')).not.toBeInTheDocument();
    for (const name of ['Collections', 'Canvas']) {
      expect(screen.getByRole('button', { name }).querySelector('svg')).toBeInTheDocument();
    }
    fireEvent.click(navigation.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip', { name: 'Profile preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('honors an explicitly saved light theme', () => {
    localStorage.setItem('duckler-theme-mode', 'light');
    render(<App />);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    localStorage.removeItem('duckler-theme-mode');
    localStorage.removeItem('visual-library-theme');
  });

  it('renders centered refs with saved cards and collections', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    await screen.findByRole('article', { name: 'Open Spec checklist' });

    expect(screen.getByRole('heading', { name: 'refs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose collection' })).toBeInTheDocument();
    expect(screen.getAllByText('Spec checklist').length).toBeGreaterThan(0);
    expect(screen.getByText(/Track the milestone/i)).toBeInTheDocument();
  });

  it('opens card details from the keyboard and keeps the library header minimal', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    await screen.findByRole('article', { name: 'Open Spec checklist' });

    expect(screen.queryByText('A place for what stays with you.')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('article', { name: 'Open Spec checklist' }), { key: 'Enter' });

    expect(screen.getByLabelText('Card details')).toBeInTheDocument();
  });

  it('opens the add-card composer as a focused dialog', () => {
    render(<App />);

    expect(screen.queryByRole('dialog', { name: 'Add card' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));

    expect(screen.getByRole('dialog', { name: 'Add card' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('shows collection previews and opens a collection in the library', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'All notes' });

    fireEvent.click(screen.getByRole('button', { name: /^Collections$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open collection Inbox' }));

    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getAllByText('Spec checklist').length).toBeGreaterThan(0);
  });

  it('keeps the centered Home shortcuts even after saving notes and opening a collection', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'All notes' });
    expect(screen.getByRole('button', { name: 'Open collections' }).closest('.home-launcher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas' }).closest('.home-launcher')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Collections$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open collection Inbox' }));
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duckler home' }));
    expect(screen.queryByRole('heading', { name: 'refs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Filter by media type' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open collections' }).querySelector('.collection-stack-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas' }).querySelector('.canvas-orbit-icon')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All notes' }));
    expect(screen.getByRole('heading', { name: 'refs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose collection' })).toHaveTextContent('All notes');
  });

  it('opens a local profile and saves the display name', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), { target: { value: 'Paulo' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Profile tag' }), { target: { value: '@paulo' } });

    await waitFor(() => expect(localStorage.getItem('visual-library-profile-name')).toBe('Paulo'));
    await waitFor(() => expect(localStorage.getItem('visual-library-profile-tag')).toBe('paulo'));
    expect(screen.getByRole('button', { name: 'Open settings' })).toHaveTextContent('P');
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Open settings' }).parentElement!);
    expect(within(screen.getByRole('tooltip', { name: 'Profile preview' })).getByText('@paulo')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Profile name' })).not.toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Open settings' }).parentElement!);
    expect(screen.queryByRole('tooltip', { name: 'Profile preview' })).not.toBeInTheDocument();
  });

  it('goes back from a collection to Collections and then Home', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'All notes' });
    fireEvent.click(screen.getByRole('button', { name: 'Open collections' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open collection Inbox' }));
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByRole('heading', { name: 'Collections' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByRole('button', { name: 'Open collections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('button')).toHaveLength(4);
  });

  it('stores an uploaded profile photo locally and supports removing it', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    fireEvent.change(screen.getByLabelText('Choose profile photo'), {
      target: { files: [new File(['profile-image'], 'profile.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(localStorage.getItem('visual-library-profile-photo')).toMatch(/^data:image\/png;base64,/));
    expect(screen.getByRole('button', { name: 'Open settings' }).querySelector('img')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(localStorage.getItem('visual-library-profile-photo')).toBeNull();
  });

  it('imports Cloudflare share fallback data into IndexedDB and cleans the URL', async () => {
    const shareId = `pages-share-${Date.now()}`;
    window.history.replaceState({}, '', `/?sharedId=${shareId}&sharedTitle=Cloudflare+share&sharedText=Saved+from+share&sharedUrl=https%3A%2F%2Fexample.com%2Fshare`);

    render(<App />);

    expect(await screen.findByRole('article', { name: 'Open Cloudflare share' })).toBeInTheDocument();
    await waitFor(async () => {
      expect((await readCards()).some((card) => card.id === shareId && card.sourceUrl === 'https://example.com/share')).toBe(true);
    });
    expect(window.location.search).toBe('');
    expect(screen.getByRole('status')).toHaveTextContent('Imported 1 shared item');
  });

  it('creates a card from the writing-focused composer', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    await screen.findByRole('article', { name: 'Open Spec checklist' });

    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    const composer = within(screen.getByRole('dialog', { name: 'Add card' }));
    fireEvent.click(composer.getByRole('button', { name: /Collections/ }));
    fireEvent.click(composer.getByRole('checkbox', { name: 'Inbox' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Quick capture' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Saved from the composer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('article', { name: 'Open Quick capture' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Inbox' }).some((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add card' })).not.toBeInTheDocument());
  });

  it('keeps search and the centered entry points on an empty Home without library filters', async () => {
    await cardDb.cards.clear();
    await cardDb.collections.clear();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'));
    expect(screen.queryByRole('heading', { name: 'refs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Filter by media type' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search refs')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All notes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open collections' }).querySelector('.collection-stack-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas' }).querySelector('.canvas-orbit-icon')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collections' }));
    expect(screen.queryByRole('navigation', { name: 'Filter by media type' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create a collection' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New collection name' }), { target: { value: 'First collection' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    await waitFor(async () => expect((await cardDb.collections.toArray()).some(collection => collection.name === 'First collection')).toBe(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose collection' })).toHaveTextContent('First collection'));
  });

  it('customizes only the identity card from Settings and keeps the hover preview read-only', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    fireEvent.change(screen.getByLabelText('Profile card color'), { target: { value: '#506bbb' } });
    fireEvent.change(screen.getByLabelText('Profile tag'), { target: { value: 'paulo' } });
    await waitFor(() => expect(localStorage.getItem('duckler-profile-card-color')).toBe('#506bbb'));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Open settings' }).parentElement!);
    const preview = screen.getByRole('tooltip', { name: 'Profile preview' });
    const identity = within(preview).getByRole('group', { name: 'Profile card' });
    expect(identity).toHaveClass('profile-identity-card');
    expect(preview).not.toHaveClass('profile-identity-card');
    expect(within(identity).getByText('@paulo')).toBeInTheDocument();
    expect(within(preview).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('main').style.getPropertyValue('--profile-accent')).toBe('#506bbb');
  });

  it('keeps search on the populated Home and opens matching refs as you type', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'All notes' });
    fireEvent.change(within(screen.getByLabelText('Search refs')).getByRole('textbox'), { target: { value: 'Design' } });
    expect(screen.getByRole('heading', { name: 'refs' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Open Design note' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Open Spec checklist' })).not.toBeInTheDocument();
  });

  it('opens a searchable gallery with one canvas per collection', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'All notes' });
    fireEvent.click(screen.getByRole('button', { name: 'Open canvas' }));
    expect(screen.getByRole('heading', { name: 'Canvases' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Open canvas Inbox' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas Research' })).toBeInTheDocument();
    fireEvent.change(within(screen.getByLabelText('Search refs')).getByRole('textbox'), { target: { value: 'Inbox' } });
    expect(screen.getByRole('button', { name: 'Open canvas Inbox' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open canvas Research' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByRole('button', { name: 'Open canvas' })).toBeInTheDocument();
  });
});
