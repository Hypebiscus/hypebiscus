// Enhanced AddLiquidityModal.tsx - Uses user's portfolio style and pool's actual bin step
// Dynamic strategy based on user's previous selection and pool characteristics

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Info, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useWallet } from '@solana/wallet-adapter-react';
import { useMeteoraDlmmService } from "@/lib/meteora/meteoraDlmmService";
import { useMeteoraPositionService } from "@/lib/meteora/meteoraPositionService";
import { BN } from 'bn.js';
import { StrategyType } from '@meteora-ag/dlmm';
import { FormattedPool } from '@/lib/utils/poolUtils';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';

interface AddLiquidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: FormattedPool | null;
  userPortfolioStyle?: string | null; // Accept both string and null from ChatBox
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
  icon: string;
  binStep: number; // Use pool's actual bin step
  estimatedCost: number;
  riskLevel: 'low' | 'medium' | 'high';
  portfolioStyle: string; // Use user's actual portfolio style
  isDefault?: boolean;
  strategy: 'oneSided' | 'balanced' | 'ranged';
}

const AddLiquidityModal: React.FC<AddLiquidityModalProps> = ({ 
  isOpen, 
  onClose,
  pool,
  userPortfolioStyle = 'conservative' // Handle null by defaulting to conservative
}) => {
  // Convert null to conservative for internal use
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

  const { tokenX, tokenY } = getTokenNames();

  // Get pool's actual bin step
  const poolBinStep = useMemo(() => {
    if (!pool || !pool.binStep || pool.binStep === 'N/A') return 10; // fallback
    return parseInt(pool.binStep);
  }, [pool]);

  // Determine risk level based on bin step
  const getRiskLevelFromBinStep = (binStep: number): 'low' | 'medium' | 'high' => {
    if (binStep >= 50) return 'low';
    if (binStep >= 10) return 'medium';
    return 'high';
  };

  // Get portfolio style icon and description
  const getPortfolioStyleInfo = (style: string) => {
    switch (style.toLowerCase()) {
      case 'conservative':
        return { icon: '🛡️', label: 'Conservative', color: 'text-green-400' };
      case 'moderate':
        return { icon: '📊', label: 'Moderate', color: 'text-yellow-400' };
      case 'aggressive':
        return { icon: '🚀', label: 'Aggressive', color: 'text-red-400' };
      default:
        return { icon: '⚖️', label: 'Balanced', color: 'text-blue-400' };
    }
  };

  // Dynamic strategy options based on user's portfolio style and pool's bin step
  const strategyOptions: StrategyOption[] = useMemo(() => {
    const riskLevel = getRiskLevelFromBinStep(poolBinStep);
    const styleInfo = getPortfolioStyleInfo(actualPortfolioStyle);
    
    // Base cost estimation based on bin step
    const baseCost = poolBinStep <= 5 ? 0.120 : 
                    poolBinStep <= 15 ? 0.075 : 
                    0.057;

    // Only show the user's selected strategy - no confusing alternatives
    return [
      {
        id: 'oneSided-primary',
        label: `${styleInfo.icon} One-Sided`, 
        description: `Perfect for your ${actualPortfolioStyle} investment approach with this pool's characteristics`,
        icon: styleInfo.icon,
        binStep: poolBinStep,
        estimatedCost: baseCost,
        riskLevel,
        portfolioStyle: actualPortfolioStyle,
        strategy: 'oneSided',
        isDefault: true
      }
    ];
  }, [actualPortfolioStyle, poolBinStep, tokenX]);

  // Set default strategy on load
  useEffect(() => {
    if (strategyOptions.length > 0 && !selectedStrategy) {
      setSelectedStrategy(strategyOptions[0].id);
    }
  }, [strategyOptions, selectedStrategy]);

  // Get selected strategy details
  const selectedStrategyOption = strategyOptions.find(opt => opt.id === selectedStrategy);

  // Get current active bin on modal open
  useEffect(() => {
    if (isOpen && pool) {
      loadCurrentBin();
    }
  }, [isOpen, pool]);

  // Check balances when amount or strategy changes
  useEffect(() => {
    if (btcAmount && parseFloat(btcAmount) > 0 && publicKey && pool && selectedStrategyOption) {
      checkUserBalances();
    } else {
      setBalanceInfo(null);
      setValidationError('');
    }
  }, [btcAmount, publicKey, pool, selectedStrategyOption]);

  const loadCurrentBin = async () => {
    if (!pool) return;
    
    try {
      const dlmmPool = await dlmmService.initializePool(pool.address);
      const activeBin = await dlmmPool.getActiveBin();
      setCurrentBinId(activeBin.binId);
      console.log('Current active bin ID:', activeBin.binId);
    } catch (error) {
      console.error('Error loading current bin:', error);
    }
  };

  const checkUserBalances = async () => {
    if (!publicKey || !pool || !btcAmount || parseFloat(btcAmount) <= 0 || !selectedStrategyOption) return;

    setIsCheckingBalance(true);
    setValidationError('');

    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
      );

      // Get SOL balance
      const solBalanceLamports = await connection.getBalance(publicKey);
      const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
      
      // Calculate estimated SOL needed based on actual bin step
      let estimatedSolNeeded = selectedStrategyOption.estimatedCost + 0.015; // Base cost + transaction fees
      
      // Add buffer for potential binArray creation based on actual bin step
      // Smaller bin steps might need more binArrays
      const binArrayBuffer = poolBinStep <= 5 ? 0.150 :   // High precision might need more bins
                           poolBinStep <= 15 ? 0.075 :     // Standard case
                           0.057;                           // Conservative, likely existing bins
      
      estimatedSolNeeded += binArrayBuffer;
      
      const hasEnoughSol = solBalance >= estimatedSolNeeded;
      const shortfall = hasEnoughSol ? 0 : estimatedSolNeeded - solBalance;

      const balanceInfo: BalanceInfo = {
        solBalance,
        tokenBalance: 0, // TODO: Implement wrapped BTC balance checking
        hasEnoughSol,
        estimatedSolNeeded,
        shortfall
      };

      setBalanceInfo(balanceInfo);

      // Set validation errors
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
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value) || value === '') {
      setBtcAmount(value);
    }
  };

  const handleAddLiquidity = async () => {
    if (!pool || !publicKey || !btcAmount || parseFloat(btcAmount) <= 0 || !currentBinId || !selectedStrategyOption) return;

    // Enhanced validation
    if (balanceInfo && !balanceInfo.hasEnoughSol) {
      alert(validationError || 'Insufficient SOL balance to complete transaction');
      return;
    }

    setIsLoading(true);
    
    try {
      // Determine decimals based on token type
      let decimals = 8; // Default for most BTC tokens
      
      // Special handling for different wrapped BTC tokens
      if (tokenX.toLowerCase().includes('wbtc')) {
        decimals = 8; // wBTC uses 8 decimals
      } else if (tokenX.toLowerCase().includes('zbtc')) {
        decimals = 8; // zBTC uses 8 decimals  
      } else if (tokenX.toLowerCase().includes('cbbtc')) {
        decimals = 8; // cbBTC uses 8 decimals
      }
      
      const bnAmount = new BN(parseFloat(btcAmount) * Math.pow(10, decimals));
      
      // Calculate bin range based on pool's actual bin step and user's strategy
      let minBinId: number;
      let maxBinId: number;
      
      // Adjust range based on actual bin step - simpler since we only have one strategy
      const rangeWidth = Math.max(3, Math.floor(15 / Math.sqrt(poolBinStep))); 
      
      // For one-sided positions, place above current price
      minBinId = currentBinId + 1;
      maxBinId = currentBinId + rangeWidth;
      
      console.log(`Creating ${userPortfolioStyle} one-sided position with pool's bin step:`, {
        poolBinStep,
        userStyle: userPortfolioStyle,
        range: `${minBinId} to ${maxBinId}`,
        rangeWidth,
        amount: btcAmount,
        token: tokenX
      });
      
      // Create one-sided position using pool's actual parameters
      const result = await positionService.createOneSidedPosition({
        poolAddress: pool.address,
        userPublicKey: publicKey,
        totalXAmount: bnAmount, // Wrapped BTC amount
        totalYAmount: new BN(0), // No SOL needed for liquidity
        minBinId,
        maxBinId,
        strategyType: StrategyType.Spot,
        useAutoFill: false
      }, true); // true = providing token X (wrapped BTC)
      
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
      
      const actualCost = result.estimatedCost?.total || selectedStrategyOption.estimatedCost;
      const riskDescription = selectedStrategyOption.riskLevel === 'high' ? 'high precision, active monitoring recommended' :
                             selectedStrategyOption.riskLevel === 'medium' ? 'balanced approach, moderate monitoring' :
                             'stable and conservative, minimal monitoring needed';
      
              alert(`${actualPortfolioStyle.toUpperCase()} ${tokenX}-only position created successfully! 

Position ID: ${result.positionKeypair.publicKey.toString().slice(0, 8)}...
Your Strategy: ${selectedStrategyOption.label}
Pool's Bin Step: ${poolBinStep} (${riskDescription})
Amount: ${btcAmount} ${tokenX}
Range: Bins ${minBinId} to ${maxBinId} (above current price)
Cost: ${actualCost.toFixed(3)} SOL

Your ${tokenX} will earn fees when the price rises into your range.
This position matches your ${actualPortfolioStyle} investment profile perfectly!`);
      
      onClose();
      setBtcAmount('');
      
    } catch (error) {
      console.error('Error adding liquidity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Enhanced error handling with bin step context
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient lamports')) {
        alert(`Insufficient SOL balance for your ${actualPortfolioStyle} strategy. 

This pool uses bin step ${poolBinStep}:
${poolBinStep <= 5 ? '• Very high precision (0.05% per bin) - may require more binArray creation' : ''}
${poolBinStep <= 15 && poolBinStep > 5 ? '• Standard precision - balanced cost and efficiency' : ''}
${poolBinStep >= 50 ? '• Conservative precision - usually uses existing bins, lower cost' : ''}

What you need SOL for:
• Position rent: ${selectedStrategyOption.estimatedCost.toFixed(3)} SOL (refundable)
• BinArray creation: varies by bin step complexity
• Transaction fees: ~0.015 SOL

Please add more SOL to your wallet and try again.`);
      } else if (errorMessage.includes('Transaction simulation failed')) {
        alert(`Transaction failed for bin step ${poolBinStep} pool. This could be due to:

1. Insufficient funds for this precision level
2. The selected price range requires expensive bin creation
3. Network congestion

Bin step ${poolBinStep} characteristics:
${poolBinStep <= 5 ? '• Very high precision - requires more SOL for bin creation' : ''}
${poolBinStep <= 15 && poolBinStep > 5 ? '• Standard precision - moderate SOL requirements' : ''}
${poolBinStep >= 50 ? '• Conservative precision - minimal SOL requirements' : ''}

Try again with more SOL.`);
      } else {
        alert(`Error creating ${actualPortfolioStyle} position: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Get risk color for UI
  const getRiskColor = (risk: 'low' | 'medium' | 'high') => {
    switch (risk) {
      case 'low': return 'text-green-400 border-green-500/30 bg-green-500/10';
      case 'medium': return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
      case 'high': return 'text-red-400 border-red-500/30 bg-red-500/10';
    }
  };

  // Get bin step description
  const getBinStepDescription = (binStep: number) => {
    if (binStep <= 5) return 'Very high precision (0.05% increments) - maximum fee capture but higher volatility';
    if (binStep <= 15) return 'Standard precision (0.1-1.5% increments) - good balance of fees and stability';
    return 'Conservative precision (5%+ increments) - very stable, lower but consistent returns';
  };
  
  return (
    <Dialog open={isOpen && !!pool} onOpenChange={onClose}>
      <DialogContent className="bg-[#161616] border-border text-white max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-white text-xl">Add {tokenX} Liquidity</DialogTitle>
          <DialogDescription className="text-sm text-sub-text">
            Using your {actualPortfolioStyle} strategy with this pool's bin step {poolBinStep}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-6">
          {/* Pool Information - Collapsible */}
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
                    <span>Your Style:</span>
                    <span className={`font-medium ${getPortfolioStyleInfo(actualPortfolioStyle).color}`}>
                      {getPortfolioStyleInfo(actualPortfolioStyle).icon} {getPortfolioStyleInfo(actualPortfolioStyle).label}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span>Risk Level:</span>
                    <span className={`px-2 py-1 rounded text-xs border ${getRiskColor(getRiskLevelFromBinStep(poolBinStep))}`}>
                      {getRiskLevelFromBinStep(poolBinStep).toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Balance Display - Collapsible */}
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

          {/* Validation Error Display */}
          {validationError && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-200">{validationError}</div>
            </div>
          )}

          {/* Wrapped BTC Amount Input */}
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

          {/* Strategy Selection - Now shows only your chosen strategy */}
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
                        <span className="text-lg">{option.icon}</span>
                        <div className="font-medium text-white text-sm">
                          {option.label}
                        </div>
                        <div className="px-2 py-1 rounded-full text-xs bg-primary/20 text-primary border border-primary/30">
                          YOUR STYLE
                        </div>
                      </div>
                      <div className="text-xs text-sub-text mb-2">
                        {option.description}
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span>Bin Step: {option.binStep}</span>
                        <span>Cost: ~{option.estimatedCost.toFixed(3)} SOL</span>
                        <span>Strategy: One-sided {tokenX}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Strategy Details Explanation */}
          {selectedStrategyOption && (
            <div className="bg-[#0f0f0f] border border-border rounded-lg">
              <div 
                className="p-4 cursor-pointer flex items-center justify-between"
                onClick={() => setShowStrategyDetails(!showStrategyDetails)}
              >
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 flex-shrink-0 text-primary" />
                  <span className="text-sm text-sub-text font-medium">
                    Strategy Details (Bin Step {poolBinStep})
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
                      <div className="font-medium text-white mb-2">Your Position Details:</div>
                      <div>• Bin Step {poolBinStep}: {getBinStepDescription(poolBinStep)}</div>
                      <div>• Portfolio Style: {actualPortfolioStyle.toUpperCase()} - matches your risk preference</div>
                      <div>• Position Type: One-sided {tokenX} only</div>
                      <div>• Placement: Above current price (earns when price rises)</div>
                      <div>• Range: Dynamically calculated based on bin step efficiency</div>
                      <div>• Perfect Match: This pool's characteristics align with your {actualPortfolioStyle} strategy</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cost Breakdown */}
          <div className="bg-[#0f0f0f] border border-border rounded-lg">
            <div 
              className="p-4 cursor-pointer flex items-center justify-between"
              onClick={() => setShowCostBreakdown(!showCostBreakdown)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-sub-text font-medium">💰 Cost Breakdown</span>
                <span className="text-primary font-medium">
                  ~{selectedStrategyOption ? (selectedStrategyOption.estimatedCost + (poolBinStep <= 5 ? 0.150 : poolBinStep <= 15 ? 0.075 : 0.057) + 0.015).toFixed(3) : '0.147'} SOL
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
                    <span>BinArray Creation (bin step {poolBinStep}):</span>
                    <span className="text-yellow-400 font-medium">
                      ~{(poolBinStep <= 5 ? 0.150 : poolBinStep <= 15 ? 0.075 : 0.057).toFixed(3)} SOL
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transaction Fees:</span>
                    <span className="text-blue-400 font-medium">~0.015 SOL</span>
                  </div>
                  <div className="flex justify-between items-center font-medium border-t border-border pt-2 mt-2">
                    <span>Total Estimated:</span>
                    <span className="text-primary">
                      ~{(selectedStrategyOption.estimatedCost + (poolBinStep <= 5 ? 0.150 : poolBinStep <= 15 ? 0.075 : 0.057) + 0.015).toFixed(3)} SOL
                    </span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-sub-text">
                  💡 {poolBinStep <= 5 ? 'High precision bin step may require creating new price bins.' : 
                      poolBinStep >= 50 ? 'Conservative bin step often uses existing bins, saving costs.' :
                      'This bin step provides a good balance of cost and precision.'}
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
              (balanceInfo ? !balanceInfo.hasEnoughSol : false)
            }
            className="bg-primary hover:bg-primary/80 w-full sm:w-auto order-1 sm:order-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Position...
              </>
            ) : (
              `Create ${actualPortfolioStyle} Position`
            )}
          </Button>
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isLoading}
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