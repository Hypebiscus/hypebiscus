// Enhanced AddLiquidityModal.tsx with proper balance validation and existing range support

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Info, AlertTriangle, CheckCircle } from "lucide-react";
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

// Use the ExistingRange interface from the service, with additional UI properties
interface RangeRecommendation {
  minBinId: number;
  maxBinId: number;
  centerBinId: number;
  width: number;
  positionCount: number;
  totalLiquidity: number;
  estimatedCost: number;
  isPopular: boolean;
  label?: string;
  description?: string;
  icon?: string;
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

  // Range recommendation state - use the correct type from ExistingRangeService
  const [rangeRecommendations, setRangeRecommendations] = useState<any>(null);
  const [selectedRangeType, setSelectedRangeType] = useState<'cheapest' | 'mostPopular' | 'balanced' | 'custom'>('cheapest');
  const [isLoadingRanges, setIsLoadingRanges] = useState(false);

  // Services
  const existingRangeService = useMemo(() => 
    new ExistingRangeService(new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com')), 
    []
  );

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

  const loadExistingRanges = async () => {
    if (!pool) return;
    
    setIsLoadingRanges(true);
    try {
      const recommendations = await existingRangeService.findExistingRanges(pool.address);
      
      // Add UI properties to the recommendations
      const enhancedRecommendations = {
        cheapest: {
          ...recommendations.cheapest,
          label: '💰 Cheapest Option',
          description: `Width: ${recommendations.cheapest.width} bins • Cost: ${recommendations.cheapest.estimatedCost.toFixed(3)} SOL`,
          icon: '💰'
        },
        mostPopular: {
          ...recommendations.mostPopular,
          label: '🔥 Most Popular',
          description: `Width: ${recommendations.mostPopular.width} bins • ${recommendations.mostPopular.positionCount} positions • Cost: ${recommendations.mostPopular.estimatedCost.toFixed(3)} SOL`,
          icon: '🔥'
        },
        balanced: {
          ...recommendations.balanced,
          label: '⚖️ Balanced',
          description: `Width: ${recommendations.balanced.width} bins • Good liquidity • Cost: ${recommendations.balanced.estimatedCost.toFixed(3)} SOL`,
          icon: '⚖️'
        },
        all: recommendations.all
      };
      
      setRangeRecommendations(enhancedRecommendations);
      
      // Auto-select the cheapest option
      setSelectedRangeType('cheapest');
      
      // Update range width based on selection
      if (enhancedRecommendations.cheapest) {
        setRangeWidth(enhancedRecommendations.cheapest.width.toString());
      }
      
    } catch (error) {
      console.error('Error loading existing ranges:', error);
      // Set fallback recommendations with proper structure
      const fallbackRange = {
        minBinId: 0,
        maxBinId: 20,
        centerBinId: 10,
        width: 10,
        positionCount: 0,
        totalLiquidity: 0,
        estimatedCost: 0.057,
        isPopular: false
      };
      
      setRangeRecommendations({
        cheapest: {
          ...fallbackRange,
          label: '💰 Cheapest Option',
          description: '10 bins width - estimated cost',
          icon: '💰'
        },
        mostPopular: {
          ...fallbackRange,
          width: 15,
          maxBinId: 30,
          label: '🔥 Most Popular',
          description: '15 bins width - estimated cost',
          icon: '🔥'
        },
        balanced: {
          ...fallbackRange,
          width: 12,
          maxBinId: 24,
          label: '⚖️ Balanced',
          description: '12 bins width - estimated cost',
          icon: '⚖️'
        },
        all: []
      });
    } finally {
      setIsLoadingRanges(false);
    }
  };

  // Remove this function since we're handling fallbacks in loadExistingRanges

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

  const handleRangeTypeChange = (type: 'cheapest' | 'mostPopular' | 'balanced' | 'custom') => {
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
        
        console.log(`Using existing range: ${selectedRangeType}, bins ${minBinId} to ${maxBinId}, estimated cost: ${selectedRange.estimatedCost} SOL`);
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
  
  return (
    <Dialog open={isOpen && !!pool} onOpenChange={onClose}>
      <DialogContent className="bg-[#161616] border-border text-white max-w-md" aria-describedby="add-liquidity-description">
        <DialogHeader>
          <DialogTitle className="text-white">Add Liquidity to {pool?.name}</DialogTitle>
          <DialogDescription id="add-liquidity-description">
            Add liquidity to this pool to earn fees from trading activity
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          {/* Balance Display */}
          {balanceInfo && (
            <div className="bg-[#0f0f0f] border border-border rounded-lg p-3">
              <div className="text-sm text-sub-text mb-2">Account Balance:</div>
              <div className="flex justify-between text-xs">
                <span>SOL Balance:</span>
                <span className={balanceInfo.hasEnoughSol ? 'text-green-400' : 'text-red-400'}>
                  {balanceInfo.solBalance.toFixed(4)} SOL
                </span>
              </div>
              {balanceInfo.estimatedSolNeeded > 0 && (
                <div className="flex justify-between text-xs">
                  <span>SOL Needed:</span>
                  <span>{balanceInfo.estimatedSolNeeded.toFixed(4)} SOL</span>
                </div>
              )}
            </div>
          )}

          {/* Validation Error Display */}
          {validationError && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-200">{validationError}</div>
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="text-sm text-sub-text block mb-1">
              Amount ({pool?.name.split('-')[0].replace('WBTC', 'BTC')})
            </label>
            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.0"
                className="w-full bg-[#0f0f0f] border border-border rounded-lg p-3 text-white pr-16"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-secondary/30 px-2 py-1 rounded text-xs">
                {pool?.name.split('-')[0].replace('WBTC', 'BTC')}
              </div>
              {isCheckingBalance && (
                <div className="absolute right-16 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              )}
            </div>
          </div>

          {/* Auto-Fill Toggle */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoFill"
              checked={useAutoFill}
              onChange={(e) => setUseAutoFill(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="autoFill" className="text-sm text-sub-text">
              Auto-calculate balanced amount
            </label>
          </div>

          {/* Estimated Y Amount Display */}
          {useAutoFill && estimatedYAmount && (
            <div className="bg-[#0f0f0f] border border-border rounded-lg p-3">
              <div className="text-sm text-sub-text mb-1">
                Estimated {pool?.name.split('-')[1]} Amount:
              </div>
              <div className="text-white font-medium">
                {estimatedYAmount}
              </div>
            </div>
          )}

          {/* Existing Range Recommendations */}
          {rangeRecommendations && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-sub-text block mb-2">
                  💡 Recommended Ranges (Using Existing Bins - Lower Cost)
                </label>
                
                {isLoadingRanges ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
                    <span className="text-sm">Finding existing ranges...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Cheapest Option */}
                    <div 
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedRangeType === 'cheapest' 
                          ? 'border-green-500 bg-green-500/10' 
                          : 'border-border bg-[#0f0f0f]'
                      }`}
                      onClick={() => handleRangeTypeChange('cheapest')}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-green-400 text-sm flex items-center gap-1">
                            {rangeRecommendations.cheapest.label || '💰 Cheapest Option'}
                            {rangeRecommendations.cheapest.isPopular && <span className="text-xs">🔥</span>}
                          </div>
                          <div className="text-xs text-sub-text">
                            {rangeRecommendations.cheapest.description || 
                             `Width: ${rangeRecommendations.cheapest.width} bins • Cost: ${rangeRecommendations.cheapest.estimatedCost.toFixed(3)} SOL`}
                          </div>
                        </div>
                        {selectedRangeType === 'cheapest' && (
                          <CheckCircle className="h-4 w-4 text-green-400" />
                        )}
                      </div>
                    </div>

                    {/* Most Popular Option */}
                    <div 
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedRangeType === 'mostPopular' 
                          ? 'border-blue-500 bg-blue-500/10' 
                          : 'border-border bg-[#0f0f0f]'
                      }`}
                      onClick={() => handleRangeTypeChange('mostPopular')}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-blue-400 text-sm">
                            {rangeRecommendations.mostPopular.label || '🔥 Most Popular'}
                          </div>
                          <div className="text-xs text-sub-text">
                            {rangeRecommendations.mostPopular.description || 
                             `Width: ${rangeRecommendations.mostPopular.width} bins • ${rangeRecommendations.mostPopular.positionCount} positions • Cost: ${rangeRecommendations.mostPopular.estimatedCost.toFixed(3)} SOL`}
                          </div>
                        </div>
                        {selectedRangeType === 'mostPopular' && (
                          <CheckCircle className="h-4 w-4 text-blue-400" />
                        )}
                      </div>
                    </div>

                    {/* Balanced Option */}
                    <div 
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedRangeType === 'balanced' 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border bg-[#0f0f0f]'
                      }`}
                      onClick={() => handleRangeTypeChange('balanced')}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-primary text-sm">
                            {rangeRecommendations.balanced.label || '⚖️ Balanced'}
                          </div>
                          <div className="text-xs text-sub-text">
                            {rangeRecommendations.balanced.description || 
                             `Width: ${rangeRecommendations.balanced.width} bins • Good liquidity • Cost: ${rangeRecommendations.balanced.estimatedCost.toFixed(3)} SOL`}
                          </div>
                        </div>
                        {selectedRangeType === 'balanced' && (
                          <CheckCircle className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </div>

                    {/* Custom Option */}
                    <div 
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedRangeType === 'custom' 
                          ? 'border-yellow-500 bg-yellow-500/10' 
                          : 'border-border bg-[#0f0f0f]'
                      }`}
                      onClick={() => handleRangeTypeChange('custom')}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-yellow-400 text-sm">⚙️ Custom Range</div>
                          <div className="text-xs text-sub-text">
                            Set your own range (may cost more if bins don't exist)
                          </div>
                        </div>
                        {selectedRangeType === 'custom' && (
                          <CheckCircle className="h-4 w-4 text-yellow-400" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom Range Input (only show when custom is selected) */}
              {selectedRangeType === 'custom' && (
                <div>
                  <label className="text-sm text-sub-text block mb-1">
                    Custom Range Width (bins on each side)
                  </label>
                  <input
                    type="number"
                    value={rangeWidth}
                    onChange={(e) => setRangeWidth(e.target.value)}
                    min="1"
                    max="50"
                    className="w-full bg-[#0f0f0f] border border-border rounded-lg p-3 text-white"
                  />
                  <p className="text-xs text-yellow-400 mt-1">
                    ⚠️ Custom ranges may require creating new bins (additional ~0.15 SOL cost)
                  </p>
                </div>
              )}

              {/* Cost Summary */}
              <div className="bg-[#0f0f0f] border border-border rounded-lg p-3">
                <div className="text-sm text-sub-text mb-2">Position Cost Breakdown:</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Position Rent (refundable):</span>
                    <span className="text-green-400">0.057 SOL</span>
                  </div>
                  {selectedRangeType !== 'custom' && rangeRecommendations && (
                    <div className="flex justify-between">
                      <span>BinArray Cost (using existing):</span>
                      <span className="text-green-400">
                        {(rangeRecommendations[selectedRangeType].estimatedCost - 0.057).toFixed(3)} SOL
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
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
          <div>
            <label className="text-sm text-sub-text block mb-1">Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-border rounded-lg p-3 text-white"
            >
              <option value="Spot">Spot (Balanced Distribution)</option>
              <option value="BidAsk">BidAsk (Edge Concentration)</option>
              <option value="Curve">Curve (Center Concentration)</option>
            </select>
          </div>
          
          {/* Pool Information */}
          <div className="flex items-start gap-2 bg-[#0f0f0f] p-3 rounded-lg">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-sub-text">
              <p className="mb-1">Current price: ${pool?.currentPrice}</p>
              <p className="mb-1">Expected APY: {pool?.apy}</p>
              <p className="mb-1">Bin Step: {pool?.binStep}</p>
              <p className="mb-1">Pool: {pool?.address.slice(0, 8)}...</p>
              {selectedRangeType !== 'custom' && rangeRecommendations && (
                <p className="text-green-400">💡 Using existing price bins - saves on creation costs!</p>
              )}
            </div>
          </div>
        </div>
        
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
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
            className="bg-primary hover:bg-primary/80"
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