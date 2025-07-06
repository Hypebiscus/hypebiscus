// Enhanced AddLiquidityModal.tsx - Simplified for wrapped BTC only
// Conservative approach with one-sided positions only

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
}

interface BalanceInfo {
  solBalance: number;
  tokenBalance: number;
  hasEnoughSol: boolean;
  estimatedSolNeeded: number;
  shortfall?: number;
}

interface SimplifiedRangeOption {
  id: 'oneSided';
  label: string;
  description: string;
  icon: string;
  estimatedCost: number;
  isDefault?: boolean;
}

const AddLiquidityModal: React.FC<AddLiquidityModalProps> = ({ 
  isOpen, 
  onClose,
  pool 
}) => {
  const { publicKey, sendTransaction } = useWallet();
  const { service: dlmmService } = useMeteoraDlmmService();
  const { service: positionService } = useMeteoraPositionService();
  
  // Simplified state - only wrapped BTC amount needed
  const [btcAmount, setBtcAmount] = useState('');
  const [selectedOption, setSelectedOption] = useState<'oneSided'>('oneSided');
  const [isLoading, setIsLoading] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const [currentBinId, setCurrentBinId] = useState<number | null>(null);
  const [showPositionDetails, setShowPositionDetails] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

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

  // Simplified range options - only one-sided BTC positions
  const rangeOptions: SimplifiedRangeOption[] = [
    {
      id: 'oneSided',
      label: `⚡ One-Sided Position`, 
      description: `Single-token position • Only ${tokenX} needed • Earns when price rises • Conservative approach`,
      icon: '⚡',
      estimatedCost: 0.057, // Base position rent only
      isDefault: true
    }
  ];

  // Get current active bin on modal open
  useEffect(() => {
    if (isOpen && pool) {
      loadCurrentBin();
    }
  }, [isOpen, pool]);

  // Check balances when amount changes
  useEffect(() => {
    if (btcAmount && parseFloat(btcAmount) > 0 && publicKey && pool) {
      checkUserBalances();
    } else {
      setBalanceInfo(null);
      setValidationError('');
    }
  }, [btcAmount, publicKey, pool]);

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
    if (!publicKey || !pool || !btcAmount || parseFloat(btcAmount) <= 0) return;

    setIsCheckingBalance(true);
    setValidationError('');

    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
      );

      // Get SOL balance
      const solBalanceLamports = await connection.getBalance(publicKey);
      const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
      
      const btcAmountValue = parseFloat(btcAmount);
      
      // Calculate estimated SOL needed for one-sided position only
      let estimatedSolNeeded = 0.057 + 0.015; // Base position rent + transaction fees
      
      // Add buffer for potential binArray creation (conservative estimate)
      estimatedSolNeeded += 0.075; // One binArray creation cost
      
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
    if (!pool || !publicKey || !btcAmount || parseFloat(btcAmount) <= 0 || !currentBinId) return;

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
      
      // Create one-sided wrapped BTC position (above current price)
      const result = await positionService.createOneSidedPosition({
        poolAddress: pool.address,
        userPublicKey: publicKey,
        totalXAmount: bnAmount, // Wrapped BTC amount
        totalYAmount: new BN(0), // No SOL needed for liquidity
        minBinId: currentBinId + 1, // Start above current price
        maxBinId: currentBinId + 10, // 10 bins above current price
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
      
      const actualCost = result.estimatedCost?.total || 0.057;
      alert(`${tokenX}-only position created successfully! 

Position ID: ${result.positionKeypair.publicKey.toString().slice(0, 8)}...
Amount: ${btcAmount} ${tokenX}
Range: Bins ${currentBinId + 1} to ${currentBinId + 10} (above current price)
Cost: ${actualCost.toFixed(3)} SOL

Your ${tokenX} will earn fees when the price rises into your range.
This is a conservative, single-token approach perfect for upside exposure.`);
      
      onClose();
      setBtcAmount('');
      
    } catch (error) {
      console.error('Error adding liquidity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Enhanced error handling for common issues
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient lamports')) {
        alert(`Insufficient SOL balance detected. 

What you need SOL for:
• Position rent: 0.057 SOL (refundable when you close position)
• BinArray creation: ~0.075 SOL (one-time cost for new price ranges)  
• Transaction fees: ~0.015 SOL

Total needed: ~0.147 SOL minimum

This SOL is NOT used for liquidity - it's just for account creation and fees.
Your wrapped Bitcoin tokens (${tokenX}) provide the actual liquidity.

Please add more SOL to your wallet and try again.`);
      } else if (errorMessage.includes('Transaction simulation failed')) {
        alert('Transaction failed during simulation. This usually means insufficient funds or the selected price range requires expensive bin creation. Try again with more SOL.');
      } else {
        alert(`Error adding liquidity: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen && !!pool} onOpenChange={onClose}>
      <DialogContent className="bg-[#161616] border-border text-white max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-white text-xl">Add {tokenX} Liquidity</DialogTitle>
          <DialogDescription className="text-sm text-sub-text">
            Conservative wrapped Bitcoin liquidity - Single-token position above current price
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

          {/* Simplified Position Type Display */}
          <div className="space-y-4">
            <label className="text-sm text-sub-text block font-medium">
              💡 Conservative Position Strategy
            </label>
            
            <div className="grid gap-3">
              {rangeOptions.map((option) => (
                <div 
                  key={option.id}
                  className="p-4 border border-primary bg-primary/10 rounded-lg cursor-pointer"
                  onClick={() => setShowPositionDetails(!showPositionDetails)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{option.icon}</span>
                        <div className="font-medium text-primary text-sm">
                          {option.label}
                        </div>
                        <div className="px-2 py-1 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                          SELECTED
                        </div>
                      </div>
                      <div className="text-xs text-sub-text mb-2">
                        {option.description}
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span>Base Cost: {option.estimatedCost.toFixed(3)} SOL</span>
                        <span>Risk: Low</span>
                        <span>Strategy: Conservative</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                      {showPositionDetails ? (
                        <ChevronUp className="h-4 w-4 text-primary flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Position Details Explanation - Collapsible */}
          {showPositionDetails && (
            <div className="bg-[#0f0f0f] border border-border rounded-lg p-4 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 flex-shrink-0 mt-0.5 text-primary" />
                <div className="text-sm text-sub-text space-y-2">
                  <div>
                    <div className="font-medium text-white mb-2">One-Sided Position Details:</div>
                    <div>• Only {tokenX} required - no SOL for liquidity needed</div>
                    <div>• Position placed above current price ({currentBinId ? `bins ${currentBinId + 1}-${currentBinId + 10}` : 'loading...'})</div>
                    <div>• Earns fees when price rises into your range</div>
                    <div>• Conservative approach - lower capital requirement</div>
                    <div>• Perfect for {tokenX} holders who want upside exposure</div>
                    <div>• SOL only needed for account creation, not liquidity</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cost Breakdown - Collapsible */}
          <div className="bg-[#0f0f0f] border border-border rounded-lg">
            <div 
              className="p-4 cursor-pointer flex items-center justify-between"
              onClick={() => setShowCostBreakdown(!showCostBreakdown)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-sub-text font-medium">💰 Cost Breakdown</span>
                <span className="text-primary font-medium">~0.147 SOL</span>
              </div>
              {showCostBreakdown ? (
                <ChevronUp className="h-4 w-4 text-primary flex-shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" />
              )}
            </div>
            
            {showCostBreakdown && (
              <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-2 text-sm border-t border-border pt-4">
                  <div className="flex justify-between">
                    <span>Position Rent (refundable):</span>
                    <span className="text-green-400 font-medium">0.057 SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>BinArray Creation (if needed):</span>
                    <span className="text-yellow-400 font-medium">~0.075 SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transaction Fees:</span>
                    <span className="text-blue-400 font-medium">~0.015 SOL</span>
                  </div>
                  <div className="flex justify-between items-center font-medium border-t border-border pt-2 mt-2">
                    <span>Total Estimated:</span>
                    <span className="text-primary">~0.147 SOL</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-sub-text">
                  💡 BinArray cost is one-time per price range. Future positions in same range cost much less.
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
              `Add One-Sided Liquidity`
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