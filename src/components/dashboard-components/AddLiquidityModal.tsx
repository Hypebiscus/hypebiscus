import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Info, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useWallet } from '@solana/wallet-adapter-react';
import { useMeteoraDlmmService } from "@/lib/meteora/meteoraDlmmService";
import { useMeteoraPositionService } from "@/lib/meteora/meteoraPositionService";
import type { ExistingBinRange } from "@/lib/meteora/meteoraPositionService";
import { BN } from 'bn.js';
import { StrategyType } from '@meteora-ag/dlmm';
import { FormattedPool } from '@/lib/utils/poolUtils';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { toast } from 'sonner';

interface AddLiquidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: FormattedPool | null;
  userPortfolioStyle?: string | null;
}

interface BalanceInfo {
  solBalance: number;
  tokenBalance: number;
  hasEnoughSol: boolean;
  estimatedSolNeeded: number;
  shortfall?: number;
}

interface StrategyOption {
  id: string;
  label: string;
  description: string;
  binStep: number;
  estimatedCost: number;
  riskLevel: 'low' | 'medium' | 'high';
  portfolioStyle: string;
  isDefault?: boolean;
  strategy: 'oneSided' | 'balanced' | 'ranged';
}

// Define proper types for toast options
interface ToastOptions {
  duration?: number;
  style?: React.CSSProperties;
  className?: string;
  position?: 'top-center' | 'top-left' | 'top-right' | 'bottom-center' | 'bottom-left' | 'bottom-right';
}

// Cache for bin ranges to prevent repeated requests
const binRangesCache = new Map<string, { 
  data: ExistingBinRange[]; 
  timestamp: number; 
  activeBinId: number;
}>();
const CACHE_DURATION = 60000; // 1 minute cache

// Toast management to prevent overlapping
let lastToastId: string | number | null = null;
let toastTimeout: NodeJS.Timeout | null = null;

// FIXED: Timing constants for consistency
const TIMING_CONSTANTS = {
  TRANSACTION_CONFIRMATION_DELAY: 800,
  SUCCESS_TOAST_DURATION: 8000, // Standard 8 seconds for important success
  MODAL_CLOSE_DELAY: 8500, // Toast duration + buffer
  ERROR_TOAST_DURATION: 6000,
  WARNING_TOAST_DURATION: 4000,
  REGULAR_TOAST_DURATION: 2000,
  TOAST_BUFFER: 500
} as const;

// FIXED: Custom toast function following standard timing rules
const showCustomToast = {
  success: (title: string, description: string, options?: ToastOptions) => {
    const isImportantSuccess = title.includes('Position Created') || title.includes('Successfully');
    
    if (!isImportantSuccess) {
      // Only dismiss previous toast for rapid percentage updates
      if (lastToastId) {
        toast.dismiss(lastToastId);
      }
      
      // Clear any pending toast timeout
      if (toastTimeout) {
        clearTimeout(toastTimeout);
      }
    }
    
    // FIXED: Use standard timing rules
    const delay = isImportantSuccess ? 0 : 100;
    const duration = isImportantSuccess ? TIMING_CONSTANTS.SUCCESS_TOAST_DURATION : TIMING_CONSTANTS.REGULAR_TOAST_DURATION;
    
    const showToast = () => {
      lastToastId = toast.success(title, {
        description,
        duration,
        style: {
          backgroundColor: '#22c55e',
          color: '#ffffff',
          border: '1px solid #16a34a',
          borderRadius: '12px',
          fontSize: '14px',
          fontFamily: 'var(--font-sans)',
          boxShadow: '0 8px 32px rgba(34, 197, 94, 0.3)',
          zIndex: 9999,
          position: 'fixed',
        },
        className: 'custom-success-toast',
        position: 'top-center',
        ...options,
      });
    };
    
    if (delay > 0) {
      toastTimeout = setTimeout(showToast, delay);
    } else {
      showToast();
    }
  },
  error: (title: string, description: string, options?: ToastOptions) => {
    // Always show error toasts immediately
    if (lastToastId) {
      toast.dismiss(lastToastId);
    }
    
    lastToastId = toast.error(title, {
      description,
      duration: TIMING_CONSTANTS.ERROR_TOAST_DURATION,
      style: {
        backgroundColor: '#ef4444',
        color: '#ffffff',
        border: '1px solid #dc2626',
        borderRadius: '12px',
        fontSize: '14px',
        fontFamily: 'var(--font-sans)',
        boxShadow: '0 8px 32px rgba(239, 68, 68, 0.3)',
        zIndex: 9999,
        position: 'fixed',
      },
      className: 'custom-error-toast',
      position: 'top-center',
      ...options,
    });
  },
  warning: (title: string, description: string, options?: ToastOptions) => {
    // Always show warning toasts immediately
    if (lastToastId) {
      toast.dismiss(lastToastId);
    }
    
    lastToastId = toast.warning(title, {
      description,
      duration: TIMING_CONSTANTS.WARNING_TOAST_DURATION,
      style: {
        backgroundColor: '#f59e0b',
        color: '#ffffff',
        border: '1px solid #d97706',
        borderRadius: '12px',
        fontSize: '14px',
        fontFamily: 'var(--font-sans)',
        boxShadow: '0 8px 32px rgba(245, 158, 11, 0.3)',
        zIndex: 9999,
        position: 'fixed',
      },
      className: 'custom-warning-toast',
      position: 'top-center',
      ...options,
    });
  },
};

const AddLiquidityModal: React.FC<AddLiquidityModalProps> = ({ 
  isOpen, 
  onClose,
  pool,
  userPortfolioStyle = 'conservative'
}) => {
  const actualPortfolioStyle = userPortfolioStyle || 'conservative';
  const { publicKey, sendTransaction } = useWallet();
  const { service: dlmmService } = useMeteoraDlmmService();
  const { service: positionService } = useMeteoraPositionService();
  
  // State management
  const [btcAmount, setBtcAmount] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const [currentBinId, setCurrentBinId] = useState<number | null>(null);
  const [existingBinRanges, setExistingBinRanges] = useState<ExistingBinRange[]>([]);
  const [isLoadingBins, setIsLoadingBins] = useState(false);
  const [binRangesLoaded, setBinRangesLoaded] = useState(false);
  const [userTokenBalance, setUserTokenBalance] = useState<number>(0);
  
  // UI state
  const [showStrategyDetails, setShowStrategyDetails] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [showAccountBalance, setShowAccountBalance] = useState(false);
  const [showPoolInfo, setShowPoolInfo] = useState(false);

  // Refs to prevent multiple simultaneous requests
  const findingBinsRef = useRef(false);
  const poolAddressRef = useRef<string | null>(null);

  // State to track which percentage button was last clicked
  const [activePercentage, setActivePercentage] = useState<number | null>(null);
  const [isUpdatingAmount, setIsUpdatingAmount] = useState(false);

  // Get token names from pool
  const getTokenNames = () => {
    if (!pool) return { tokenX: 'zBTC', tokenY: 'SOL' };
    const [tokenX, tokenY] = pool.name.split('-');
    return { 
      tokenX: tokenX.replace('WBTC', 'wBTC'), 
      tokenY 
    };
  };

  const { tokenX } = getTokenNames();
  const poolBinStep = useMemo(() => {
    if (!pool || !pool.binStep || pool.binStep === 'N/A') return 10;
    return parseInt(pool.binStep);
  }, [pool]);

  // FIXED: Stable function with proper caching and request deduplication
  const findExistingBinRanges = useCallback(async (poolAddress: string) => {
    // Prevent multiple simultaneous calls for the same pool
    if (findingBinsRef.current || !poolAddress) {
      console.log('Skipping bin range request - already in progress or no pool address');
      return;
    }

    // Check cache first
    const cached = binRangesCache.get(poolAddress);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log('Using cached bin ranges for pool:', poolAddress.substring(0, 8));
      setExistingBinRanges(cached.data);
      setCurrentBinId(cached.activeBinId);
      setBinRangesLoaded(true);
      return;
    }

    findingBinsRef.current = true;
    setIsLoadingBins(true);
    setBinRangesLoaded(false);
    
    try {
      console.log('Fetching fresh bin ranges for pool:', poolAddress.substring(0, 8));
      
      const dlmmPool = await dlmmService.initializePool(poolAddress);
      const activeBin = await dlmmPool.getActiveBin();
      setCurrentBinId(activeBin.binId);
      
      // Use the position service to find existing bin ranges with portfolio style
      const existingRanges = await positionService.findExistingBinRanges(poolAddress, 20, actualPortfolioStyle);
      
      let finalRanges: ExistingBinRange[];
      
      if (existingRanges.length > 0) {
        finalRanges = existingRanges;
        console.log(`Found ${existingRanges.length} existing bin ranges`);
      } else {
        // Create a fallback range using the correct interface
        const fallbackRange: ExistingBinRange = {
          minBinId: activeBin.binId - 3,
          maxBinId: activeBin.binId + 3,
          existingBins: [activeBin.binId],
          liquidityDepth: 1,
          isPopular: false,
          description: 'Conservative range around current price (safe default)'
        };
        finalRanges = [fallbackRange];
        console.log('Using fallback range around active bin:', activeBin.binId);
      }
      
      setExistingBinRanges(finalRanges);
      setBinRangesLoaded(true);
      
      // Cache the results
      binRangesCache.set(poolAddress, {
        data: finalRanges,
        timestamp: now,
        activeBinId: activeBin.binId
      });
      
    } catch (error) {
      console.error('Error finding existing bins:', error);
      
      // Create fallback range if everything fails
      const fallbackRange: ExistingBinRange = {
        minBinId: currentBinId ? currentBinId - 5 : 0,
        maxBinId: currentBinId ? currentBinId + 5 : 10,
        existingBins: currentBinId ? [currentBinId] : [0],
        liquidityDepth: 1,
        isPopular: false,
        description: 'Default safe range (position rent only)'
      };
      setExistingBinRanges([fallbackRange]);
      setBinRangesLoaded(true);
    } finally {
      setIsLoadingBins(false);
      findingBinsRef.current = false;
    }
  }, [actualPortfolioStyle, dlmmService, positionService, currentBinId]);

  // FIXED: Load existing bins when modal opens with proper conditions
  useEffect(() => {
    if (isOpen && pool && pool.address !== poolAddressRef.current && !binRangesLoaded && !isLoadingBins) {
      poolAddressRef.current = pool.address;
      findExistingBinRanges(pool.address);
    }
  }, [isOpen, pool, binRangesLoaded, isLoadingBins, findExistingBinRanges]);

  // Reset state when modal closes or pool changes
  useEffect(() => {
    if (!isOpen) {
      setBinRangesLoaded(false);
      setExistingBinRanges([]);
      setCurrentBinId(null);
      setBalanceInfo(null);
      setValidationError('');
      setBtcAmount('');
      setSelectedStrategy('');
      setUserTokenBalance(0);
      setActivePercentage(null);
      setIsUpdatingAmount(false);
      poolAddressRef.current = null;
      findingBinsRef.current = false;
      
      // Clear any pending toast timeouts
      if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
      }
      // Dismiss any active toasts
      if (lastToastId) {
        toast.dismiss(lastToastId);
        lastToastId = null;
      }
    }
  }, [isOpen]);

  // Strategy options based on existing bins only
  const strategyOptions: StrategyOption[] = useMemo(() => {
    if (existingBinRanges.length === 0) return [];
    
    const riskLevel = poolBinStep <= 5 ? 'high' : poolBinStep <= 15 ? 'medium' : 'low';
    const styleInfo = { icon: '🛡️', label: 'Conservative', color: 'text-green-400' };
    
    // Fixed cost since we're using existing bins
    const estimatedCost = 0.057; // Only position rent
    
    return [
      {
        id: 'existing-bins-primary',
        label: `${styleInfo.label} Position (Existing Bins)`,
        description: `Safe ${actualPortfolioStyle} position using only existing price bins - no additional bin creation costs`,
        binStep: poolBinStep,
        estimatedCost,
        riskLevel,
        portfolioStyle: actualPortfolioStyle,
        strategy: 'oneSided',
        isDefault: true
      }
    ];
  }, [actualPortfolioStyle, poolBinStep, existingBinRanges]);

  // Set default strategy
  useEffect(() => {
    if (strategyOptions.length > 0 && !selectedStrategy) {
      setSelectedStrategy(strategyOptions[0].id);
    }
  }, [strategyOptions, selectedStrategy]);

  const selectedStrategyOption = strategyOptions.find(opt => opt.id === selectedStrategy);

  // Fetch user's token balance
  const fetchUserTokenBalance = useCallback(async () => {
    if (!publicKey || !pool) return;

    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
      );

      // Get token accounts for the user
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      // Find the specific token account for this pool's token
      let tokenBalance = 0;
      
      for (const account of tokenAccounts.value) {
        const parsedInfo = account.account.data.parsed.info;
        const balance = parsedInfo.tokenAmount.uiAmount;
        
        // Check if this is the token we're looking for (simplified check by symbol)
        if (balance > 0) {
          tokenBalance = Math.max(tokenBalance, balance);
        }
      }

      setUserTokenBalance(tokenBalance);
    } catch (error) {
      console.error('Error fetching token balance:', error);
      setUserTokenBalance(0);
    }
  }, [publicKey, pool]);

  // Fetch token balance when modal opens and user is connected
  useEffect(() => {
    if (isOpen && publicKey && pool) {
      fetchUserTokenBalance();
    }
  }, [isOpen, publicKey, pool, fetchUserTokenBalance]);

  // FIXED: Handle percentage buttons with debouncing to prevent rapid toast spam
  const handlePercentageClick = useCallback((percentage: number) => {
    console.log('Percentage clicked:', percentage, 'User balance:', userTokenBalance);
    
    // Prevent rapid clicking
    if (isUpdatingAmount) {
      console.log('Update in progress, ignoring click');
      return;
    }
    
    if (userTokenBalance <= 0) {
      console.log('No token balance available');
      showCustomToast.warning('No Balance', 'You don\'t have any tokens to allocate.');
      return;
    }
    
    setIsUpdatingAmount(true);
    
    // Set active percentage for visual feedback
    setActivePercentage(percentage);
    
    // FIXED: Calculate the correct percentage amount
    const amount = (userTokenBalance * percentage / 100).toFixed(6);
    console.log(`Setting ${percentage}% of balance:`, amount);
    setBtcAmount(amount);
    
    // Show feedback toast with correct percentage (debounced)
    showCustomToast.success('Amount Updated', `Set to ${percentage}% of your balance: ${amount} ${tokenX}`);
    
    // Reset update flag after a short delay
    setTimeout(() => {
      setIsUpdatingAmount(false);
    }, 300);
  }, [userTokenBalance, tokenX, isUpdatingAmount]);

  // FIXED: Handle max button with debouncing
  const handleMaxClick = useCallback(() => {
    console.log('Max clicked, User balance:', userTokenBalance);
    
    // Prevent rapid clicking
    if (isUpdatingAmount) {
      console.log('Update in progress, ignoring click');
      return;
    }
    
    if (userTokenBalance <= 0) {
      console.log('No token balance available for MAX');
      showCustomToast.warning('No Balance', 'You don\'t have any tokens to allocate.');
      return;
    }
    
    setIsUpdatingAmount(true);
    
    // Set active percentage to 100 for MAX
    setActivePercentage(100);
    
    const amount = userTokenBalance.toFixed(6);
    console.log('Setting max amount:', amount);
    setBtcAmount(amount);
    
    // Show feedback toast (debounced)
    showCustomToast.success('Amount Updated', `Set to maximum: ${amount} ${tokenX}`);
    
    // Reset update flag after a short delay
    setTimeout(() => {
      setIsUpdatingAmount(false);
    }, 300);
  }, [userTokenBalance, tokenX, isUpdatingAmount]);

  // Balance checking with simplified cost calculation (NO TRANSACTION FEES)
  const checkUserBalances = useCallback(async () => {
    if (!publicKey || !pool || !btcAmount || parseFloat(btcAmount) <= 0 || !selectedStrategyOption) return;

    setIsCheckingBalance(true);
    setValidationError('');

    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
      );

      const solBalanceLamports = await connection.getBalance(publicKey);
      const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
      
      // UPDATED: Only position rent (removed transaction fees)
      const estimatedSolNeeded = selectedStrategyOption.estimatedCost; // Only position rent
      
      const hasEnoughSol = solBalance >= estimatedSolNeeded;
      const shortfall = hasEnoughSol ? 0 : estimatedSolNeeded - solBalance;

      const balanceInfo: BalanceInfo = {
        solBalance,
        tokenBalance: 0,
        hasEnoughSol,
        estimatedSolNeeded,
        shortfall
      };

      setBalanceInfo(balanceInfo);

      if (!hasEnoughSol) {
        setValidationError(
          `Insufficient SOL balance. You need ${shortfall.toFixed(4)} more SOL to complete this transaction.`
        );
      }

    } catch (error) {
      console.error('Error checking balances:', error);
      setValidationError('Unable to verify account balances. Please try again.');
    } finally {
      setIsCheckingBalance(false);
    }
  }, [publicKey, pool, btcAmount, selectedStrategyOption]);

  useEffect(() => {
    if (btcAmount && parseFloat(btcAmount) > 0 && publicKey && pool && selectedStrategyOption) {
      checkUserBalances();
    } else {
      setBalanceInfo(null);
      setValidationError('');
    }
  }, [btcAmount, publicKey, pool, selectedStrategyOption, checkUserBalances]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value) || value === '') {
      setBtcAmount(value);
    }
  };

  // FIXED: Main transaction handler with proper toast timing
  const handleAddLiquidity = async () => {
    if (!pool || !publicKey || !btcAmount || parseFloat(btcAmount) <= 0 || !currentBinId || !selectedStrategyOption || existingBinRanges.length === 0) return;

    if (balanceInfo && !balanceInfo.hasEnoughSol) {
      showCustomToast.error('Insufficient SOL Balance', 
        validationError || 'You need more SOL to complete this transaction.'
      );
      return;
    }

    setIsLoading(true);
    
    try {
      const decimals = 8; // Default for BTC tokens
      const bnAmount = new BN(parseFloat(btcAmount) * Math.pow(10, decimals));
      
      // Use the first available existing range
      const selectedRange = existingBinRanges[0];
      
      console.log(`Creating ${userPortfolioStyle} position using EXISTING bins only:`, {
        poolBinStep,
        userStyle: userPortfolioStyle,
        range: `${selectedRange.minBinId} to ${selectedRange.maxBinId}`,
        existingBins: selectedRange.existingBins,
        amount: btcAmount,
        token: tokenX
      });
      
      // Create position using existing bins only
      const result = await positionService.createPositionWithExistingBins({
        poolAddress: pool.address,
        userPublicKey: publicKey,
        totalXAmount: bnAmount,
        totalYAmount: new BN(0),
        minBinId: selectedRange.minBinId,
        maxBinId: selectedRange.maxBinId,
        strategyType: StrategyType.Spot,
        useAutoFill: false
      }, selectedRange);
      
      // Send transactions
      console.log('About to send transaction(s)...');
      // FIXED: Changed to const instead of let
      const transactionSignatures: string[] = [];
      
      if (Array.isArray(result.transaction)) {
        console.log(`Sending ${result.transaction.length} transactions...`);
        for (let i = 0; i < result.transaction.length; i++) {
          const tx = result.transaction[i];
          console.log(`Sending transaction ${i + 1}/${result.transaction.length}...`);
          const signature = await sendTransaction(tx, dlmmService.connection, {
            signers: [result.positionKeypair]
          });
          console.log(`Transaction ${i + 1} signature:`, signature);
          transactionSignatures.push(signature);
        }
      } else {
        console.log('Sending single transaction...');
        const signature = await sendTransaction(result.transaction, dlmmService.connection, {
          signers: [result.positionKeypair]
        });
        console.log('Transaction signature:', signature);
        transactionSignatures.push(signature);
      }
      
      console.log('All transactions completed successfully!');
      console.log('Total signatures:', transactionSignatures);
      
      // FIXED: Use custom green toast with standard timing (8 seconds)
      setTimeout(() => {
        console.log('Showing success toast...');
        
        // Ensure we have a valid transaction signature
        const txSignature = transactionSignatures[0];
        if (!txSignature) {
          console.error('No transaction signature available for Solscan link');
          return;
        }
        
        // Create custom green toast with proper structure and timing
        const toastId = toast.custom(
          (t) => (
            <div className="bg-[#22c55e] text-white border border-[#16a34a] rounded-xl p-4 shadow-2xl max-w-md w-full">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-lg mb-1">🎉 Position Created Successfully!</div>
                  <div className="text-sm text-white/90 mb-3">
                    {actualPortfolioStyle.toUpperCase()} {tokenX} position created successfully!
                    <br />
                    <span className="font-mono text-xs bg-white/10 px-2 py-1 rounded mt-1 inline-block">
                      TX: {txSignature.slice(0, 12)}...
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toast.dismiss(String(t))}
                  className="flex-shrink-0 text-white/60 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ),
          {
            duration: TIMING_CONSTANTS.SUCCESS_TOAST_DURATION, // FIXED: Use standard 8 seconds
            position: 'top-center',
            style: {
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
            }
          }
        );
        
        // Store the toast ID for potential cleanup
        lastToastId = toastId;
      }, TIMING_CONSTANTS.TRANSACTION_CONFIRMATION_DELAY);
      
      // FIXED: Close modal with proper timing alignment
      setTimeout(() => {
        console.log('Closing modal...');
        onClose();
        setBtcAmount('');
        setActivePercentage(null);
      }, TIMING_CONSTANTS.MODAL_CLOSE_DELAY); // Toast duration + buffer
      
    } catch (error) {
      console.error('Error adding liquidity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.log('Error type detection:', {
        errorMessage,
        isInsufficientFunds: errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient lamports'),
        isUserRejected: errorMessage.includes('User rejected') || errorMessage.includes('user rejected') || errorMessage.includes('User denied'),
        isSimulationFailed: errorMessage.includes('Transaction simulation failed'),
        isNetworkError: errorMessage.includes('Network') || errorMessage.includes('network')
      });
      
      // Error handling with specific error toasts
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient lamports')) {
        console.log('Showing insufficient funds toast...');
        showCustomToast.error('Insufficient SOL Balance', 
          `You need SOL for position rent: ${selectedStrategyOption.estimatedCost.toFixed(3)} SOL (refundable). No bin creation costs!`
        );
      } else if (errorMessage.includes('User rejected') || errorMessage.includes('user rejected') || errorMessage.includes('User denied') || errorMessage.includes('cancelled')) {
        // User cancelled the transaction
        console.log('Showing transaction cancelled toast...');
        showCustomToast.warning('Transaction Cancelled', 
          'You cancelled the transaction. Your funds are safe.'
        );
      } else if (errorMessage.includes('Transaction simulation failed')) {
        console.log('Showing simulation failed toast...');
        showCustomToast.error('Transaction Failed', 
          'Transaction simulation failed. The selected bin range might be full or restricted.'
        );
      } else if (errorMessage.includes('Network') || errorMessage.includes('network')) {
        console.log('Showing network error toast...');
        showCustomToast.error('Network Error', 
          'Network connection issue. Please check your connection and try again.'
        );
      } else {
        // Generic error toast
        console.log('Showing generic error toast...');
        showCustomToast.error('Position Creation Failed', 
          `Failed to create ${actualPortfolioStyle} position: ${errorMessage}`
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getBinStepDescription = (binStep: number) => {
    if (binStep <= 5) return 'Very high precision (0.05% increments) - maximum fee capture';
    if (binStep <= 15) return 'Standard precision (0.1-1.5% increments) - balanced approach';
    return 'Conservative precision (5%+ increments) - stable and predictable';
  };
  
  return (
    <Dialog open={isOpen && !!pool} onOpenChange={onClose}>
      <DialogContent className="bg-[#161616] border-border text-white max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-white text-xl">Add {tokenX} Liquidity</DialogTitle>
          <DialogDescription className="text-sm text-sub-text">
            Using your {actualPortfolioStyle} strategy with existing bins only (no creation costs)
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-6">
          {/* Pool Information */}
          <div className="bg-[#0f0f0f] border border-border rounded-lg">
            <div 
              className="p-4 cursor-pointer flex items-center justify-between"
              onClick={() => setShowPoolInfo(!showPoolInfo)}
            >
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 flex-shrink-0 text-primary" />
                <span className="text-sm text-sub-text font-medium">Pool Information</span>
                <span className="text-primary font-medium text-xs">
                  {pool?.name} • BS-{poolBinStep}
                </span>
              </div>
              {showPoolInfo ? (
                <ChevronUp className="h-4 w-4 text-primary flex-shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" />
              )}
            </div>
            
            {showPoolInfo && (
              <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex justify-between items-center text-sm">
                    <span>Pool:</span>
                    <span className="text-white font-medium">{pool?.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span>Bin Step:</span>
                    <span className="text-primary font-medium">{poolBinStep}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span>Approach:</span>
                    <span className="text-green-400 font-medium">✅ Existing Bins Only</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Existing Bin Ranges Info */}
          {isLoadingBins ? (
            <div className="bg-[#0f0f0f] border border-border rounded-lg p-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm text-sub-text">Finding existing price ranges...</p>
            </div>
          ) : existingBinRanges.length > 0 && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span className="text-green-400 font-medium">Existing Bins Found</span>
              </div>
              <p className="text-sm text-white">
                Using range: {existingBinRanges[0]?.description}
              </p>
              <p className="text-xs text-green-300 mt-1">
                ✅ No bin creation costs - using existing liquidity infrastructure
              </p>
            </div>
          )}

          {/* Balance Display */}
          {balanceInfo && (
            <div className="bg-[#0f0f0f] border border-border rounded-lg">
              <div 
                className="p-4 cursor-pointer flex items-center justify-between"
                onClick={() => setShowAccountBalance(!showAccountBalance)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-sub-text font-medium">💰 Account Balance</span>
                  <span className={`font-medium text-xs ${balanceInfo.hasEnoughSol ? 'text-green-400' : 'text-red-400'}`}>
                    {balanceInfo.hasEnoughSol ? '✓ Sufficient' : '⚠️ Insufficient'}
                  </span>
                </div>
                {showAccountBalance ? (
                  <ChevronUp className="h-4 w-4 text-primary flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" />
                )}
              </div>
              
              {showAccountBalance && (
                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-2 border-t border-border pt-4">
                    <div className="flex justify-between items-center text-sm">
                      <span>SOL Balance:</span>
                      <span className={balanceInfo.hasEnoughSol ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                        {balanceInfo.solBalance.toFixed(4)} SOL
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span>SOL Needed:</span>
                      <span className="text-white font-medium">{balanceInfo.estimatedSolNeeded.toFixed(4)} SOL</span>
                    </div>
                    {balanceInfo.shortfall && balanceInfo.shortfall > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span>Shortfall:</span>
                        <span className="text-red-400 font-medium">-{balanceInfo.shortfall.toFixed(4)} SOL</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validation Error */}
          {validationError && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-200">{validationError}</div>
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-3">
            <label className="text-sm text-sub-text block font-medium">
              {tokenX} Amount to Provide
            </label>
            
            {/* Token Balance Display */}
            {publicKey && (
              <div className="flex justify-between items-center text-xs text-sub-text">
                <span>Available Balance:</span>
                <span className="font-medium">
                  {userTokenBalance.toFixed(6)} {tokenX}
                </span>
              </div>
            )}
            
            <div className="relative">
              <input
                type="text"
                value={btcAmount}
                onChange={handleAmountChange}
                placeholder="0.0"
                className="w-full bg-[#0f0f0f] border border-border rounded-lg p-4 text-white pr-20 text-lg font-medium"
              />
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-secondary/30 px-3 py-1.5 rounded text-sm font-medium">
                {tokenX}
              </div>
              {isCheckingBalance && (
                <div className="absolute right-24 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              )}
            </div>
            
            {/* Percentage Buttons */}
            {publicKey && userTokenBalance > 0 && (
              <div className="flex gap-2 mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePercentageClick(25)}
                  disabled={isUpdatingAmount}
                  className={`flex-1 text-xs transition-all duration-200 ${
                    activePercentage === 25
                      ? 'bg-primary/20 border-primary text-primary font-medium'
                      : 'bg-transparent border-border hover:border-green-500 hover:bg-green-500/20 hover:text-green-400 text-white'
                  } ${isUpdatingAmount ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  25%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePercentageClick(50)}
                  disabled={isUpdatingAmount}
                  className={`flex-1 text-xs transition-all duration-200 ${
                    activePercentage === 50
                      ? 'bg-primary/20 border-primary text-primary font-medium'
                      : 'bg-transparent border-border hover:border-green-500 hover:bg-green-500/20 hover:text-green-400 text-white'
                  } ${isUpdatingAmount ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  50%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePercentageClick(75)}
                  disabled={isUpdatingAmount}
                  className={`flex-1 text-xs transition-all duration-200 ${
                    activePercentage === 75
                      ? 'bg-primary/20 border-primary text-primary font-medium'
                      : 'bg-transparent border-border hover:border-green-500 hover:bg-green-500/20 hover:text-green-400 text-white'
                  } ${isUpdatingAmount ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  75%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMaxClick}
                  disabled={isUpdatingAmount}
                  className={`flex-1 text-xs transition-all duration-200 ${
                    activePercentage === 100
                      ? 'bg-primary/20 border-primary text-primary font-medium'
                      : 'bg-transparent border-border hover:border-green-500 hover:bg-green-500/20 hover:text-green-400 text-white'
                  } ${isUpdatingAmount ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  MAX
                </Button>
              </div>
            )}
            
            {/* No Balance Warning */}
            {publicKey && userTokenBalance === 0 && (
              <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 mt-3">
                <div className="flex items-center gap-2 text-yellow-200 text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>No {tokenX} balance found in your wallet</span>
                </div>
              </div>
            )}
          </div>

          {/* Strategy Display */}
          <div className="space-y-4">
            <label className="text-sm text-sub-text block font-medium">
              💡 Your Position Strategy
            </label>
            
            <div className="grid gap-3">
              {strategyOptions.map((option) => (
                <div 
                  key={option.id}
                  className="p-4 border border-primary bg-primary/10 rounded-lg"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="font-medium text-white text-sm">
                          {option.label}
                        </div>
                        <div className="px-2 py-1 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30 whitespace-nowrap">
                          NO BIN COSTS
                        </div>
                      </div>
                      <div className="text-xs text-sub-text mb-2">
                        {option.description}
                      </div>
                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        <span className="whitespace-nowrap">Bin Step: {option.binStep}</span>
                        <span className="whitespace-nowrap">Cost: ~{option.estimatedCost.toFixed(3)} SOL</span>
                        <span className="whitespace-nowrap">Strategy: Existing Bins Only</span>
                      </div>
                    </div>
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 ml-2" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Strategy Details */}
          {selectedStrategyOption && (
            <div className="bg-[#0f0f0f] border border-border rounded-lg">
              <div 
                className="p-4 cursor-pointer flex items-center justify-between"
                onClick={() => setShowStrategyDetails(!showStrategyDetails)}
              >
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 flex-shrink-0 text-primary" />
                  <span className="text-sm text-sub-text font-medium">
                    Strategy Details (Existing Bins Only)
                  </span>
                </div>
                {showStrategyDetails ? (
                  <ChevronUp className="h-4 w-4 text-primary flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" />
                )}
              </div>
              
              {showStrategyDetails && (
                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="text-sm text-sub-text space-y-2 border-t border-border pt-4">
                    <div>
                      <div className="font-medium text-white mb-2">Position Details:</div>
                      <div>• Bin Step {poolBinStep}: {getBinStepDescription(poolBinStep)}</div>
                      <div>• Portfolio Style: {actualPortfolioStyle.toUpperCase()} - matches your risk preference</div>
                      <div>• Position Type: One-sided {tokenX} only</div>
                      <div>• Range: Uses existing price bins only</div>
                      <div>• ✅ Cost Advantage: No bin creation fees - significant savings!</div>
                      <div>• Safety: Lower risk by using established price ranges</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* UPDATED: Cost Breakdown (No Transaction Fees) */}
          <div className="bg-[#0f0f0f] border border-border rounded-lg">
            <div 
              className="p-4 cursor-pointer flex items-center justify-between"
              onClick={() => setShowCostBreakdown(!showCostBreakdown)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-sub-text font-medium">💰 Cost Breakdown</span>
                <span className="text-primary font-medium">
                  ~{selectedStrategyOption ? selectedStrategyOption.estimatedCost.toFixed(3) : '0.057'} SOL
                </span>
              </div>
              {showCostBreakdown ? (
                <ChevronUp className="h-4 w-4 text-primary flex-shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" />
              )}
            </div>
            
            {showCostBreakdown && selectedStrategyOption && (
              <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-2 text-sm border-t border-border pt-4">
                  <div className="flex justify-between">
                    <span>Position Rent (refundable):</span>
                    <span className="text-green-400 font-medium">{selectedStrategyOption.estimatedCost.toFixed(3)} SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bin Creation Cost:</span>
                    <span className="text-green-400 font-medium">FREE ✅</span>
                  </div>
                  <div className="flex justify-between items-center font-medium border-t border-border pt-2 mt-2">
                    <span>Total Estimated:</span>
                    <span className="text-primary">
                      ~{selectedStrategyOption.estimatedCost.toFixed(3)} SOL
                    </span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-green-400">
                  💡 Major savings! Using existing bins eliminates expensive bin creation costs (typically 0.075+ SOL per new bin).
                </div>
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button 
            onClick={handleAddLiquidity} 
            disabled={
              !btcAmount || 
              parseFloat(btcAmount) <= 0 || 
              isLoading || 
              isCheckingBalance ||
              isLoadingBins ||
              existingBinRanges.length === 0 ||
              (balanceInfo ? !balanceInfo.hasEnoughSol : false)
            }
            className="bg-primary hover:bg-primary/80 w-full sm:w-auto order-1 sm:order-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Position...
              </>
            ) : isLoadingBins ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Finding Bins...
              </>
            ) : (
              `Create ${actualPortfolioStyle} Position`
            )}
          </Button>
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isLoading || isLoadingBins}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddLiquidityModal;