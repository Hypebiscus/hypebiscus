// Enhanced AddLiquidityModal.tsx with improved mobile/desktop views and in-range bins as default

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Info, AlertTriangle, CheckCircle, TrendingUp, Shield, BarChart3 } from "lucide-react";
import { useWallet } from '@solana/wallet-adapter-react';
import { useMeteoraDlmmService } from "@/lib/meteora/meteoraDlmmService";
import { useMeteoraPositionService } from "@/lib/meteora/meteoraPositionService";
import { BN } from 'bn.js';
import { StrategyType } from '@meteora-ag/dlmm';
import { FormattedPool } from '@/lib/utils/poolUtils';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ExistingRangeService } from '@/lib/services/existingRangeService';

interface AddLiquidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: FormattedPool | null;
}

interface BalanceInfo {
  solBalance: number;
  tokenBalance: number;
  hasEnoughSol: boolean;
  hasEnoughToken: boolean;
  estimatedSolNeeded: number;
  estimatedTokenNeeded: number;
}

// Enhanced range recommendation interface with better UI properties
interface RangeRecommendation {
  minBinId: number;
  maxBinId: number;
  centerBinId: number;
  width: number;
  positionCount: number;
  totalLiquidity: number;
  estimatedCost: number;
  isPopular: boolean;
  label: string;
  description: string;
  icon: string;
  riskLevel: 'low' | 'medium' | 'high';
  isInRange: boolean; // New property to indicate if range includes current price
}

const AddLiquidityModal: React.FC<AddLiquidityModalProps> = ({ 
  isOpen, 
  onClose,
  pool 
}) => {
  const { publicKey, sendTransaction } = useWallet();
  const { service: dlmmService } = useMeteoraDlmmService();
  const { service: positionService } = useMeteoraPositionService();
  
  // Basic form state
  const [amount, setAmount] = useState('');
  const [rangeWidth, setRangeWidth] = useState('10');
  const [isLoading, setIsLoading] = useState(false);
  const [strategy, setStrategy] = useState<string>('Spot');
  const [useAutoFill, setUseAutoFill] = useState(true);
  const [estimatedYAmount, setEstimatedYAmount] = useState<string>('');
  
  // Balance validation state
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

  // Enhanced range recommendation state with better default selection
  const [rangeRecommendations, setRangeRecommendations] = useState<{
    inRange: RangeRecommendation;
    conservative: RangeRecommendation;
    balanced: RangeRecommendation;
    aggressive: RangeRecommendation;
    all: RangeRecommendation[];
  } | null>(null);
  const [selectedRangeType, setSelectedRangeType] = useState<'inRange' | 'conservative' | 'balanced' | 'aggressive' | 'custom'>('inRange');
  const [isLoadingRanges, setIsLoadingRanges] = useState(false);

  // Services
  const existingRangeService = useMemo(() => 
    new ExistingRangeService(new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com')), 
    []
  );

  // Enhanced load existing ranges with in-range focus
  const loadExistingRanges = async () => {
    if (!pool) return;
    
    setIsLoadingRanges(true);
    try {
      // Get current price information first
      const dlmmPool = await dlmmService.initializePool(pool.address);
      const activeBin = await dlmmPool.getActiveBin();
      const currentBinId = activeBin.binId;
      
      console.log('Current active bin ID:', currentBinId);
      
      // Create enhanced recommendations with current price focus
      const enhancedRecommendations = {
        // IN-RANGE: Tight range around current price (DEFAULT)
        inRange: {
          minBinId: currentBinId - 5,
          maxBinId: currentBinId + 5,
          centerBinId: currentBinId,
          width: 10,
          positionCount: 0,
          totalLiquidity: 0,
          estimatedCost: 0.057,
          isPopular: true,
          isInRange: true,
          label: '🎯 In-Range (Recommended)',
          description: 'Tight range around current price • Active earning • Lower cost',
          icon: '🎯',
          riskLevel: 'medium' as const
        },
        
        // CONSERVATIVE: Wider range for stability
        conservative: {
          minBinId: currentBinId - 15,
          maxBinId: currentBinId + 15,
          centerBinId: currentBinId,
          width: 30,
          positionCount: 0,
          totalLiquidity: 0,
          estimatedCost: 0.082,
          isPopular: false,
          isInRange: true,
          label: '🛡️ Conservative',
          description: 'Wide range • Lower risk • Stable returns • May cost more',
          icon: '🛡️',
          riskLevel: 'low' as const
        },
        
        // BALANCED: Medium range for balanced approach
        balanced: {
          minBinId: currentBinId - 10,
          maxBinId: currentBinId + 10,
          centerBinId: currentBinId,
          width: 20,
          positionCount: 0,
          totalLiquidity: 0,
          estimatedCost: 0.070,
          isPopular: true,
          isInRange: true,
          label: '⚖️ Balanced',
          description: 'Medium range • Good liquidity coverage • Moderate cost',
          icon: '⚖️',
          riskLevel: 'medium' as const
        },
        
        // AGGRESSIVE: Very tight range for maximum fees
        aggressive: {
          minBinId: currentBinId - 3,
          maxBinId: currentBinId + 3,
          centerBinId: currentBinId,
          width: 6,
          positionCount: 0,
          totalLiquidity: 0,
          estimatedCost: 0.057,
          isPopular: false,
          isInRange: true,
          label: '🚀 Aggressive',
          description: 'Very tight range • Maximum fees • Higher risk • Lowest cost',
          icon: '🚀',
          riskLevel: 'high' as const
        },
        
        all: []
      };
      
      // Try to get actual existing ranges for cost optimization
      try {
        const existingRanges = await existingRangeService.findExistingRanges(pool.address);
        
        // Update costs based on existing ranges if available
        if (existingRanges.cheapest) {
          // Find the closest existing range to our in-range recommendation
          const inRangeOverlap = Math.max(0, 
            Math.min(enhancedRecommendations.inRange.maxBinId, existingRanges.cheapest.maxBinId) -
            Math.max(enhancedRecommendations.inRange.minBinId, existingRanges.cheapest.minBinId)
          );
          
          if (inRangeOverlap > 0) {
            enhancedRecommendations.inRange.estimatedCost = existingRanges.cheapest.estimatedCost;
            enhancedRecommendations.inRange.description = 'Tight range around current price • Uses existing bins • Very low cost';
          }
        }
      } catch (error) {
        console.warn('Could not load existing ranges, using estimates:', error);
      }
      
      setRangeRecommendations(enhancedRecommendations);
      
      // Default to in-range selection
      setSelectedRangeType('inRange');
      setRangeWidth(enhancedRecommendations.inRange.width.toString());
      
    } catch (error) {
      console.error('Error loading ranges:', error);
      
      // Fallback recommendations
      const fallbackRecommendations = {
        inRange: {
          minBinId: 0,
          maxBinId: 10,
          centerBinId: 5,
          width: 10,
          positionCount: 0,
          totalLiquidity: 0,
          estimatedCost: 0.057,
          isPopular: true,
          isInRange: true,
          label: '🎯 In-Range (Recommended)',
          description: 'Default tight range around current price',
          icon: '🎯',
          riskLevel: 'medium' as const
        },
        conservative: {
          minBinId: -15,
          maxBinId: 25,
          centerBinId: 5,
          width: 40,
          positionCount: 0,
          totalLiquidity: 0,
          estimatedCost: 0.150,
          isPopular: false,
          isInRange: true,
          label: '🛡️ Conservative',
          description: 'Wide range for stability',
          icon: '🛡️',
          riskLevel: 'low' as const
        },
        balanced: {
          minBinId: -5,
          maxBinId: 15,
          centerBinId: 5,
          width: 20,
          positionCount: 0,
          totalLiquidity: 0,
          estimatedCost: 0.090,
          isPopular: true,
          isInRange: true,
          label: '⚖️ Balanced',
          description: 'Medium range for balanced approach',
          icon: '⚖️',
          riskLevel: 'medium' as const
        },
        aggressive: {
          minBinId: 2,
          maxBinId: 8,
          centerBinId: 5,
          width: 6,
          positionCount: 0,
          totalLiquidity: 0,
          estimatedCost: 0.057,
          isPopular: false,
          isInRange: true,
          label: '🚀 Aggressive',
          description: 'Very tight range for maximum fees',
          icon: '🚀',
          riskLevel: 'high' as const
        },
        all: []
      };
      
      setRangeRecommendations(fallbackRecommendations);
    } finally {
      setIsLoadingRanges(false);
    }
  };

  // Load existing ranges when modal opens
  useEffect(() => {
    if (isOpen && pool) {
      loadExistingRanges();
    }
  }, [isOpen, pool]);

  // Check user balances when amount changes
  useEffect(() => {
    if (amount && parseFloat(amount) > 0 && publicKey && pool) {
      checkUserBalances();
    } else {
      setBalanceInfo(null);
      setValidationError('');
    }
  }, [amount, publicKey, pool]);

  const checkUserBalances = async () => {
    if (!publicKey || !pool || !amount || parseFloat(amount) <= 0) return;

    setIsCheckingBalance(true);
    setValidationError('');

    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
      );

      // Get SOL balance
      const solBalanceLamports = await connection.getBalance(publicKey);
      const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;

      // Estimate SOL needed (including transaction fees and possible wrapped SOL)
      const amountValue = parseFloat(amount);
      
      // Get cost estimate based on selected range
      let estimatedCost = 0.057; // Default position rent
      if (selectedRangeType !== 'custom' && rangeRecommendations) {
        estimatedCost = rangeRecommendations[selectedRangeType].estimatedCost;
      } else {
        // Custom range might need new binArrays
        estimatedCost = 0.207; // Conservative estimate for custom ranges
      }
      
      const estimatedSolNeeded = amountValue + estimatedCost + 0.01; // Add buffer for fees
      
      // Get estimated Y amount for balanced position
      let estimatedYValue = 0;
      if (useAutoFill && estimatedYAmount) {
        estimatedYValue = parseFloat(estimatedYAmount);
      }

      const hasEnoughSol = solBalance >= estimatedSolNeeded;
      const hasEnoughToken = true; // Placeholder - implement actual token balance check

      const balanceInfo: BalanceInfo = {
        solBalance,
        tokenBalance: 0, // Placeholder
        hasEnoughSol,
        hasEnoughToken,
        estimatedSolNeeded,
        estimatedTokenNeeded: estimatedYValue
      };

      setBalanceInfo(balanceInfo);

      // Set validation errors
      if (!hasEnoughSol) {
        const shortfall = estimatedSolNeeded - solBalance;
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
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value) || value === '') {
      setAmount(value);
      calculateEstimatedYAmount(value);
    }
  };
  
  const calculateEstimatedYAmount = async (xAmount: string) => {
    if (!pool || !xAmount || parseFloat(xAmount) <= 0 || !useAutoFill) {
      setEstimatedYAmount('');
      return;
    }

    try {
      const activeBin = await dlmmService.getActiveBin(pool.address);
      const decimals = 9;
      const bnAmount = new BN(parseFloat(xAmount) * Math.pow(10, decimals));
      const rangeWidthNum = parseInt(rangeWidth);
      const minBinId = activeBin.binId - rangeWidthNum;
      const maxBinId = activeBin.binId + rangeWidthNum;
      
      const estimatedY = dlmmService.calculateBalancedYAmount(
        activeBin.binId,
        parseInt(pool.binStep),
        bnAmount,
        activeBin.xAmount,
        activeBin.yAmount,
        minBinId,
        maxBinId,
        getStrategyType()
      );
      
      const estimatedYFormatted = (estimatedY.toNumber() / Math.pow(10, decimals)).toFixed(6);
      setEstimatedYAmount(estimatedYFormatted);
      
    } catch (error) {
      console.error('Error calculating estimated Y amount:', error);
      setEstimatedYAmount('Auto-calculation failed');
    }
  };

  const getStrategyType = (): StrategyType => {
    switch (strategy) {
      case 'BidAsk': return StrategyType.BidAsk;
      case 'Curve': return StrategyType.Curve;
      case 'Spot':
      default: return StrategyType.Spot;
    }
  };

  // Enhanced range type change handler
  const handleRangeTypeChange = (type: 'inRange' | 'conservative' | 'balanced' | 'aggressive' | 'custom') => {
    setSelectedRangeType(type);
    
    if (type !== 'custom' && rangeRecommendations) {
      const selectedRange = rangeRecommendations[type];
      setRangeWidth(selectedRange.width.toString());
    }
  };

  const handleAddLiquidity = async () => {
    if (!pool || !publicKey || !amount || parseFloat(amount) <= 0) return;

    // Enhanced validation before any async operations
    if (balanceInfo) {
      if (!balanceInfo.hasEnoughSol) {
        alert(validationError || 'Insufficient SOL balance to complete transaction');
        return;
      }
    }

    // Additional pre-flight balance check
    try {
      const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
      const currentBalance = await connection.getBalance(publicKey);
      const currentSolBalance = currentBalance / LAMPORTS_PER_SOL;
      
      let estimatedCost = 0.057;
      if (selectedRangeType !== 'custom' && rangeRecommendations) {
        estimatedCost = rangeRecommendations[selectedRangeType].estimatedCost;
      } else {
        estimatedCost = 0.207; // Conservative estimate for custom ranges
      }
      
      const amountValue = parseFloat(amount);
      const requiredSol = amountValue + estimatedCost + 0.01;
      
      if (currentSolBalance < requiredSol) {
        alert(`Real-time balance check failed. Current SOL balance: ${currentSolBalance.toFixed(4)}, Required: ${requiredSol.toFixed(4)}`);
        return;
      }
    } catch (error) {
      console.error('Balance verification failed:', error);
      alert('Unable to verify current balance. Please try again.');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const activeBin = await dlmmService.getActiveBin(pool.address);
      let minBinId, maxBinId;
      
      // Use selected range from recommendations or custom
      if (selectedRangeType !== 'custom' && rangeRecommendations) {
        const selectedRange = rangeRecommendations[selectedRangeType];
        minBinId = selectedRange.minBinId;
        maxBinId = selectedRange.maxBinId;
        
        console.log(`Using ${selectedRangeType} range: bins ${minBinId} to ${maxBinId}, estimated cost: ${selectedRange.estimatedCost} SOL`);
      } else {
        // Custom range (may cost more)
        const rangeWidthNum = parseInt(rangeWidth);
        minBinId = activeBin.binId - rangeWidthNum;
        maxBinId = activeBin.binId + rangeWidthNum;
        
        console.log(`Using custom range: bins ${minBinId} to ${maxBinId} (may require new binArrays)`);
      }
      
      const decimals = 9;
      const bnAmount = new BN(parseFloat(amount) * Math.pow(10, decimals));
      
      const result = await positionService.createBalancedPosition({
        poolAddress: pool.address,
        userPublicKey: publicKey,
        totalXAmount: bnAmount,
        minBinId,
        maxBinId,
        strategyType: getStrategyType(),
        useAutoFill: useAutoFill
      });
      
      if (Array.isArray(result.transaction)) {
        for (const tx of result.transaction) {
          const signature = await sendTransaction(tx, dlmmService.connection, {
            signers: [result.positionKeypair]
          });
          console.log('Transaction signature:', signature);
        }
      } else {
        const signature = await sendTransaction(result.transaction, dlmmService.connection, {
          signers: [result.positionKeypair]
        });
        console.log('Transaction signature:', signature);
      }
      
      // Show success message with cost information
      const actualCost = result.estimatedCost?.total || 0.057;
      alert(`Liquidity added successfully! Position: ${result.positionKeypair.publicKey.toString().slice(0, 8)}... (Cost: ${actualCost.toFixed(3)} SOL)`);
      
      onClose();
      setAmount('');
      setEstimatedYAmount('');
      setRangeWidth('10');
      setStrategy('Spot');
      
    } catch (error) {
      console.error('Error adding liquidity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Enhanced error handling
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient lamports')) {
        alert('Insufficient funds. Please check your SOL and token balances.');
      } else if (errorMessage.includes('Transaction simulation failed')) {
        alert('Transaction failed during simulation. This usually means insufficient funds or invalid parameters.');
      } else {
        alert(`Error adding liquidity: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Get risk level color
  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'high': return 'text-red-400 bg-red-500/10 border-red-500/20';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };
  
  return (
    <Dialog open={isOpen && !!pool} onOpenChange={onClose}>
      <DialogContent className="bg-[#161616] border-border text-white max-w-lg mx-auto max-h-[90vh] overflow-y-auto" aria-describedby="add-liquidity-description">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-white text-xl">Add Liquidity to {pool?.name}</DialogTitle>
          <DialogDescription id="add-liquidity-description" className="text-sm text-sub-text">
            Add liquidity to this pool to earn fees from trading activity
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-6">
          {/* Balance Display */}
          {balanceInfo && (
            <div className="bg-[#0f0f0f] border border-border rounded-lg p-4">
              <div className="text-sm text-sub-text mb-3 font-medium">Account Balance</div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span>SOL Balance:</span>
                  <span className={balanceInfo.hasEnoughSol ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                    {balanceInfo.solBalance.toFixed(4)} SOL
                  </span>
                </div>
                {balanceInfo.estimatedSolNeeded > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span>SOL Needed:</span>
                    <span className="text-white font-medium">{balanceInfo.estimatedSolNeeded.toFixed(4)} SOL</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Validation Error Display */}
          {validationError && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-200">{validationError}</div>
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-3">
            <label className="text-sm text-sub-text block font-medium">
              Amount ({pool?.name.split('-')[0].replace('WBTC', 'BTC')})
            </label>
            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.0"
                className="w-full bg-[#0f0f0f] border border-border rounded-lg p-4 text-white pr-20 text-lg font-medium"
              />
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-secondary/30 px-3 py-1.5 rounded text-sm font-medium">
                {pool?.name.split('-')[0].replace('WBTC', 'BTC')}
              </div>
              {isCheckingBalance && (
                <div className="absolute right-24 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              )}
            </div>
          </div>

          {/* Auto-Fill Toggle */}
          <div className="flex items-center space-x-3 p-3 bg-[#0f0f0f] rounded-lg border border-border">
            <input
              type="checkbox"
              id="autoFill"
              checked={useAutoFill}
              onChange={(e) => setUseAutoFill(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="autoFill" className="text-sm text-white font-medium">
              Auto-calculate balanced amount
            </label>
          </div>

          {/* Estimated Y Amount Display */}
          {useAutoFill && estimatedYAmount && (
            <div className="bg-[#0f0f0f] border border-border rounded-lg p-4">
              <div className="text-sm text-sub-text mb-2 font-medium">
                Estimated {pool?.name.split('-')[1]} Amount:
              </div>
              <div className="text-white font-bold text-lg">
                {estimatedYAmount}
              </div>
            </div>
          )}

          {/* Enhanced Range Recommendations */}
          {rangeRecommendations && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-sub-text block mb-3 font-medium">
                  💡 Position Range Strategy
                </label>
                
                {isLoadingRanges ? (
                  <div className="flex items-center justify-center p-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary mr-3" />
                    <span className="text-sm">Loading optimal ranges...</span>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {/* In-Range Option (Default & Recommended) */}
                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        selectedRangeType === 'inRange' 
                          ? 'border-green-500 bg-green-500/10' 
                          : 'border-border bg-[#0f0f0f] hover:border-green-500/50'
                      }`}
                      onClick={() => handleRangeTypeChange('inRange')}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="text-xs text-sub-text mb-2">
                            {rangeRecommendations.conservative.description}
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span>Width: {rangeRecommendations.conservative.width} bins</span>
                            <span>Cost: {rangeRecommendations.conservative.estimatedCost.toFixed(3)} SOL</span>
                          </div>
                        </div>
                        {selectedRangeType === 'conservative' && (
                          <CheckCircle className="h-5 w-5 text-blue-400 flex-shrink-0" />
                        )}
                      </div>
                    </div>

                    {/* Balanced Option */}
                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        selectedRangeType === 'balanced' 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border bg-[#0f0f0f] hover:border-primary/50'
                      }`}
                      onClick={() => handleRangeTypeChange('balanced')}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{rangeRecommendations.balanced.icon}</span>
                            <div className="font-medium text-primary text-sm">
                              {rangeRecommendations.balanced.label}
                            </div>
                            <div className={`px-2 py-1 rounded-full text-xs border ${getRiskLevelColor(rangeRecommendations.balanced.riskLevel)}`}>
                              {rangeRecommendations.balanced.riskLevel.toUpperCase()}
                            </div>
                          </div>
                          <div className="text-xs text-sub-text mb-2">
                            {rangeRecommendations.balanced.description}
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span>Width: {rangeRecommendations.balanced.width} bins</span>
                            <span>Cost: {rangeRecommendations.balanced.estimatedCost.toFixed(3)} SOL</span>
                          </div>
                        </div>
                        {selectedRangeType === 'balanced' && (
                          <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                        )}
                      </div>
                    </div>

                    {/* Aggressive Option */}
                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        selectedRangeType === 'aggressive' 
                          ? 'border-red-500 bg-red-500/10' 
                          : 'border-border bg-[#0f0f0f] hover:border-red-500/50'
                      }`}
                      onClick={() => handleRangeTypeChange('aggressive')}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{rangeRecommendations.aggressive.icon}</span>
                            <div className="font-medium text-red-400 text-sm">
                              {rangeRecommendations.aggressive.label}
                            </div>
                            <div className={`px-2 py-1 rounded-full text-xs border ${getRiskLevelColor(rangeRecommendations.aggressive.riskLevel)}`}>
                              {rangeRecommendations.aggressive.riskLevel.toUpperCase()}
                            </div>
                          </div>
                          <div className="text-xs text-sub-text mb-2">
                            {rangeRecommendations.aggressive.description}
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span>Width: {rangeRecommendations.aggressive.width} bins</span>
                            <span>Cost: {rangeRecommendations.aggressive.estimatedCost.toFixed(3)} SOL</span>
                          </div>
                        </div>
                        {selectedRangeType === 'aggressive' && (
                          <CheckCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                        )}
                      </div>
                    </div>

                    {/* Custom Option */}
                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        selectedRangeType === 'custom' 
                          ? 'border-yellow-500 bg-yellow-500/10' 
                          : 'border-border bg-[#0f0f0f] hover:border-yellow-500/50'
                      }`}
                      onClick={() => handleRangeTypeChange('custom')}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">⚙️</span>
                            <div className="font-medium text-yellow-400 text-sm">Custom Range</div>
                            <div className="px-2 py-1 rounded-full text-xs border text-gray-400 bg-gray-500/10 border-gray-500/20">
                              CUSTOM
                            </div>
                          </div>
                          <div className="text-xs text-sub-text mb-2">
                            Set your own range (may cost more if bins don't exist)
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span>Custom width • Variable cost</span>
                          </div>
                        </div>
                        {selectedRangeType === 'custom' && (
                          <CheckCircle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom Range Input (only show when custom is selected) */}
              {selectedRangeType === 'custom' && (
                <div className="bg-[#0f0f0f] border border-yellow-500/30 rounded-lg p-4">
                  <label className="text-sm text-sub-text block mb-2 font-medium">
                    Custom Range Width (bins on each side)
                  </label>
                  <input
                    type="number"
                    value={rangeWidth}
                    onChange={(e) => setRangeWidth(e.target.value)}
                    min="1"
                    max="50"
                    className="w-full bg-[#161616] border border-border rounded-lg p-3 text-white"
                    placeholder="Enter range width"
                  />
                  <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-yellow-200">
                        <div className="font-medium mb-1">Custom Range Warning</div>
                        <div>Custom ranges may require creating new price bins, which can cost an additional ~0.15 SOL. Consider using recommended ranges for lower costs.</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cost Summary */}
              <div className="bg-[#0f0f0f] border border-border rounded-lg p-4">
                <div className="text-sm text-sub-text mb-3 font-medium">Position Cost Breakdown</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Position Rent (refundable):</span>
                    <span className="text-green-400 font-medium">0.057 SOL</span>
                  </div>
                  {selectedRangeType !== 'custom' && rangeRecommendations && (
                    <div className="flex justify-between">
                      <span>BinArray Cost (using existing):</span>
                      <span className="text-green-400 font-medium">
                        {(rangeRecommendations[selectedRangeType].estimatedCost - 0.057).toFixed(3)} SOL
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center font-medium border-t border-border pt-2 mt-2">
                    <span>Total Estimated Cost:</span>
                    <span className={
                      selectedRangeType !== 'custom' && rangeRecommendations 
                        ? rangeRecommendations[selectedRangeType].estimatedCost <= 0.1 ? 'text-green-400' : 'text-yellow-400'
                        : 'text-yellow-400'
                    }>
                      {selectedRangeType !== 'custom' && rangeRecommendations 
                        ? `${rangeRecommendations[selectedRangeType].estimatedCost.toFixed(3)} SOL`
                        : '~0.057-0.25 SOL'
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Strategy Selection */}
          <div className="space-y-3">
            <label className="text-sm text-sub-text block font-medium">Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-border rounded-lg p-4 text-white"
            >
              <option value="Spot">Spot (Balanced Distribution)</option>
              <option value="BidAsk">BidAsk (Edge Concentration)</option>
              <option value="Curve">Curve (Center Concentration)</option>
            </select>
          </div>
          
          {/* Pool Information */}
          <div className="bg-[#0f0f0f] border border-border rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 flex-shrink-0 mt-0.5 text-primary" />
              <div className="text-sm text-sub-text space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-sub-text">Current Price</div>
                    <div className="text-white font-medium">${pool?.currentPrice}</div>
                  </div>
                  <div>
                    <div className="text-xs text-sub-text">Expected APY</div>
                    <div className="text-white font-medium">{pool?.apy}</div>
                  </div>
                  <div>
                    <div className="text-xs text-sub-text">Bin Step</div>
                    <div className="text-white font-medium">{pool?.binStep}</div>
                  </div>
                  <div>
                    <div className="text-xs text-sub-text">Pool Address</div>
                    <div className="text-white font-medium font-mono">{pool?.address.slice(0, 8)}...</div>
                  </div>
                </div>
                {selectedRangeType !== 'custom' && rangeRecommendations && (
                  <div className="mt-3 p-2 bg-green-500/10 border border-green-500/20 rounded">
                    <div className="text-green-400 text-xs font-medium">
                      💡 Using optimized range strategy - this saves on creation costs by utilizing existing price bins!
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter className="mt-8 flex flex-col sm:flex-row gap-3">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleAddLiquidity} 
            disabled={
              !amount || 
              parseFloat(amount) <= 0 || 
              isLoading || 
              isCheckingBalance ||
              (balanceInfo ? (!balanceInfo.hasEnoughSol || !balanceInfo.hasEnoughToken) : false)
            }
            className="bg-primary hover:bg-primary/80 w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Position...
              </>
            ) : (
              'Add Liquidity'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddLiquidityModal;