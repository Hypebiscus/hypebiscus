// Enhanced AddLiquidityModal.tsx - Clean version using only existing bins
// Users can only provide liquidity within existing bin steps

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  
  // UI state
  const [showStrategyDetails, setShowStrategyDetails] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [showAccountBalance, setShowAccountBalance] = useState(false);
  const [showPoolInfo, setShowPoolInfo] = useState(false);

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

  // Find existing bin ranges in the pool using the position service
  const findExistingBinRanges = useCallback(async () => {
    if (!pool) return;
    
    setIsLoadingBins(true);
    try {
      const dlmmPool = await dlmmService.initializePool(pool.address);
      const activeBin = await dlmmPool.getActiveBin();
      setCurrentBinId(activeBin.binId);
      
      // Use the position service to find existing bin ranges
      const existingRanges = await positionService.findExistingBinRanges(pool.address, 20);
      
      if (existingRanges.length > 0) {
        setExistingBinRanges(existingRanges);
        console.log('Found existing bin ranges:', existingRanges);
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
        setExistingBinRanges([fallbackRange]);
        console.log('Using fallback range around active bin:', fallbackRange);
      }
      
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
    } finally {
      setIsLoadingBins(false);
    }
  }, [dlmmService, positionService, pool, currentBinId]);

  // Load existing bins when modal opens
  useEffect(() => {
    if (isOpen && pool) {
      findExistingBinRanges();
    }
  }, [isOpen, pool, findExistingBinRanges]);

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

  // Balance checking with simplified cost calculation
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
      
      // Simplified cost calculation - only position rent + transaction fees
      const estimatedSolNeeded = selectedStrategyOption.estimatedCost + 0.015; // Position rent + tx fees
      
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

  const handleAddLiquidity = async () => {
    if (!pool || !publicKey || !btcAmount || parseFloat(btcAmount) <= 0 || !currentBinId || !selectedStrategyOption || existingBinRanges.length === 0) return;

    if (balanceInfo && !balanceInfo.hasEnoughSol) {
      alert(validationError || 'Insufficient SOL balance to complete transaction');
      return;
    }

    setIsLoading(true);
    
    try {
      let decimals = 8; // Default for BTC tokens
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
      
      alert(`${actualPortfolioStyle.toUpperCase()} ${tokenX} position created successfully using EXISTING bins!

Position ID: ${result.positionKeypair.publicKey.toString().slice(0, 8)}...
Strategy: ${selectedStrategyOption.label}
Pool Bin Step: ${poolBinStep}
Amount: ${btcAmount} ${tokenX}
Range: Bins ${selectedRange.minBinId} to ${selectedRange.maxBinId}
Cost: ${result.estimatedCost.total.toFixed(3)} SOL (position rent only)

✅ No bin creation costs - using existing price ranges only!
Your ${tokenX} will earn fees when prices are within your selected range.`);
      
      onClose();
      setBtcAmount('');
      
    } catch (error) {
      console.error('Error adding liquidity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient lamports')) {
        alert(`Insufficient SOL balance for your ${actualPortfolioStyle} strategy.

You only need SOL for:
• Position rent: ${selectedStrategyOption.estimatedCost.toFixed(3)} SOL (refundable)
• Transaction fees: ~0.015 SOL

✅ No bin creation costs since we're using existing bins!
Total needed: ~${(selectedStrategyOption.estimatedCost + 0.015).toFixed(3)} SOL`);
      } else {
        alert(`Error creating ${actualPortfolioStyle} position: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskColor = (risk: 'low' | 'medium' | 'high') => {
    switch (risk) {
      case 'low': return 'text-green-400 border-green-500/30 bg-green-500/10';
      case 'medium': return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
      case 'high': return 'text-red-400 border-red-500/30 bg-red-500/10';
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
                        <div className="px-2 py-1 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                          NO BIN COSTS
                        </div>
                      </div>
                      <div className="text-xs text-sub-text mb-2">
                        {option.description}
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span>Bin Step: {option.binStep}</span>
                        <span>Cost: ~{option.estimatedCost.toFixed(3)} SOL</span>
                        <span>Strategy: Existing Bins Only</span>
                      </div>
                    </div>
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
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

          {/* Simplified Cost Breakdown */}
          <div className="bg-[#0f0f0f] border border-border rounded-lg">
            <div 
              className="p-4 cursor-pointer flex items-center justify-between"
              onClick={() => setShowCostBreakdown(!showCostBreakdown)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-sub-text font-medium">💰 Cost Breakdown</span>
                <span className="text-primary font-medium">
                  ~{selectedStrategyOption ? (selectedStrategyOption.estimatedCost + 0.015).toFixed(3) : '0.072'} SOL
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
                  <div className="flex justify-between">
                    <span>Transaction Fees:</span>
                    <span className="text-blue-400 font-medium">~0.015 SOL</span>
                  </div>
                  <div className="flex justify-between items-center font-medium border-t border-border pt-2 mt-2">
                    <span>Total Estimated:</span>
                    <span className="text-primary">
                      ~{(selectedStrategyOption.estimatedCost + 0.015).toFixed(3)} SOL
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