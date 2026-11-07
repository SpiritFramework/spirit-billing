import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './atmosphere.css';
import './client-home.css';
import './client-profile.css';
import './client-services.css';
import './client-service-detail.css';
import './client-invoices.css';
import './client-invoice-detail.css';
import './client-tickets.css';
import './client-ticket-detail.css';
import './client-game-hosting.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
