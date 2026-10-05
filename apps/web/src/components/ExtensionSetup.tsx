import { BButton } from './BButton';
import { useState } from 'react';
import { acceptExtensionConnection, getLibraryInvitation } from '../lib/extensionBridge';
import { Dialog } from './Dialog';

export function ExtensionSetup({ onClose, onConnected, connectionStatus = '' }: { onClose: () => void; onConnected: () => void; connectionStatus?: string }) {
  const [invitation] = useState(() => JSON.stringify(getLibraryInvitation()));
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  return <Dialog label="Connect your browser" className="extension-setup" onClose={onClose}>
      <BButton className="close-detail" label="Close extension setup" onClick={onClose} />
      <h2 id="extension-title">Connect your browser</h2>
      {connectionStatus && <p role="status">{connectionStatus}</p>}
      <ol className="extension-steps">
        <li><strong>Load Duckler Capture</strong><p>In Chrome or Edge, open Extensions, enable Developer mode, and choose Load unpacked. Select the extension’s built folder.</p></li>
        <li><strong>Connect this library</strong><p>Open the extension’s Settings and paste this code. Confirm the connection there.</p>
          <textarea aria-label="Library setup code" readOnly value={invitation} onFocus={event => event.target.select()} />
          <button type="button" onClick={() => { void navigator.clipboard.writeText(invitation).then(() => setMessage('Setup code copied.'), () => setMessage('Select and copy the code above.')); }}>Copy setup code</button>
        </li>
        <li><label htmlFor="extension-confirmation"><strong>Paste the confirmation code</strong></label><textarea id="extension-confirmation" value={code} onChange={event => setCode(event.target.value)} placeholder="From the extension’s Settings" /></li>
      </ol>
      <p role="status">{message}</p>
      <button type="button" className="primary-button" disabled={!code.trim()} onClick={() => {
        try { acceptExtensionConnection(code); onConnected(); onClose(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection failed.'); }
      }}>Connect extension</button>
  </Dialog>;
}
