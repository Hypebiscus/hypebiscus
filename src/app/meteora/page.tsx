"use client";

import PageTemplate from "@/components/PageTemplate";
import DlmmPools from "@/components/meteora-components/DlmmPools";
import DlmmSwap from "@/components/meteora-components/DlmmSwaps";
import DlmmPositions from "@/components/meteora-components/DlmmPositions";

export default function Meteora() {
  return (
    <PageTemplate>
      <div className="flex flex-col space-y-6">
        <h2 className="text-xl font-semibold">Meteora DLMM Integration</h2>
        <p className="text-sub-text">
          Access Meteora's Dynamic Liquidity Market Maker (DLMM) pools to swap tokens with optimized pricing and reduced slippage.
        </p>
        
        {/* Main Content Area */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column - Swap */}
          <div className="md:col-span-1">
            <DlmmSwap />
          </div>
          
          {/* Middle Column - Positions */}
          <div className="md:col-span-1">
            <DlmmPositions />
          </div>
          
          {/* Right Column - Pools */}
          <div className="md:col-span-1">
            <DlmmPools />
          </div>
        </div>
      </div>
    </PageTemplate>
  );
}