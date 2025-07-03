"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Info } from "lucide-react";
import { useWallet } from '@solana/wallet-adapter-react';
import { useMeteoraDlmmService } from "@/lib/meteora/meteoraDlmmService";
import { useMeteoraPositionService } from "@/lib/meteora/meteoraPositionService";
import { BN } from 'bn.js';
import { StrategyType } from '@meteora-ag/dlmm';
import { FormattedPool } from '@/lib/utils/poolUtils';

interface AddLiquidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: FormattedPool | null;
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
  
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value) || value === '') {
      setAmount(value);
      // Calculate estimated Y amount when X amount changes
      calculateEstimatedYAmount(value);
    }
  };
  
  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRangeWidth(e.target.value);
    // Recalculate Y amount when range changes
    if (amount) {
      calculateEstimatedYAmount(amount);
    }
  };
  
  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStrategy(e.target.value);
    // Recalculate Y amount when strategy changes
    if (amount) {
      calculateEstimatedYAmount(amount);
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

  /**
   * Calculate estimated Y amount using the SDK helper function
   */
  const calculateEstimatedYAmount = async (xAmount: string) => {
    if (!pool || !xAmount || parseFloat(xAmount) <= 0 || !useAutoFill) {
      setEstimatedYAmount('');
      return;
    }

    try {
      // Get active bin information
      const activeBin = await dlmmService.getActiveBin(pool.address);
      
      // Convert amount to lamports (assuming 9 decimals for most tokens)
      const decimals = 9;
      const bnAmount = new BN(parseFloat(xAmount) * Math.pow(10, decimals));
      
      // Set bin range based on user input
      const rangeWidthNum = parseInt(rangeWidth);
      const minBinId = activeBin.binId - rangeWidthNum;
      const maxBinId = activeBin.binId + rangeWidthNum;
      
      // Calculate balanced Y amount using SDK helper
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
      
      // Convert back to human readable format
      const estimatedYFormatted = (estimatedY.toNumber() / Math.pow(10, decimals)).toFixed(6);
      setEstimatedYAmount(estimatedYFormatted);
      
    } catch (error) {
      console.error('Error calculating estimated Y amount:', error);
      setEstimatedYAmount('Auto-calculation failed');
    }
  };
  
  const handleAddLiquidity = async () => {
    if (!pool || !publicKey || !amount || parseFloat(amount) <= 0) return;
    
    setIsLoading(true);
    
    try {
      // Get active bin information
      const activeBin = await dlmmService.getActiveBin(pool.address);
      
      // Set bin range based on user input
      const rangeWidthNum = parseInt(rangeWidth);
      const minBinId = activeBin.binId - rangeWidthNum;
      const maxBinId = activeBin.binId + rangeWidthNum;
      
      // Convert amount to lamports (assuming 9 decimals)
      const decimals = 9;
      const bnAmount = new BN(parseFloat(amount) * Math.pow(10, decimals));
      
      // Create new position with improved parameters
      const { transaction, positionKeypair } = await positionService.createBalancedPosition({
        poolAddress: pool.address,
        userPublicKey: publicKey,
        totalXAmount: bnAmount,
        minBinId,
        maxBinId,
        strategyType: getStrategyType(),
        useAutoFill: useAutoFill
      });
      
      // Handle transaction array properly
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
      
      // Show success message
      alert(`Liquidity added successfully! Position: ${positionKeypair.publicKey.toString().slice(0, 8)}...`);
      
      // Close modal and reset form
      onClose();
      setAmount('');
      setEstimatedYAmount('');
      setRangeWidth('10');
      setStrategy('Spot');
      
    } catch (error) {
      console.error('Error adding liquidity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error adding liquidity: ${errorMessage}`);
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
              onChange={handleRangeChange}
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
              onChange={handleStrategyChange}
              className="w-full bg-[#0f0f0f] border border-border rounded-lg p-3 text-white"
            >
              <option value="Spot">Spot (Balanced Distribution)</option>
              <option value="BidAsk">BidAsk (Edge Concentration)</option>
              <option value="Curve">Curve (Center Concentration)</option>
            </select>
            <div className="text-xs text-sub-text mt-1">
              {strategy === 'Spot' && 'Uniform distribution suitable for any market conditions'}
              {strategy === 'BidAsk' && 'Concentrates liquidity at range edges for volatility capture'}
              {strategy === 'Curve' && 'Concentrates liquidity in the center for maximum efficiency'}
            </div>
          </div>
          
          {/* Pool Information */}
          <div className="flex items-start gap-2 bg-[#0f0f0f] p-3 rounded-lg">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-sub-text">
              <p className="mb-1">Current price: ${pool?.currentPrice}</p>
              <p className="mb-1">Expected APY: {pool?.apy}</p>
              <p className="mb-1">Bin Step: {pool?.binStep}</p>
              <p className="mb-1">Pool: {pool?.address.slice(0, 8)}...</p>
              {useAutoFill && (
                <p className="text-primary">Using SDK auto-fill for balanced positions</p>
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
            disabled={!amount || parseFloat(amount) <= 0 || isLoading}
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