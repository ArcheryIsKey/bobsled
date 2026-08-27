import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SolanaWalletProvider } from './components/WalletProvider.tsx';
import { RootErrorBoundary } from './components/common/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <SolanaWalletProvider>
        <App />
      </SolanaWalletProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
