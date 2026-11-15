import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { NumberingProvider } from './components/ui/list-numbering';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <NumberingProvider>
        <App />
      </NumberingProvider>
    </BrowserRouter>
  </StrictMode>,
);
