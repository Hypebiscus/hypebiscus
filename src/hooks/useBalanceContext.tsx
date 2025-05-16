import { BalanceContext } from '@/context/BalanceProvider';
import { useContext } from 'react';

export const useBalanceContext = () => {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error('useBalanceContext must be used within a BalanceProvider');
  }
  return context;
};