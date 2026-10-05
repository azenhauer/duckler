import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SharedCollectionPage } from './components/SharedCollectionPage';
import { SHARE_PATH } from './lib/shareLinks';
import './styles.css';
import './playstation.css';
import './schematic.css';
import './canvas-studio.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';

// duckler.pages.dev/s/<file id>#<key> opens a shared collection instead of the library.
const shared = window.location.pathname.match(SHARE_PATH);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {shared ? <SharedCollectionPage fileId={shared[1]} keyFragment={window.location.hash.slice(1)} /> : <App />}
  </React.StrictMode>,
);
