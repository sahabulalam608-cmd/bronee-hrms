import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { NumberingProvider } from './components/ui/list-numbering';
import { applyViewMode, readViewMode } from './lib/view-mode';
import './index.css';

// Keep the layout viewport and the stylesheet in step with the saved choice.
applyViewMode(readViewMode());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <NumberingProvider>
        <App />
      </NumberingProvider>
    </BrowserRouter>
  </StrictMode>,
);
