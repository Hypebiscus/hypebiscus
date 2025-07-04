// Enhanced AddLiquidityModal.tsx with proper balance validation

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Info, AlertTriangle } from "lucide-react";
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
  hasEnoughToken: boolean;
  estimatedSolNeeded: number;
  estimatedTokenNeeded: number;
}

const AddLiquidityModal: React.FC<AddLiquidityModalProps> = ({ 
  isOpen, 
  onClose,
  pool 
}) => {
  const { publicKey, sendTransaction } = useWallet();
  const { service: dlmmService } = useMeteoraDlmmService();
  const { service: positionService } = useMeteoraPositionService();
  
  const [amount, setAmount] = useState('');
  const [rangeWidth, setRangeWidth] = useState('10');
  const [isLoading, setIsLoading] = useState(false);
  const [strategy, setStrategy] = useState<string>('Spot');
  const [useAutoFill, setUseAutoFill] = useState(true);
  const [estimatedYAmount, setEstimatedYAmount] = useState<string>('');
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

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
      const estimatedSolNeeded = amountValue + 0.01; // Add 0.01 SOL buffer for fees
      
      // Get estimated Y amount for balanced position
      let estimatedYValue = 0;
      if (useAutoFill && estimatedYAmount) {
        estimatedYValue = parseFloat(estimatedYAmount);
      }

      // Determine if it's a SOL pair
      const isSOLPair = pool.name.toLowerCase().includes('sol');
      const tokenSymbol = pool.name.split('-')[0]; // e.g., 'zBTC' from 'zBTC-SOL'

      // For SOL pairs, we need SOL + the other token
      const hasEnoughSol = solBalance >= estimatedSolNeeded;
      
      // TODO: Add token balance checking logic here
      // This would require fetching the user's token accounts
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
        setValidationError(
          `Insufficient SOL balance. You need ${estimatedSolNeeded.toFixed(4)} SOL but only have ${solBalance.toFixed(4)} SOL.`
        );
      } else if (!hasEnoughToken && !isSOLPair) {
        setValidationError(
          `Insufficient ${tokenSymbol} balance. Please check your ${tokenSymbol} holdings.`
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

  const handleAddLiquidity = async () => {
    if (!pool || !publicKey || !amount || parseFloat(amount) <= 0) return;

    // Validate balances before proceeding
    if (balanceInfo && (!balanceInfo.hasEnoughSol || !balanceInfo.hasEnoughToken)) {
      alert(validationError || 'Insufficient balance to complete transaction');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const activeBin = await dlmmService.getActiveBin(pool.address);
      const rangeWidthNum = parseInt(rangeWidth);
      const minBinId = activeBin.binId - rangeWidthNum;
      const maxBinId = activeBin.binId + rangeWidthNum;
      const decimals = 9;
      const bnAmount = new BN(parseFloat(amount) * Math.pow(10, decimals));
      
      const { transaction, positionKeypair } = await positionService.createBalancedPosition({
        poolAddress: pool.address,
        userPublicKey: publicKey,
        totalXAmount: bnAmount,
        minBinId,
        maxBinId,
        strategyType: getStrategyType(),
        useAutoFill: useAutoFill
      });
      
      if (Array.isArray(transaction)) {
        for (const tx of transaction) {
          const signature = await sendTransaction(tx, dlmmService.connection, {
            signers: [positionKeypair]
          });
          console.log('Transaction signature:', signature);
        }
      } else {
        const signature = await sendTransaction(transaction, dlmmService.connection, {
          signers: [positionKeypair]
        });
        console.log('Transaction signature:', signature);
      }
      
      alert(`Liquidity added successfully! Position: ${positionKeypair.publicKey.toString().slice(0, 8)}...`);
      onClose();
      setAmount('');
      setEstimatedYAmount('');
      setRangeWidth('10');
      setStrategy('Spot');
      
    } catch (error) {
      console.error('Error adding liquidity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Provide user-friendly error messages
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
      <DialogContent className="bg-[#161616] border-border text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add Liquidity to {pool?.name}</DialogTitle>
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
          
          {/* Range Width */}
          <div>
            <label className="text-sm text-sub-text block mb-1">
              Price Range Width (bins on each side)
            </label>
            <input
              type="number"
              value={rangeWidth}
              onChange={(e) => setRangeWidth(e.target.value)}
              min="1"
              max="50"
              className="w-full bg-[#0f0f0f] border border-border rounded-lg p-3 text-white"
            />
            <p className="text-xs text-sub-text mt-1">
              Wider range = more resilient to price movements but less capital efficient
            </p>
          </div>
          
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