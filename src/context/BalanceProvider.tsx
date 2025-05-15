'use client';

import React, { createContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import { useTokenData } from '@/hooks/useTokenData';
import { TokenBalance, TokenPrices } from '@/lib/types';

import { useCountUp } from '@/hooks/useCountUp';

interface BalanceContextProps {
  tokenPrices: TokenPrices | null;
  solBalance: number | null;
  tokenBalances: TokenBalance[];
  totalBalance: number;
  loading: boolean;
  refetchBalances: () => void;
}

export const BalanceContext = createContext<BalanceContextProps | undefined>(undefined);

export const BalanceProvider: React.FC<{ children: ReactNode; initialPrices: TokenPrices }> = ({ children, initialPrices }) => {
  const { publicKey } = useWallet();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [tokenPrices] = useState<TokenPrices>(initialPrices);
  const [targetBalance, setTargetBalance] = useState<number>(0);
  const totalBalance = useCountUp(targetBalance, 1000, true);
  const [loading, setLoading] = useState(true);
  const tokens = useTokenData();

  const fetchBalances = useCallback(async () => {
    if (!publicKey || tokens.length === 0) return;

    const connection = new Connection(`https://solana-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`, 'confirmed');

    try {
      const balanceLamports = await connection.getBalance(publicKey);
      const solBalanceValue = balanceLamports / LAMPORTS_PER_SOL;
      const solBalanceInUSD = solBalanceValue * (tokenPrices.SOL || 0);
      
      console.log('SOL Price:', tokenPrices.SOL);
      console.log('SOL Balance:', solBalanceValue);
      console.log('SOL Value in USD:', solBalanceInUSD);
      
      setSolBalance(parseFloat(solBalanceValue.toFixed(5)));

      const response = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      console.log(`Found ${response.value.length} token accounts`);

      const fetchedTokens = response.value.map((tokenAccountInfo) => {
        const accountData = tokenAccountInfo.account.data.parsed.info;
        const mintAddress = accountData.mint;
        const tokenBalance = accountData.tokenAmount.uiAmount;
        
        // Skip tokens with zero balance
        if (tokenBalance === 0) return null;

        const tokenInfo = tokens.find((t) => t.address === mintAddress);
        if (tokenInfo) {
          const symbol = tokenInfo.symbol;
          console.log(`Found token: ${symbol}, balance: ${tokenBalance}`);
          
          // Use the price from tokenPrices or default to 0
          const price = tokenPrices[symbol as keyof TokenPrices] || 0;
          
          return {
            tokenSymbol: symbol,
            tokenBalance: parseFloat(tokenBalance.toFixed(5)),
            tokenLogoURI: "",
            tokenMint: mintAddress
          };
        }
        
        // For unknown tokens, use the mint address as identifier
        console.log(`Unknown token mint: ${mintAddress}, balance: ${tokenBalance}`);
        return {
          tokenSymbol: mintAddress.slice(0, 6) + '...',
          tokenBalance: parseFloat(tokenBalance.toFixed(5)),
          tokenLogoURI: "",
          tokenMint: mintAddress
        };
      });

      const validTokenBalances = fetchedTokens.filter(Boolean) as TokenBalance[];
      console.log(`Valid token balances: ${validTokenBalances.length}`);
      setTokenBalances(validTokenBalances);

      const tokenValuesInUSD = validTokenBalances.reduce((acc, token) => {
        const price = tokenPrices[token.tokenSymbol as keyof TokenPrices] || 0;
        const tokenValueInUSD = token.tokenBalance * price;
        console.log(`${token.tokenSymbol} Value in USD:`, tokenValueInUSD);
        return acc + tokenValueInUSD;
      }, 0);

      // Round to 2 decimal places for consistency with the card display
      const totalBalanceInUSD = parseFloat((solBalanceInUSD + tokenValuesInUSD).toFixed(2));
      console.log('Total Balance:', totalBalanceInUSD);
      setTargetBalance(totalBalanceInUSD);
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setLoading(false);
    }
  }, [publicKey, tokens, tokenPrices]);

  const refetchBalances = async () => {
    setLoading(true);
    await fetchBalances();
    setLoading(false);
  };

  useEffect(() => {
    if (publicKey && tokens.length > 0) {
      fetchBalances();
    }
  }, [publicKey, tokens, tokenPrices, fetchBalances]);

  return <BalanceContext.Provider value={{ tokenPrices, solBalance, tokenBalances, totalBalance, loading, refetchBalances }}>{children}</BalanceContext.Provider>;
};