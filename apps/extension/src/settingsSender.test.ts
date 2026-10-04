import { describe, expect, it } from 'vitest';
import { isSettingsSender } from './settingsSender';

const id = 'abcdefghijklmnopabcdefghijklmnop';
const optionsURL = `chrome-extension://${id}/options.html`;

describe('connection confirmation sender', () => {
  it('accepts the extension Settings page opened in a tab', () => {
    const sender = { id, url: optionsURL, tab: { id: 12 } };
    expect(isSettingsSender(sender, id, optionsURL)).toBe(true);
    expect(isSettingsSender({ id, url: `${optionsURL}?setup=1#connection` }, id, optionsURL)).toBe(true);
  });

  it('rejects content scripts, other extensions, and lookalike page paths', () => {
    for (const url of ['https://duckler.pages.dev/options.html', `${optionsURL}.fake`, `chrome-extension://${id}/popup.html`, 'invalid']) {
      expect(isSettingsSender({ id, url }, id, optionsURL)).toBe(false);
    }
    expect(isSettingsSender({ id: 'another-extension', url: optionsURL }, id, optionsURL)).toBe(false);
    expect(isSettingsSender({ id }, id, optionsURL)).toBe(false);
  });
});
