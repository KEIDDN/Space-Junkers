import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import '@fontsource/share-tech-mono';
import '@fontsource/vt323';
import '@fontsource/russo-one';
import './ui/styles.css';
import { useProfile } from './state/profileStore';

// Automated play tests reach the save through this (dev builds only).
if (import.meta.env.DEV) Object.assign(window, { __profile: useProfile });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
