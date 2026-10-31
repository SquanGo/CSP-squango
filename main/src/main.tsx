import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import { installModalStackGlobalListeners } from './app/modal';
import { installAppBoot } from './app/boot';
import { installFocusRingTracking } from './app/focusRing';
import { installCustomDropdowns } from './app/customDropdowns';

installModalStackGlobalListeners();
installAppBoot();
installFocusRingTracking();
installCustomDropdowns();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .then((registration) => {
        console.log('[SW] Registered service worker:', registration);
      })
      .catch((error) => {
        console.error('[SW] Service worker registration failed:', error);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
