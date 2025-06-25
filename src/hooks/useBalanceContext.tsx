// src/hooks/useBalanceContext.tsx
import { useContext } from 'react';
import { BalanceContext } from '@/context/BalanceProvider';

export const useBalanceContext = () => {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error('useBalanceContext must be used within a BalanceProvider');
  }
  return context;
};