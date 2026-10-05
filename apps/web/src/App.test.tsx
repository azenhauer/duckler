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
  it('removes a badge relationship, restores it with Undo and permits retry after failed Undo', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    const card = await screen.findByRole('article', { name: 'Open Spec checklist' });
    const badges = within(card.parentElement!);
    fireEvent.click(badges.getByRole('button', { name: 'Collection Inbox' }));
    const picker = screen.getByRole('dialog', { name: 'Collections for this card' });
    expect(within(picker).getByRole('checkbox', { name: 'Research' })).toBeChecked();
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Inbox' }));
    await screen.findByRole('button', { name: 'Undo' });
    expect(within(picker).getByRole('checkbox', { name: 'Inbox' })).not.toBeChecked();
    fireEvent.keyDown(picker, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Collections for this card' })).not.toBeInTheDocument();
    expect(badges.queryByRole('button', { name: 'Collection Inbox' })).not.toBeInTheDocument();
    expect(badges.getByRole('button', { name: 'Collection Research' })).toBeInTheDocument();
    const failure = vi.spyOn(cardDb.collections, 'put').mockRejectedValueOnce(new Error('Storage full'));
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await screen.findByText("Couldn't update card. Try again.");
      expect(badges.queryByRole('button', { name: 'Collection Inbox' })).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
    } finally { failure.mockRestore(); }
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument());
    expect(badges.getByRole('button', { name: 'Collection Inbox' })).toBeInTheDocument();
    const stored = (await readCards()).find(item => item.title === 'Spec checklist')!;
    expect((await cardDb.collections.toArray()).filter(item => item.cardIds.includes(stored.id))).toHaveLength(2);
  });

  it('manages several memberships from one picker, creates collections inline and opens with browser history', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    const card = await screen.findByRole('article', { name: 'Open Design note' });
    fireEvent.click(within(card.parentElement!).getByRole('button', { name: 'Collection Inbox' }));
    const picker = screen.getByRole('dialog', { name: 'Collections for this card' });
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Research' }));
    await waitFor(() => expect(within(card.parentElement!).getByRole('button', { name: 'Collection Research' })).toBeInTheDocument());
    expect(within(card.parentElement!).getByRole('button', { name: 'Collection Inbox' })).toBeInTheDocument();
    fireEvent.change(within(picker).getByRole('searchbox', { name: 'Search collections' }), { target: { value: 'res' } });
    expect(within(picker).queryByRole('checkbox', { name: 'Inbox' })).not.toBeInTheDocument();
    fireEvent.click(within(picker).getByRole('button', { name: '+ Create new collection' }));
    fireEvent.change(within(picker).getByRole('textbox', { name: 'New collection name' }), { target: { value: 'Moodboard' } });
    fireEvent.click(within(picker).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(within(card.parentElement!).getByRole('button', { name: 'Collection Moodboard' })).toBeInTheDocument());
    const stored = (await readCards()).find(item => item.title === 'Design note')!;
    await waitFor(async () => expect((await cardDb.collections.toArray()).filter(item => item.cardIds.includes(stored.id)).map(item => item.name).sort()).toEqual(['Inbox', 'Moodboard', 'Research']));
    fireEvent.click(within(picker).getByRole('button', { name: 'Open collection Research' }));
    expect(window.history.state?.duckler).toMatchObject({ view: 'library' });
  });

  it('opens an account menu with quick appearance controls that agree with Settings', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    const menu = screen.getByRole('dialog', { name: 'Account menu' });
    fireEvent.click(within(menu).getByRole('button', { name: 'Light' }));
    expect(within(menu).getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(menu).getByRole('button', { name: 'Dark' }));
    fireEvent.change(within(menu).getByRole('combobox', { name: 'Skin' }), { target: { value: 'ps-blue' } });
    expect(document.querySelector('.app-shell')).toHaveStyle({ '--ui-accent-primary': '#47a5ff' });
    fireEvent.click(within(menu).getByRole('button', { name: 'All settings' }));
    expect(screen.queryByRole('dialog', { name: 'Account menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PS Blue' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('exposes editable PlayStation appearance presets in Settings and persists changes', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('region', { name: 'System colors' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PS Blue' }));
    expect(document.querySelector('.app-shell')).toHaveStyle({ '--ui-accent-primary': '#47a5ff' });
    const background = screen.getByLabelText('Background');
    fireEvent.change(background, { target: { value: '#101010' } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('duckler-appearance-v1') ?? '{}').values.background).toBe('#101010'));
  });
  it('opens the add menu on hover and edits a card only after Save', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Design note' }));
    const dialog = screen.getByRole('dialog', { name: 'Card details' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Note' }), { target: { value: 'Revised note' } });
    expect((await readCards()).find(card => card.title === 'Design note')?.note).toBe('A design observation');
    fireEvent.click(within(dialog).getByRole('button', { name: /Collections/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Research' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Card details' })).not.toBeInTheDocument());
    const card = (await readCards()).find(card => card.title === 'Design note')!;
    expect(card.note).toBe('Revised note');
    expect((await cardDb.collections.toArray()).find(collection => collection.name === 'Research')?.cardIds).toContain(card.id);
  });
  it('shows bulk actions only for multiple cards and saves membership from card options', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    const card = await screen.findByRole('article', { name: 'Open Design note' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Design note' }));
    expect(screen.queryByRole('group', { name: 'Selected card actions' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Spec checklist' }));
    expect(screen.getByRole('group', { name: 'Selected card actions' })).toHaveTextContent('2 selected');
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    const actions = within(card.parentElement!);
    fireEvent.click(actions.getByRole('button', { name: 'Move Design note to collection' }));
    fireEvent.click(actions.getByRole('button', { name: 'Research' }));
    await waitFor(async () => {
      const storedCard = (await readCards()).find(item => item.title === 'Design note')!;
      const research = (await cardDb.collections.toArray()).find(item => item.name === 'Research')!;
      expect(research.cardIds).toContain(storedCard.id);
      const inbox = (await cardDb.collections.toArray()).find(item => item.name === 'Inbox')!;
      expect(inbox.cardIds).not.toContain(storedCard.id);
    });
    expect(screen.queryByRole('dialog', { name: 'Card details' })).not.toBeInTheDocument();
  });

  it('deletes from card options only after confirmation and removes collection references', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    const card = await screen.findByRole('article', { name: 'Open Design note' });
    const actions = within(card.parentElement!);
    fireEvent.click(actions.getByRole('button', { name: 'Move Design note to collection' }));
    fireEvent.click(within(card.parentElement!).getByRole('button', { name: 'Delete permanently' }));
    expect(card).toBeInTheDocument();
    confirm.mockReturnValue(true);
    const id = (await readCards()).find(item => item.title === 'Design note')!.id;
    fireEvent.click(within(card.parentElement!).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Open Design note' })).not.toBeInTheDocument());
    expect((await readCards()).some(item => item.id === id)).toBe(false);
    expect((await cardDb.collections.toArray()).some(item => item.cardIds.includes(id))).toBe(false);
    confirm.mockRestore();
  });
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
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Account menu' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Open collections' }).querySelector('img[src="/icons/home-collections.png"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas' }).querySelector('img[src="/icons/home-canvas.png"]')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveTextContent('P');
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(within(screen.getByRole('dialog', { name: 'Account menu' })).getByText('@paulo')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Profile name' })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Account menu' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Account menu' }).querySelector('img')).toBeInTheDocument();
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
    const created = (await readCards()).find(card => card.title === 'Quick capture')!;
    expect((await cardDb.collections.toArray()).find(collection => collection.name === 'Inbox')?.cardIds).toContain(created.id);
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
    expect(screen.getByRole('button', { name: 'Open collections' }).querySelector('img[src="/icons/home-collections.png"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas' }).querySelector('img[src="/icons/home-canvas.png"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collections' }));
    expect(screen.queryByRole('navigation', { name: 'Filter by media type' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create a collection' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New collection name' }), { target: { value: 'First collection' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    await waitFor(async () => expect((await cardDb.collections.toArray()).some(collection => collection.name === 'First collection')).toBe(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose collection' })).toHaveTextContent('First collection'));
  });

  it('customizes only the identity card from Settings and keeps the account menu card read-only', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    fireEvent.change(screen.getByLabelText('Profile card color'), { target: { value: '#506bbb' } });
    fireEvent.change(screen.getByLabelText('Profile tag'), { target: { value: 'paulo' } });
    await waitFor(() => expect(localStorage.getItem('duckler-profile-card-color')).toBe('#506bbb'));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    const preview = screen.getByRole('dialog', { name: 'Account menu' });
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
