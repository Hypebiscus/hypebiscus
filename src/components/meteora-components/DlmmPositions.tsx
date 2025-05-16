// src/components/meteora-components/DlmmPositions.tsx
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, MinusCircle, DollarSign, X } from "lucide-react";
import { useMeteoraPositionService } from "@/lib/meteora/meteoraPositionService";
import { useMeteoraDlmmService } from "@/lib/meteora/meteoraDlmmService";
import { BN } from 'bn.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';

// A proper positions component focused on user's positions
const DlmmPositions = () => {
  const { service: dlmmService } = useMeteoraDlmmService();
  const { service: positionService, publicKey, sendTransaction } = useMeteoraPositionService();
  const { connected } = useWallet();
  
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch user positions
  useEffect(() => {
    if (!connected || !publicKey) return;
    
    const fetchPositions = async () => {
      setLoading(true);
      try {
        // This needs to be implemented to get all user positions across pools
        const userPositions = await fetchUserPositions();
        setPositions(userPositions);
      } catch (error) {
        console.error("Error fetching positions:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPositions();
  }, [connected, publicKey]);
  
  // Example function to fetch all user positions - implementation depends on your SDK
  const fetchUserPositions = async () => {
    // You would need to implement this based on your API and data model
    // This is a placeholder - you'd need to adjust based on your actual data structure
    const allPositions = [];
    const pools = await dlmmService.getAllPools();
    
    for (const pool of pools) {
      try {
        const poolPositions = await dlmmService.getUserPositions(pool.address, publicKey!);
        allPositions.push(...poolPositions.map(pos => ({
          ...pos,
          poolName: pool.name,
          poolAddress: pool.address
        })));
      } catch (err) {
        console.error(`Error fetching positions for pool ${pool.address}:`, err);
      }
    }
    
    return allPositions;
  };
  
  // Handle claim fees
  const handleClaimFees = async (positionPubkey: string) => {
    if (!connected || !publicKey) return;
    
    setActionLoading(true);
    try {
      const tx = await positionService.claimFees({
        poolAddress: findPoolAddressByPosition(positionPubkey),
        positionPubkey: positionPubkey,
        userPublicKey: publicKey
      });
      
      await sendTransaction(tx, dlmmService.connection);
      
      // Success notification or UI update
    } catch (error) {
      console.error("Error claiming fees:", error);
      // Error notification
    } finally {
      setActionLoading(false);
    }
  };
  
  // Helper to find pool address from position
  const findPoolAddressByPosition = (positionId: string) => {
    const position = positions.find(p => p.pubkey === positionId);
    return position?.poolAddress || '';
  };
  
  function handleClosePosition(pubkey: any): void {
    throw new Error('Function not implemented.');
  }

  // Handle close position
  // Similar to handleClaimFees but calls closePosition
  
  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <CardTitle>Your Positions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-8 text-sub-text">
            {connected 
              ? "You don't have any positions yet" 
              : "Connect your wallet to view positions"}
          </div>
        ) : (
          <div className="space-y-4">
            {positions.map((position) => (
              <div 
                key={position.pubkey} 
                className="bg-[#161616] rounded-lg p-4 border border-border"
              >
                <div className="flex justify-between mb-2">
                  <h4 className="text-sm font-medium">{position.poolName}</h4>
                  <span className="text-xs bg-secondary/30 px-2 py-1 rounded-full">
                    {position.liquidityPerBin.length} Bins
                  </span>
                </div>
                
                {/* Position details */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                  <div>
                    <span className="text-sub-text">Position ID:</span>
                    <p className="font-mono">{position.pubkey.substring(0, 8)}...</p>
                  </div>
                  <div>
                    <span className="text-sub-text">Total Value:</span>
                    <p>${position.totalValue?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>
                
                {/* Action buttons */}
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs flex-1"
                    onClick={() => handleClaimFees(position.pubkey)}
                    disabled={actionLoading}
                  >
                    <DollarSign className="h-3 w-3 mr-1" />
                    Claim Fees
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs flex-1"
                    onClick={() => handleClosePosition(position.pubkey)}
                    disabled={actionLoading}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Close
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DlmmPositions;