// src/components/meteora-components/DlmmPositions.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, DollarSign, X, Percent } from "lucide-react";
import { useMeteoraPositionService, RemoveLiquidityParams } from "@/lib/meteora/meteoraPositionService";
import { useMeteoraDlmmService } from "@/lib/meteora/meteoraDlmmService";
import { useWallet } from '@solana/wallet-adapter-react';
import { BN } from 'bn.js';

const DlmmPositions = () => {
  const { service: dlmmService } = useMeteoraDlmmService();
  const { service: positionService, publicKey, sendTransaction } = useMeteoraPositionService();
  const { connected } = useWallet();
  
  interface Position {
    pubkey: string;
    poolName?: string;
    poolAddress?: string;
    liquidityPerBin: {
      binId: number;
      xAmount: string;
      yAmount: string;
      liquidityAmount: string;
    }[];
    totalValue?: number;
  }

  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [removeLiquidityAmount, setRemoveLiquidityAmount] = useState<{[key: string]: number}>({});

  // Fetch user positions across all pools
  const fetchUserPositions = useCallback(async () => {
    if (!connected || !publicKey) return;
    
    setLoading(true);
    try {
      const allPositions: Position[] = [];
      
      // Get all available pools
      const pools = await dlmmService.getAllPools();
      
      // Fetch positions for each pool (in chunks to avoid rate limiting)
      const chunks = [];
      for (let i = 0; i < pools.length; i += 5) {
        chunks.push(pools.slice(i, i + 5));
      }
      
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (pool) => {
          try {
            const poolPositions = await dlmmService.getUserPositions(pool.address, publicKey);
            return poolPositions.map(pos => ({
              ...pos,
              poolName: pool.name,
              poolAddress: pool.address
            }));
          } catch (err) {
            console.warn(`Failed to fetch positions for pool ${pool.address}:`, err);
            return [];
          }
        });
        
        const chunkResults = await Promise.all(chunkPromises);
        chunkResults.forEach(result => allPositions.push(...result));
        
        // Small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      setPositions(allPositions);
    } catch (error) {
      console.error("Error fetching positions:", error);
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, dlmmService]);

  useEffect(() => {
    fetchUserPositions();
  }, [fetchUserPositions]);
  
  // Handle claim fees with improved error handling
  const handleClaimFees = async (positionPubkey: string, poolAddress: string) => {
    if (!connected || !publicKey || !poolAddress) return;
    
    setActionLoading(positionPubkey);
    try {
      const tx = await positionService.claimFees({
        poolAddress,
        positionPubkey,
        userPublicKey: publicKey
      });
      
      // Handle transaction array
      if (Array.isArray(tx)) {
        for (const transaction of tx) {
          await sendTransaction(transaction, dlmmService.connection);
        }
      } else {
        await sendTransaction(tx, dlmmService.connection);
      }
      
      alert('Fees claimed successfully!');
      
      // Refresh positions after claiming
      await fetchUserPositions();
      
    } catch (error) {
      console.error("Error claiming fees:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error claiming fees: ${errorMessage}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle remove liquidity with percentage
  const handleRemoveLiquidity = async (positionPubkey: string, poolAddress: string) => {
    if (!connected || !publicKey || !poolAddress) return;
    
    const percentage = removeLiquidityAmount[positionPubkey] || 100;
    if (percentage <= 0 || percentage > 100) {
      alert('Please enter a valid percentage (1-100)');
      return;
    }
    
    setActionLoading(positionPubkey);
    try {
      // Use the improved remove liquidity method
      const tx = await positionService.removeLiquidityFromPosition(
        {
          poolAddress,
          positionPubkey,
          userPublicKey: publicKey
        },
        percentage,
        percentage === 100 // Close position if removing 100%
      );
      
      // Handle transaction array
      if (Array.isArray(tx)) {
        for (const transaction of tx) {
          await sendTransaction(transaction, dlmmService.connection);
        }
      } else {
        await sendTransaction(tx, dlmmService.connection);
      }
      
      alert(`Successfully removed ${percentage}% liquidity!`);
      
      // Refresh positions after removing liquidity
      await fetchUserPositions();
      
    } catch (error) {
      console.error("Error removing liquidity:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error removing liquidity: ${errorMessage}`);
    } finally {
      setActionLoading(null);
    }
  };
  
  // Handle close position
  const handleClosePosition = async (positionPubkey: string, poolAddress: string) => {
    if (!connected || !publicKey || !poolAddress) return;
    
    if (!confirm('Are you sure you want to close this position? This will remove all liquidity.')) {
      return;
    }
    
    setActionLoading(positionPubkey);
    try {
      const tx = await positionService.closePosition({
        poolAddress,
        positionPubkey,
        userPublicKey: publicKey
      });
      
      await sendTransaction(tx, dlmmService.connection);
      
      alert('Position closed successfully!');
      
      // Refresh positions after closing
      await fetchUserPositions();
      
    } catch (error) {
      console.error("Error closing position:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error closing position: ${errorMessage}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Update remove liquidity percentage
  const updateRemoveLiquidityAmount = (positionPubkey: string, percentage: number) => {
    setRemoveLiquidityAmount(prev => ({
      ...prev,
      [positionPubkey]: percentage
    }));
  };
  
  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Your DLMM Positions</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUserPositions}
            disabled={loading}
            className="text-xs"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-8 text-sub-text">
            {connected 
              ? "No DLMM positions found" 
              : "Connect your wallet to view positions"}
          </div>
        ) : (
          <div className="space-y-4">
            {positions.map((position) => (
              <div 
                key={position.pubkey} 
                className="bg-[#0f0f0f] rounded-lg p-4 border border-border space-y-3"
              >
                {/* Position Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-medium text-white">
                      {position.poolName || 'Unknown Pool'}
                    </h4>
                    <p className="text-xs text-sub-text font-mono">
                      {position.pubkey.substring(0, 8)}...{position.pubkey.substring(-4)}
                    </p>
                  </div>
                  <span className="text-xs bg-secondary/30 px-2 py-1 rounded-full">
                    {position.liquidityPerBin.length} Bins
                  </span>
                </div>
                
                {/* Position Details */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-sub-text">Pool Address:</span>
                    <p className="font-mono text-white">
                      {position.poolAddress?.substring(0, 8)}...
                    </p>
                  </div>
                  <div>
                    <span className="text-sub-text">Total Value:</span>
                    <p className="text-white">
                      ${position.totalValue?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div>
                    <span className="text-sub-text">Active Bins:</span>
                    <p className="text-white">{position.liquidityPerBin.length}</p>
                  </div>
                  <div>
                    <span className="text-sub-text">Status:</span>
                    <p className="text-green-400">Active</p>
                  </div>
                </div>

                {/* Remove Liquidity Percentage Input */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-sub-text">Remove %:</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={removeLiquidityAmount[position.pubkey] || 100}
                    onChange={(e) => updateRemoveLiquidityAmount(
                      position.pubkey, 
                      parseInt(e.target.value) || 100
                    )}
                    className="w-16 bg-[#161616] border border-border rounded px-2 py-1 text-xs text-white"
                  />
                  <span className="text-xs text-sub-text">%</span>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs flex-1"
                    onClick={() => handleClaimFees(position.pubkey, position.poolAddress!)}
                    disabled={actionLoading === position.pubkey || !position.poolAddress}
                  >
                    {actionLoading === position.pubkey ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <DollarSign className="h-3 w-3 mr-1" />
                    )}
                    Claim Fees
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs flex-1"
                    onClick={() => handleRemoveLiquidity(position.pubkey, position.poolAddress!)}
                    disabled={actionLoading === position.pubkey || !position.poolAddress}
                  >
                    {actionLoading === position.pubkey ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Percent className="h-3 w-3 mr-1" />
                    )}
                    Remove {removeLiquidityAmount[position.pubkey] || 100}%
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="destructive"
                    className="text-xs"
                    onClick={() => handleClosePosition(position.pubkey, position.poolAddress!)}
                    disabled={actionLoading === position.pubkey || !position.poolAddress}
                  >
                    {actionLoading === position.pubkey ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </Button>
                </div>

                {/* Bin Details (Collapsible) */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-sub-text hover:text-white">
                    View Bin Details ({position.liquidityPerBin.length} bins)
                  </summary>
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {position.liquidityPerBin.slice(0, 5).map((bin, index) => (
                      <div key={index} className="flex justify-between text-xs bg-[#161616] p-2 rounded">
                        <span>Bin {bin.binId}</span>
                        <span>X: {parseFloat(bin.xAmount).toFixed(4)}</span>
                        <span>Y: {parseFloat(bin.yAmount).toFixed(4)}</span>
                      </div>
                    ))}
                    {position.liquidityPerBin.length > 5 && (
                      <div className="text-center text-sub-text">
                        +{position.liquidityPerBin.length - 5} more bins
                      </div>
                    )}
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DlmmPositions;