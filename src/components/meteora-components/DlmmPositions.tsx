"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Minus, BarChart } from "lucide-react";
import { useMeteoraDlmmService, DlmmPositionInfo } from "@/lib/meteora/meteoraDlmmService";
import { useMeteoraPositionService } from "@/lib/meteora/meteoraPositionService";
import { BN } from 'bn.js';
import { StrategyType } from '@meteora-ag/dlmm';
import { useWallet } from '@solana/wallet-adapter-react';

const DlmmPositions = () => {
  const { service: dlmmService, publicKey } = useMeteoraDlmmService();
  const { service: positionService, sendTransaction } = useMeteoraPositionService();
  const { connected } = useWallet();
  
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<DlmmPositionInfo[]>([]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch user positions for a specific pool
  const fetchPositions = async (poolAddress: string) => {
    if (!publicKey || !connected) return;
    
    setLoading(true);
    setSelectedPool(poolAddress);
    
    try {
      const userPositions = await dlmmService.getUserPositions(poolAddress, publicKey);
      setPositions(userPositions);
    } catch (error) {
      console.error("Error fetching positions:", error);
    } finally {
      setLoading(false);
    }
  };

  // Add liquidity to a position
  const handleAddLiquidity = async (positionPubkey: string) => {
    if (!publicKey || !selectedPool) return;
    
    setActionLoading(true);
    
    try {
      // Get active bin information
      const activeBin = await dlmmService.getActiveBin(selectedPool);
      
      // Setup parameters for adding liquidity
      // This is a simplified example, in a real application you would get these values from user input
      const totalXAmount = new BN(10 * 1e9); // 10 tokens with 9 decimals
      const totalYAmount = new BN(0); // Let the strategy calculate Y amount
      const minBinId = activeBin.binId - 10; // 10 bins below active
      const maxBinId = activeBin.binId + 10; // 10 bins above active
      
      // Create transaction
      const tx = await positionService.addLiquidity(
        {
          poolAddress: selectedPool,
          positionPubkey,
          userPublicKey: publicKey,
        },
        totalXAmount,
        totalYAmount,
        minBinId,
        maxBinId,
        StrategyType.Spot
      );
      
      // Send transaction
      await sendTransaction(tx, dlmmService.connection);
      
      // Refresh positions
      await fetchPositions(selectedPool);
    } catch (error) {
      console.error("Error adding liquidity:", error);
    } finally {
      setActionLoading(false);
    }
  };

  // Remove liquidity from a position
  const handleRemoveLiquidity = async (position: DlmmPositionInfo) => {
    if (!publicKey || !selectedPool) return;
    
    setActionLoading(true);
    
    try {
      // Setup parameters for removing liquidity
      const binIds = position.liquidityPerBin.map(bin => bin.binId);
      const percentages = binIds.map(() => new BN(5000)); // 50% for each bin
      
      // Create transaction
      const tx = await positionService.removeLiquidity(
        {
          poolAddress: selectedPool,
          positionPubkey: position.pubkey,
          userPublicKey: publicKey,
        },
        binIds,
        percentages,
        false // Don't close the position
      );
      
      // Send transaction
      await sendTransaction(tx, dlmmService.connection);
      
      // Refresh positions
      await fetchPositions(selectedPool);
    } catch (error) {
      console.error("Error removing liquidity:", error);
    } finally {
      setActionLoading(false);
    }
  };

  // Claim fees from a position
  const handleClaimFees = async (positionPubkey: string) => {
    if (!publicKey || !selectedPool) return;
    
    setActionLoading(true);
    
    try {
      // Create transaction
      const tx = await positionService.claimFees({
        poolAddress: selectedPool,
        positionPubkey,
        userPublicKey: publicKey,
      });
      
      // Send transaction
      await sendTransaction(tx, dlmmService.connection);
      
      // Refresh positions
      await fetchPositions(selectedPool);
    } catch (error) {
      console.error("Error claiming fees:", error);
    } finally {
      setActionLoading(false);
    }
  };

  // Close a position
  const handleClosePosition = async (positionPubkey: string) => {
    if (!publicKey || !selectedPool) return;
    
    setActionLoading(true);
    
    try {
      // Create transaction
      const tx = await positionService.closePosition({
        poolAddress: selectedPool,
        positionPubkey,
        userPublicKey: publicKey,
      });
      
      // Send transaction
      await sendTransaction(tx, dlmmService.connection);
      
      // Refresh positions after closing
      await fetchPositions(selectedPool);
    } catch (error) {
      console.error("Error closing position:", error);
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    // If pool is selected and user is connected, fetch positions
    if (selectedPool && publicKey && connected) {
      fetchPositions(selectedPool);
    }
  }, [selectedPool, publicKey, connected]);

  // Format amount for display
  const formatAmount = (amount: string): string => {
    const num = parseFloat(amount);
    if (isNaN(num)) return '0';
    if (num < 0.000001) return '<0.000001';
    return num.toFixed(6);
  };

  return (
    <Card className="relative overflow-hidden">
      {/* Radial blur effect */}
      <div className="absolute -top-4 -right-4 w-[300px] h-[200px] opacity-30 pointer-events-none">
        <div className="absolute -top-4 -right-4 w-[200px] h-[200px] rounded-full bg-primary blur-[60px]"></div>
      </div>

      <CardHeader>
        <CardTitle>Your DLMM Positions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!connected ? (
          <div className="text-center py-6">
            <p className="text-sub-text mb-3">Connect your wallet to view positions</p>
            <Button>Connect Wallet</Button>
          </div>
        ) : !selectedPool ? (
          <div className="text-center py-6">
            <p className="text-sub-text mb-3">Select a pool to view your positions</p>
            <Button onClick={() => fetchPositions('ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq')}>
              View USDC-USDT Positions
            </Button>
          </div>
        ) : loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sub-text mb-3">You don't have any positions in this pool</p>
            <Button>Create Position</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {positions.map((position) => (
                <div 
                  key={position.pubkey} 
                  className="p-3 border border-border rounded-lg"
                >
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-medium">Position: {position.pubkey.substring(0, 6)}...{position.pubkey.substring(position.pubkey.length - 4)}</p>
                    <div className="flex gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="View Chart"
                      >
                        <BarChart className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mt-3">
                    <div className="bg-[#0f0f0f] p-2 rounded-md">
                      <div className="text-xs text-sub-text mb-1">Bins: {position.liquidityPerBin.length}</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {position.liquidityPerBin.slice(0, 2).map((bin) => (
                          <div key={bin.binId} className="flex justify-between">
                            <span>Bin {bin.binId}:</span>
                            <span>{formatAmount(bin.liquidityAmount)}</span>
                          </div>
                        ))}
                        {position.liquidityPerBin.length > 2 && (
                          <div className="text-sub-text col-span-2 text-center">
                            + {position.liquidityPerBin.length - 2} more bins
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => handleAddLiquidity(position.pubkey)}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Add
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => handleRemoveLiquidity(position)}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Minus className="h-3 w-3" />}
                        Remove
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => handleClaimFees(position.pubkey)}
                        disabled={actionLoading}
                      >
                        Claim
                      </Button>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-sub-text"
                      onClick={() => handleClosePosition(position.pubkey)}
                      disabled={actionLoading}
                    >
                      Close Position
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-sub-text">Total Positions: {positions.length}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchPositions(selectedPool)}
                disabled={loading}
                className="text-xs"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DlmmPositions;