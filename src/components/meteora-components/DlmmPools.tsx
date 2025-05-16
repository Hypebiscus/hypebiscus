"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useMeteoraDlmmService, DlmmPoolInfo } from "@/lib/meteora/meteoraDlmmService";

const DlmmPools = () => {
  const { service } = useMeteoraDlmmService();
  const [pools, setPools] = useState<DlmmPoolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [activeBinPrice, setActiveBinPrice] = useState<number | null>(null);

  // Fetch pools
  const fetchPools = async () => {
    setLoading(true);
    try {
      const poolsData = await service.getAllPools();
      setPools(poolsData);
    } catch (error) {
      console.error("Error fetching DLMM pools:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get active bin for a specific pool
  const getActiveBin = async (poolAddress: string) => {
    setSelectedPool(poolAddress);
    try {
      const activeBin = await service.getActiveBin(poolAddress);
      setActiveBinPrice(Number(activeBin.price));
    } catch (error) {
      console.error("Error fetching active bin:", error);
    }
  };

  useEffect(() => {
    fetchPools();
  }, [fetchPools]); // Add fetchPools here

  return (
    <Card className="relative overflow-hidden">
      {/* Radial blur effect in top right corner */}
      <div className="absolute -top-4 -right-4 w-[300px] h-[200px] opacity-30 pointer-events-none">
        <div className="absolute -top-4 -right-4 w-[200px] h-[200px] rounded-full bg-primary blur-[60px]"></div>
      </div>

      <CardHeader>
        <CardTitle>DLMM Pools</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : pools.length === 0 ? (
          <p className="text-sm text-sub-text">No DLMM pools available.</p>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <p className="text-sm text-sub-text">
                Available pools: {pools.length}
              </p>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={fetchPools}
                disabled={loading}
                className="text-xs"
              >
                Refresh
              </Button>
            </div>
            <div className="space-y-3 mt-2">
              {pools.slice(0, 5).map((pool, index) => (
                <div 
                  key={pool.address} 
                  className={`p-3 border ${selectedPool === pool.address ? 'border-primary' : 'border-border'} rounded-lg`}
                >
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">{pool.name}</p>
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      onClick={() => getActiveBin(pool.address)}
                      className="text-xs"
                    >
                      View
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-sub-text">
                    <div>Token X: <span className="text-white">{pool.tokenX}</span></div>
                    <div>Token Y: <span className="text-white">{pool.tokenY}</span></div>
                    <div>Bin Step: <span className="text-white">{pool.binStep}</span></div>
                    <div>Price: <span className="text-white">{pool.activeBinPrice.toFixed(6)}</span></div>
                  </div>
                  {selectedPool === pool.address && activeBinPrice !== null && (
                    <div className="mt-3 p-2 bg-secondary/30 rounded text-xs">
                      <p className="text-primary font-medium">Active Bin Price: {activeBinPrice.toFixed(8)}</p>
                    </div>
                  )}
                </div>
              ))}
              {pools.length > 5 && (
                <div className="text-center mt-3">
                  <Button variant="ghost" size="sm" className="text-xs">
                    View More
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DlmmPools;