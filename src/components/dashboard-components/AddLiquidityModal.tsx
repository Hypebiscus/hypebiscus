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

interface Pool {
  name: string;
  address: string;
  liquidity: string;
  currentPrice: string;
  apy: string;
  fees24h: string;
  volume24h: string;
}

interface AddLiquidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: Pool | null;
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
  const [rangeWidth, setRangeWidth] = useState('10'); // Default to 10 bins on each side
  const [isLoading, setIsLoading] = useState(false);
  const [strategy, setStrategy] = useState<string>('Spot'); // Default to Spot strategy
  
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers and decimal points
    const value = e.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value) || value === '') {
      setAmount(value);
    }
  };
  
  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRangeWidth(e.target.value);
  };
  
  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStrategy(e.target.value);
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
    
    setIsLoading(true);
    
    try {
      // Get active bin information
      const activeBin = await dlmmService.getActiveBin(pool.address);
      
      // Set bin range based on user input
      const rangeWidthNum = parseInt(rangeWidth);
      const minBinId = activeBin.binId - rangeWidthNum;
      const maxBinId = activeBin.binId + rangeWidthNum;
      
      // Convert amount to lamports/smallest unit (example: assumes 9 decimals)
      const decimals = 9; // This should be fetched from the token metadata
      const bnAmount = new BN(parseFloat(amount) * Math.pow(10, decimals));
      
      // Create new position with the specified strategy
      const { transaction, positionKeypair } = await positionService.createBalancedPosition({
        poolAddress: pool.address,
        userPublicKey: publicKey,
        totalXAmount: bnAmount,
        totalYAmount: new BN(0), // Let the strategy calculate Y amount
        minBinId,
        maxBinId,
        strategyType: getStrategyType()
      });
      
      // Send transaction
      await sendTransaction(transaction, dlmmService.connection, {
        signers: [positionKeypair]
      });
      
      // Show success message or toast
      alert('Liquidity added successfully!');
      
      // Close modal
      onClose();
    } catch (error) {
      console.error('Error adding liquidity:', error);
      alert(`Error adding liquidity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen && !!pool} onOpenChange={onClose}>
      <DialogContent className="bg-[#161616] border-border text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Add Liquidity to {pool?.name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm text-sub-text block mb-1">Amount</label>
            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.0"
                className="w-full bg-[#0f0f0f] border border-border rounded-lg p-2 text-white"
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-secondary/30 px-2 py-1 rounded text-xs">
                {pool?.name.split('-')[0].replace('WBTC', 'BTC')}
              </div>
            </div>
          </div>
          
          <div>
            <label className="text-sm text-sub-text block mb-1">Price Range Width (bins on each side)</label>
            <input
              type="number"
              value={rangeWidth}
              onChange={handleRangeChange}
              min="1"
              max="50"
              className="w-full bg-[#0f0f0f] border border-border rounded-lg p-2 text-white"
            />
            <p className="text-xs text-sub-text mt-1">
              A wider range is more resilient to price movements but less capital efficient
            </p>
          </div>
          
          <div>
            <label className="text-sm text-sub-text block mb-1">Strategy</label>
            <select
              value={strategy}
              onChange={handleStrategyChange}
              className="w-full bg-[#0f0f0f] border border-border rounded-lg p-2 text-white"
            >
              <option value="Spot">Spot (Balanced)</option>
              <option value="BidAsk">BidAsk (Tilted)</option>
              <option value="Curve">Curve (Normal Distribution)</option>
            </select>
            <p className="text-xs text-sub-text mt-1">
              Different strategies distribute liquidity in different ways
            </p>
          </div>
          
          <div className="flex items-start gap-2 bg-[#0f0f0f] p-3 rounded-lg">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-sub-text">
              <p className="mb-1">Current price: ${pool?.currentPrice}</p>
              <p className="mb-1">Expected APY: {pool?.apy}%</p>
              <p>Pool address: {pool?.address}</p>
            </div>
          </div>
        </div>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handleAddLiquidity} 
            disabled={!amount || parseFloat(amount) <= 0 || isLoading}
            className="bg-primary"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Add Liquidity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddLiquidityModal;