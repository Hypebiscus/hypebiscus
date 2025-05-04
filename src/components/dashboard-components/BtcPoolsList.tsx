"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { useWallet } from '@solana/wallet-adapter-react';
import { Bitcoin } from "lucide-react";

interface Pool {
  name: string;
  address: string;
  liquidity: string;
  currentPrice: string;
  apy: string;
  fees24h: string;
  volume24h: string;
}

interface BtcPoolsListProps {
  pools: Pool[];
  onAddLiquidity: (pool: Pool) => void;
  isLoading: boolean;
}

const BtcPoolsList: React.FC<BtcPoolsListProps> = ({ 
  pools, 
  onAddLiquidity,
  isLoading 
}) => {
  const { connected } = useWallet();

  if (pools.length === 0) {
    return <p className="text-white">No pools found</p>;
  }

  return (
    <div className="space-y-6 mt-4">
      {pools.map((pool, index) => (
        <div key={index} className="bg-[#0f0f0f] rounded-lg border border-border overflow-hidden">
          <div className="flex justify-between items-center p-3 bg-[#161616]">
            <h4 className="text-white font-medium">{index + 1}. Pool: {pool.name}</h4>
            <div className="flex items-center space-x-1 bg-secondary/30 px-2 py-1 rounded">
              <Bitcoin className="h-4 w-4" />
            </div>
          </div>
          
          <div className="p-4">
            <div className="flex flex-col space-y-1 text-sm text-white/80">
              
                <span>Liquidity: ${pool.liquidity}</span>
              
                <span>Current Price: ${pool.currentPrice}</span>
              
                <span>APY: {pool.apy}%</span>
              
                <span>24h Fees: ${pool.fees24h}</span>
              
                <span>24h Volume: ${pool.volume24h}</span>
            </div>
            
            <div className="mt-4">
              <Button
                variant="default"
                size="sm"
                onClick={() => onAddLiquidity(pool)}
                disabled={!connected || isLoading}
              >
                {connected ? 'Add Liquidity' : 'Connect Wallet to Add'}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default BtcPoolsList;