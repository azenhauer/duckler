import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { cardDb, readCards } from './lib/cardDb';
import { createCardFromInput, createCollectionFromInput } from '@visual-library/shared';
import { clearNotices } from './components/Notifications';

beforeEach(async () => {
  clearNotices();
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
  it('renders saved text everywhere as text, never as HTML or a script (XSS sweep)', async () => {
    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    await cardDb.cards.clear();
    await cardDb.collections.clear();
    const card = createCardFromInput({ type: 'bookmark', title: `T ${payload}`, note: `N ${payload}`, caption: payload, sourceUrl: 'javascript:alert(1)', tags: ['<marquee>x</marquee>'] });
    await cardDb.cards.put(card);
    await cardDb.collections.put({ ...createCollectionFromInput({ name: `C ${payload}`, cardIds: [card.id] }), description: `D ${payload}` });
    localStorage.setItem('visual-library-profile-name', `P ${payload}`);
    localStorage.setItem('duckler-profile-bio', `B ${payload}`);
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open collections' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Open collection C / }));
    await screen.findByText(`T ${payload}`, { exact: false });
    fireEvent.doubleClick(screen.getByRole('article', { name: /^Open T / }));
    await screen.findByRole('dialog', {}, { timeout: 5000 }); // the editor chunk loads on first use
    const everything = document.body;
    expect(everything.querySelector('img[src="x"], script, marquee')).toBeNull();
    expect(everything.querySelector('a[href^="javascript:" i], [src^="javascript:" i]')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    expect(container.textContent).toContain(`T ${payload}`);
  });

  it('deletes selected or keyboard-focused cards with Delete, but protects typing and dialogs', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    const card = await screen.findByRole('article', { name: 'Open Design note' });
    fireEvent.click(card);
    fireEvent.keyDown(screen.getByPlaceholderText('Search all notes'), { key: 'Delete' }); // typing: ignored
    fireEvent.doubleClick(card);
    const close = await screen.findByRole('button', { name: 'Close details' }, { timeout: 8000 }); // the editor chunk loads on first use
    fireEvent.keyDown(document, { key: 'Delete' }); // a dialog is open: ignored
    expect(card).toBeInTheDocument();
    fireEvent.click(close);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(card, { key: 'Delete' });
    await waitFor(() => expect(card).not.toBeInTheDocument());
    expect((await readCards()).some(item => item.title === 'Design note')).toBe(false);
  }, 15000);
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
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update cardTry again.");
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
    fireEvent.pointerEnter((await screen.findByRole('article', { name: 'Open Design note' })).parentElement!); // makes the action bar
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Design note' }));
    const dialog = screen.getByRole('dialog', { name: 'Card details' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Note' }), { target: { value: 'Revised note' } });
    expect((await readCards()).find(card => card.title === 'Design note')?.note).toBe('A design observation');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Research' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Card details' })).not.toBeInTheDocument());
    const card = (await readCards()).find(card => card.title === 'Design note')!;
    expect(card.note).toBe('Revised note');
    expect((await cardDb.collections.toArray()).find(collection => collection.name === 'Research')?.cardIds).toContain(card.id);
  });
  it('selects cards by clicking them, shows the commands, clears with Escape and edits on double click', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    const design = await screen.findByRole('article', { name: 'Open Design note' });
    const spec = screen.getByRole('article', { name: 'Open Spec checklist' });
    fireEvent.click(design);
    expect(design).toHaveClass('is-checked');
    expect(screen.queryByRole('dialog', { name: 'Card details' })).not.toBeInTheDocument();
    fireEvent.click(spec);
    expect(screen.getByRole('group', { name: 'Selected card actions' })).toHaveTextContent('2 selected');
    fireEvent.click(spec);
    expect(design).toHaveClass('is-checked');
    expect(spec).not.toHaveClass('is-checked');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(design).not.toHaveClass('is-checked');
    expect(document.querySelector('.selection-hint')).toBeNull();
    fireEvent.doubleClick(design);
    expect(screen.getByRole('dialog', { name: 'Card details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close details' })).toHaveClass('b-button');
  });
  it('manages collections for every selected card from one picker, with partial memberships shown', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    await screen.findByRole('article', { name: 'Open Design note' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Design note' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Spec checklist' }));
    const strip = screen.getByRole('group', { name: 'Selected card actions' });
    fireEvent.click(within(strip).getByRole('button', { name: /Collections/ }));
    const picker = screen.getByRole('dialog', { name: 'Collections for the selected cards' });
    expect(within(picker).getByRole('checkbox', { name: 'Inbox' })).toBeChecked(); // both cards are in Inbox
    const research = within(picker).getByRole('checkbox', { name: 'Research' }) as HTMLInputElement;
    expect(research.indeterminate).toBe(true); // only Spec checklist is
    fireEvent.click(research);
    await waitFor(async () => expect((await cardDb.collections.toArray()).find(item => item.name === 'Research')?.cardIds).toHaveLength(2));
    expect(screen.getByRole('group', { name: 'Selected card actions' })).toHaveTextContent('2 selected'); // the selection stays
    fireEvent.click(within(picker).getByRole('button', { name: '+ Create new collection' }));
    fireEvent.change(within(picker).getByRole('textbox', { name: 'New collection name' }), { target: { value: 'Both' } });
    fireEvent.click(within(picker).getByRole('button', { name: 'Create' }));
    await waitFor(async () => expect((await cardDb.collections.toArray()).find(item => item.name === 'Both')?.cardIds).toHaveLength(2));
  });

  it('shows one selection strip and saves membership from card options', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    const card = await screen.findByRole('article', { name: 'Open Design note' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Design note' }));
    expect(screen.getByRole('group', { name: 'Selected card actions' })).toHaveTextContent('1 selected');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Spec checklist' }));
    expect(screen.getByRole('group', { name: 'Selected card actions' })).toHaveTextContent('2 selected');
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    fireEvent.pointerEnter(card.parentElement!); // the action bar is made on first hover
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

  it('adds dropped text, links and pictures to the card being edited, saved with Save', async () => {
    const transfer = (data: Record<string, string>, files: File[] = []) => ({
      types: [...(files.length ? ['Files'] : []), ...Object.keys(data)], files, getData: (type: string) => data[type] ?? '', dropEffect: 'none',
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    fireEvent.doubleClick(await screen.findByRole('article', { name: 'Open Design note' }));
    const editor = await screen.findByRole('dialog', { name: 'Card details' }, { timeout: 8000 });
    const sheet = editor.querySelector('form')!;
    fireEvent.drop(sheet, { dataTransfer: transfer({ 'text/plain': 'A dropped quote' }) });
    fireEvent.drop(sheet, { dataTransfer: transfer({ 'text/uri-list': 'https://example.com/ref', 'text/plain': 'https://example.com/ref' }) });
    await waitFor(() => expect(within(editor).getByLabelText('Note')).toHaveValue('A design observation\nA dropped quote\nhttps://example.com/ref'));

    fireEvent.drop(sheet, { dataTransfer: transfer({}, [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })]) });
    expect(await within(editor).findByText(/Only PNG, JPEG/)).toBeInTheDocument();
    fireEvent.drop(sheet, { dataTransfer: transfer({}, [new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })]) });
    expect(await within(editor).findByRole('img', { name: 'Design note' })).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/));
    expect((await readCards()).find(card => card.title === 'Design note')?.type).toBe('text'); // nothing saved yet

    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const saved = (await readCards()).find(card => card.title === 'Design note')!;
      expect(saved.type).toBe('image');
      expect(saved.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(saved.note).toContain('A dropped quote');
    });
  });

  it('stars cards into a Favorites area, from the toolbar or with F', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    const design = await screen.findByRole('article', { name: 'Open Design note' });
    fireEvent.pointerEnter(design.parentElement!); // the action bar is made on first hover
    fireEvent.click(within(design.parentElement!).getByRole('button', { name: 'Add Design note to favorites' }));
    await waitFor(async () => expect((await readCards()).find(card => card.title === 'Design note')?.favorite).toBe(true));
    expect(within(design).getByLabelText('Favorite')).toBeInTheDocument();

    // Home shows the area; it lists only starred cards.
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Favorites' }));
    expect(await screen.findByRole('article', { name: 'Open Design note' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Open Spec checklist' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search favorites')).toBeInTheDocument();

    // F unstars the selected card; the area is then empty.
    fireEvent.click(screen.getByRole('article', { name: 'Open Design note' }));
    fireEvent.keyDown(document.body, { key: 'f' });
    expect(await screen.findByRole('heading', { name: 'No favorites yet' })).toBeInTheDocument();
    await waitFor(async () => expect((await readCards()).find(card => card.title === 'Design note')?.favorite).toBeUndefined());

    // Collections lists Favorites next to All cards.
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open collections' }));
    expect(await screen.findByRole('button', { name: 'Open Favorites' })).toBeInTheDocument();
  });

  it('lists recently used collections first in the picker', async () => {
    const research = (await cardDb.collections.toArray()).find(item => item.name === 'Research')!;
    localStorage.setItem('duckler-recent-collections', JSON.stringify([research.id]));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    const card = await screen.findByRole('article', { name: 'Open Design note' });
    fireEvent.click(within(card.parentElement!).getByRole('button', { name: 'Collection Inbox' }));
    const picker = screen.getByRole('dialog', { name: 'Collections for this card' });
    const rows = picker.querySelectorAll('.collection-picker-row');
    expect(rows[0]).toHaveTextContent('Research');
    expect(rows[0]).toHaveAttribute('data-heading', 'Recent');
    expect(rows[1]).toHaveAttribute('data-heading', 'All collections');
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Inbox' })); // unticking is not "using"
    expect(JSON.parse(localStorage.getItem('duckler-recent-collections')!)).toEqual([research.id]);
  });

  it('has keyboard shortcuts that stay out of the way while typing', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    await screen.findByRole('article', { name: 'Open Design note' });
    fireEvent.keyDown(document.body, { key: '/' });
    const search = screen.getByPlaceholderText('Search all notes');
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'n' }); // typing in search: not a shortcut
    expect(screen.queryByRole('dialog', { name: 'Add card' })).not.toBeInTheDocument();
    search.blur();
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    expect(screen.getByRole('group', { name: 'Selected card actions' })).toHaveTextContent('2 selected');
    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveTextContent('New note');
    fireEvent.click(screen.getByRole('button', { name: 'Close keyboard shortcuts' }));
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(screen.getByRole('dialog', { name: 'Add card' })).toBeInTheDocument();
  });

  it('deletes at once and offers Undo, which brings the card back into its collections', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    const card = await screen.findByRole('article', { name: 'Open Design note' });
    const id = (await readCards()).find(item => item.title === 'Design note')!.id;
    fireEvent.pointerEnter(card.parentElement!); // the action bar is made on first hover
    fireEvent.click(within(card.parentElement!).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Open Design note' })).not.toBeInTheDocument());
    expect(confirm).not.toHaveBeenCalled();
    expect((await readCards()).some(item => item.id === id)).toBe(false);
    expect((await cardDb.collections.toArray()).some(item => item.cardIds.includes(id))).toBe(false);
    expect(await cardDb.tombstones.get(id)).toBeDefined();

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('article', { name: 'Open Design note' })).toBeInTheDocument();
    await waitFor(async () => expect((await cardDb.collections.toArray()).find(item => item.name === 'Inbox')?.cardIds).toContain(id));
    expect(await cardDb.tombstones.get(id)).toBeUndefined(); // sync must not delete it again
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
    expect(screen.getByRole('button', { name: 'Open collections' }).querySelector('img[src="/icons/home-collections.webp"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas' }).querySelector('img[src="/icons/home-canvas.webp"]')).toBeInTheDocument();
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

  it('connects two cards from the connect button and shows them as a dialogue', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notes' }));
    fireEvent.pointerEnter((await screen.findByRole('article', { name: 'Open Design note' })).parentElement!); // makes the action bar
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Design note' }));
    expect(document.querySelector('.connect-hint')).toHaveTextContent('Pick a card to connect with “Design note”');
    fireEvent.click(screen.getByRole('article', { name: 'Open Spec checklist' }));
    await waitFor(async () => expect((await readCards()).find(card => card.title === 'Design note')?.links?.length).toBe(1));
    expect(await screen.findAllByText('⇄ 1')).toHaveLength(2);
    fireEvent.doubleClick(screen.getByRole('article', { name: 'Open Design note' }));
    const dialogue = screen.getByRole('region', { name: 'Connected cards' });
    expect(within(dialogue).getByRole('button', { name: 'Open connected Spec checklist' })).toBeInTheDocument();
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Disconnect Spec checklist' }));
    await waitFor(async () => expect((await readCards()).find(card => card.title === 'Spec checklist')?.links).toEqual([]));
  });

  it('renames a collection from its right-click menu', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'All notes' });
    fireEvent.click(screen.getByRole('button', { name: 'Open collections' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Open collection Research' }));
    const menu = screen.getByRole('menu', { name: 'Research options' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Rename' }));
    const field = screen.getByRole('textbox', { name: 'New name for Research' });
    fireEvent.change(field, { target: { value: 'Field notes' } });
    fireEvent.submit(field.closest('form')!);
    await waitFor(async () => expect((await cardDb.collections.toArray()).map(item => item.name)).toContain('Field notes'));
    expect(screen.getByRole('button', { name: 'Open collection Field notes' })).toBeInTheDocument();
  });

  it('renames a canvas from its right-click menu and cancels a subsequent edit with Escape', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'All notes' });
    fireEvent.click(screen.getByRole('button', { name: 'Open canvas' }));
    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Open canvas Research' }));
    fireEvent.click(within(screen.getByRole('menu', { name: 'Research options' })).getByRole('menuitem', { name: 'Rename' }));
    const field = screen.getByRole('textbox', { name: 'New name for Research' });
    fireEvent.change(field, { target: { value: 'Reference board' } });
    fireEvent.submit(field.closest('form')!);
    await waitFor(async () => expect((await cardDb.collections.toArray()).map(item => item.name)).toContain('Reference board'));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Open canvas Reference board' }));
    fireEvent.click(within(screen.getByRole('menu', { name: 'Reference board options' })).getByRole('menuitem', { name: 'Rename' }));
    const cancelled = screen.getByRole('textbox', { name: 'New name for Reference board' });
    fireEvent.change(cancelled, { target: { value: 'Discard this name' } });
    fireEvent.keyDown(cancelled, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'New name for Reference board' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect((await cardDb.collections.toArray()).map(item => item.name)).toContain('Reference board');
  });

  it('goes back from a collection to Collections and then Home', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'All notes' });
    fireEvent.click(screen.getByRole('button', { name: 'Open collections' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open collection Inbox' }));
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(await screen.findByRole('heading', { name: 'Collections' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(await screen.findByRole('button', { name: 'Open collections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('button')).toHaveLength(4);
  });

  it('Esc works as the Back button, but only when nothing smaller wants it', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'All notes' });
    fireEvent.click(screen.getByRole('button', { name: 'Open collections' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open collection Inbox' }));
    // Typing in a field: Esc belongs to the field.
    const search = screen.getByRole('textbox', { name: 'Search' });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    // An open dialog closes first, and the page stays.
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(await screen.findByRole('heading', { name: 'Collections' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'Open collections' })).toBeInTheDocument();
  });

  it('crops a large profile photo to a small square, stores it locally and supports removing it', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:profile');
    URL.revokeObjectURL = vi.fn();
    const drawImage = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), translate: vi.fn(), scale: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,cropped');
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
      // Well over the old 1 MB limit: the cropper makes it small.
      const big = new File([new Uint8Array(3 * 1024 * 1024)], 'profile.png', { type: 'image/png' });
      fireEvent.change(screen.getByLabelText('Choose profile photo'), { target: { files: [big] } });
      const cropper = await screen.findByRole('dialog', { name: 'Crop profile photo' });
      const photo = cropper.querySelector('img')!;
      Object.defineProperties(photo, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
      fireEvent.load(photo);
      fireEvent.change(within(cropper).getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } });
      fireEvent.click(within(cropper).getByRole('button', { name: 'Use photo' }));

      expect(localStorage.getItem('visual-library-profile-photo')).toBe('data:image/jpeg;base64,cropped');
      expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.88);
      expect(drawImage).toHaveBeenCalledWith(photo, -360, -240, 720, 480); // 1200×800 covering 240 px, zoomed ×2
      expect(screen.queryByRole('dialog', { name: 'Crop profile photo' })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Account menu' }).querySelector('img')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
      expect(localStorage.getItem('visual-library-profile-photo')).toBeNull();
    } finally { getContext.mockRestore(); toDataURL.mockRestore(); }
  });

  it('Escape closes only the photo cropper, not Settings underneath', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:profile');
    URL.revokeObjectURL = vi.fn();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    fireEvent.change(screen.getByLabelText('Choose profile photo'), { target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] } });
    await screen.findByRole('dialog', { name: 'Crop profile photo' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Crop profile photo' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(localStorage.getItem('visual-library-profile-photo')).toBeNull();
  });

  it('renames the profile by clicking the name on the profile card', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    const settings = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(settings).getByRole('button', { name: 'Rename profile My Library' }));
    const input = within(settings).getByRole('textbox', { name: 'Rename profile' });
    fireEvent.change(input, { target: { value: 'Duck notes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(within(settings).getByRole('button', { name: 'Rename profile Duck notes' })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('visual-library-profile-name')).toBe('Duck notes'));
    // Escape puts the previous name back and leaves Settings open.
    fireEvent.click(within(settings).getByRole('button', { name: 'Rename profile Duck notes' }));
    fireEvent.change(within(settings).getByRole('textbox', { name: 'Rename profile' }), { target: { value: 'Oops' } });
    fireEvent.keyDown(within(settings).getByRole('textbox', { name: 'Rename profile' }), { key: 'Escape' });
    expect(within(settings).getByRole('button', { name: 'Rename profile Duck notes' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  it('asks before adding a shared item from the address, and cleans the URL', async () => {
    const shareId = `pages-share-${Date.now()}`;
    window.history.replaceState({}, '', `/?sharedId=${shareId}&sharedTitle=Cloudflare+share&sharedText=Saved+from+share&sharedUrl=https%3A%2F%2Fexample.com%2Fshare`);

    render(<App />);

    // Any website can link to this address, so nothing is saved until the person agrees.
    const dialog = await screen.findByRole('dialog', { name: 'Add shared items' });
    expect(window.location.search).toBe('');
    expect(within(dialog).getByText('Cloudflare share')).toBeInTheDocument();
    expect((await readCards()).some((card) => card.id === shareId)).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to library' }));
    await waitFor(async () => {
      expect((await readCards()).some((card) => card.id === shareId && card.sourceUrl === 'https://example.com/share')).toBe(true);
    });
    expect(await screen.findByRole('article', { name: 'Open Cloudflare share' })).toBeInTheDocument();
  });

  it('discards a shared item when the person says no', async () => {
    const shareId = `pages-share-no-${Date.now()}`;
    window.history.replaceState({}, '', `/?sharedId=${shareId}&sharedTitle=Unwanted&sharedUrl=https%3A%2F%2Fexample.com%2Fspam`);
    render(<App />);
    const dialog = await screen.findByRole('dialog', { name: 'Add shared items' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add shared items' })).not.toBeInTheDocument());
    expect((await readCards()).some((card) => card.id === shareId)).toBe(false);
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

  it('runs a right-click menu item even though pressing it is a pointerdown inside the menu', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'));
    fireEvent.contextMenu(screen.getByRole('main'), { clientX: 200, clientY: 200 });
    const note = within(screen.getByRole('menu', { name: 'Quick add' })).getByRole('menuitem', { name: 'Note' });
    fireEvent.pointerDown(note);
    fireEvent.click(note);
    expect(await screen.findByRole('dialog', { name: 'Add card' })).toBeInTheDocument();
  });

  it('opens the file picker from right-click Upload while the + menu is closed', async () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    try {
      render(<App />);
      await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'));
      fireEvent.contextMenu(screen.getByRole('main'), { clientX: 200, clientY: 200 });
      fireEvent.click(within(screen.getByRole('menu', { name: 'Quick add' })).getByRole('menuitem', { name: 'Upload' }));
      expect(pick).toHaveBeenCalledTimes(1);
      expect((pick.mock.contexts[0] as HTMLInputElement).type).toBe('file');
    } finally { pick.mockRestore(); }
  });

  it('saves a note with Enter, naming it after its first words, and keeps Shift+Enter for new lines', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'));
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    const body = screen.getByLabelText('Note');
    fireEvent.change(body, { target: { value: 'Call the framer about the poster' } });
    fireEvent.keyDown(body, { key: 'Enter', shiftKey: true });
    expect(screen.getByRole('dialog', { name: 'Add card' })).toBeInTheDocument();
    fireEvent.keyDown(body, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add card' })).not.toBeInTheDocument());
    expect((await readCards()).some(card => card.title === 'Call the framer about the poster')).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // saving does not reopen the card in the editor
  });

  it('does not ask a paired browser to connect again from an empty library', async () => {
    await cardDb.collections.put(createCollectionFromInput({ name: 'Empty shelf', cardIds: [] }));
    const bridge = await import('./lib/extensionBridge');
    const paired = vi.spyOn(bridge, 'getExtensionConnection').mockReturnValue({} as ReturnType<typeof bridge.getExtensionConnection>);
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole('button', { name: 'Open collections' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Open collection Empty shelf' }));
      expect(await screen.findByRole('button', { name: 'New note' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Connect your browser' })).not.toBeInTheDocument();
    } finally { paired.mockRestore(); }
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
    expect(screen.getByRole('button', { name: 'Open collections' }).querySelector('img[src="/icons/home-collections.webp"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas' }).querySelector('img[src="/icons/home-canvas.webp"]')).toBeInTheDocument();
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
    expect(await screen.findByRole('button', { name: 'Open canvas' })).toBeInTheDocument();
  });
});
