import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SOLANA_RPC_URL } from '../constants';
import '@solana/wallet-adapter-react-ui/styles.css';

interface Props {
 children: ReactNode;
}

export const SolanaWalletProvider: FC<Props> = ({ children }) => {
 const endpoint = useMemo(() => {
 return (
 (import.meta as any).env?.VITE_SOLANA_RPC_URL ||
 SOLANA_RPC_URL
 );
 }, []);

 const wallets = useMemo(() => [], []);

 return (
 <ConnectionProvider
 endpoint={endpoint}
 config={{
 commitment: 'confirmed',
 }}
 >
 <WalletProvider wallets={wallets} autoConnect>
 <WalletModalProvider>{children}</WalletModalProvider>
 </WalletProvider>
 </ConnectionProvider>
 );
};
