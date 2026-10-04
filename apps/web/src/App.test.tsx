import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { readCards } from './lib/cardDb';

describe('App', () => {
  it('renders the library shell, collections, and starter card metadata', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /library/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose collection' })).toBeInTheDocument();
    expect(screen.getAllByText('Spec checklist').length).toBeGreaterThan(0);
    expect(screen.getByText(/Track the milestone/i)).toBeInTheDocument();
  });

  it('opens card details from the keyboard and keeps the library header minimal', () => {
    render(<App />);

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

  it('shows collection previews and opens a collection in the library', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^Collections$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open collection Inbox' }));

    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getAllByText('Spec checklist').length).toBeGreaterThan(0);
  });

  it('returns to the all-cards home view when the Duckler logo is clicked', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^Collections$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open collection Inbox' }));
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duckler home' }));

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose collection' })).toHaveTextContent('All cards');
  });

  it('opens a local profile and saves the display name', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), { target: { value: 'Paulo' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Profile tag' }), { target: { value: '@paulo' } });

    await waitFor(() => expect(localStorage.getItem('visual-library-profile-name')).toBe('Paulo'));
    await waitFor(() => expect(localStorage.getItem('visual-library-profile-tag')).toBe('paulo'));
    expect(screen.getByRole('button', { name: 'Open profile' })).toHaveTextContent('P');
    expect(screen.getByText('@paulo')).toBeInTheDocument();
  });

  it('stores an uploaded profile photo locally and supports removing it', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
    fireEvent.change(screen.getByLabelText('Choose profile photo'), {
      target: { files: [new File(['profile-image'], 'profile.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(localStorage.getItem('visual-library-profile-photo')).toMatch(/^data:image\/png;base64,/));
    expect(screen.getByRole('button', { name: 'Open profile' }).querySelector('img')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(localStorage.getItem('visual-library-profile-photo')).toBeNull();
  });

  it('imports Cloudflare share fallback data into IndexedDB and cleans the URL', async () => {
    const shareId = `pages-share-${Date.now()}`;
    window.history.replaceState({}, '', `/?sharedId=${shareId}&sharedTitle=Cloudflare+share&sharedText=Saved+from+share&sharedUrl=https%3A%2F%2Fexample.com%2Fshare`);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Cloudflare share' })).toBeInTheDocument();
    await waitFor(async () => {
      expect((await readCards()).some((card) => card.id === shareId && card.sourceUrl === 'https://example.com/share')).toBe(true);
    });
    expect(window.location.search).toBe('');
    expect(screen.getByRole('status')).toHaveTextContent('Imported 1 shared item');
  });

  it('creates a card from the writing-focused composer', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    const composer = within(screen.getByRole('dialog', { name: 'Add card' }));
    fireEvent.click(composer.getByRole('button', { name: /Collections/ }));
    fireEvent.click(composer.getByRole('checkbox', { name: 'Inbox' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Quick capture' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Saved from the composer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Quick capture' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Inbox' }).some((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add card' })).not.toBeInTheDocument());
  });
});
