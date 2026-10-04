export function isSettingsSender(sender: Pick<chrome.runtime.MessageSender, 'id' | 'url'>, extensionId: string, optionsURL: string): boolean {
  if (sender.id !== extensionId || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    url.search = '';
    url.hash = '';
    return url.href === optionsURL;
  } catch { return false; }
}
