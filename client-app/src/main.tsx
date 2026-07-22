import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import App from './App';
import { ErrorBoundary } from './lib/ErrorBoundary';
import { installClientLogger } from './lib/logger';
import './index.css';

installClientLogger();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DndProvider backend={HTML5Backend}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </DndProvider>
    </BrowserRouter>
  </StrictMode>,
);
