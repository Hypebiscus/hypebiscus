"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowDown, Info } from "lucide-react";
import { useMeteoraDlmmService, DlmmPoolInfo, SwapQuote } from "@/lib/meteora/meteoraDlmmService";
import { BN } from 'bn.js';
import { useWallet } from '@solana/wallet-adapter-react';

const DlmmSwap = () => {
  const { service, publicKey, sendTransaction } = useMeteoraDlmmService();
  const { connected } = useWallet();
  
  const [pools, setPools] = useState<DlmmPoolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPool, setSelectedPool] = useState<DlmmPoolInfo | null>(null);
  const [swapForY, setSwapForY] = useState(true); // true = X to Y, false = Y to X
  const [amountIn, setAmountIn] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapLoading, setSwapLoading] = useState(false);

  // Fetch pools
  useEffect(() => {
    const fetchPools = async () => {
      setLoading(true);
      try {
        const poolsData = await service.getAllPools();
        setPools(poolsData);
        if (poolsData.length > 0) {
          setSelectedPool(poolsData[0]);
        }
      } catch (error) {
        console.error("Error fetching DLMM pools:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPools();
  }, []);

  // Handle pool selection
  const handlePoolSelect = (pool: DlmmPoolInfo) => {
    setSelectedPool(pool);
    setQuote(null);
  };

  // Handle input change
  const handleAmountChange = (value: string) => {
    // Allow only numbers and decimal points
    if (/^[0-9]*\.?[0-9]*$/.test(value) || value === '') {
      setAmountIn(value);
      setQuote(null);
    }
  };

  // Toggle swap direction
  const toggleSwapDirection = () => {
    setSwapForY(!swapForY);
    setQuote(null);
  };

  // Get quote
  const getQuote = async () => {
    if (!selectedPool || !amountIn || parseFloat(amountIn) <= 0) return;

    setQuoteLoading(true);
    try {
      // Convert amount to lamports/smallest unit (example: assumes 9 decimals)
      const decimals = 9; // This should be fetched from the token metadata
      const bnAmount = new BN(parseFloat(amountIn) * Math.pow(10, decimals));
      
      const quoteResult = await service.getSwapQuote(
        selectedPool.address,
        bnAmount,
        swapForY
      );
      
      setQuote(quoteResult);
    } catch (error) {
      console.error("Error getting swap quote:", error);
    } finally {
      setQuoteLoading(false);
    }
  };

  // Execute swap
  const executeSwap = async () => {
    if (!selectedPool || !quote || !publicKey) return;

    setSwapLoading(true);
    try {
      // Convert amount to lamports/smallest unit (example: assumes 9 decimals)
      const decimals = 9; // This should be fetched from the token metadata
      const bnAmount = new BN(parseFloat(amountIn) * Math.pow(10, decimals));
      
      // Calculate min amount out with 0.5% slippage (this is just an example)
      const bnAmountOut = new BN(quote.amountOut);
      const slippage = 0.005; // 0.5%
      const minAmountOut = bnAmountOut.sub(
        bnAmountOut.mul(new BN(Math.floor(slippage * 100))).div(new BN(100))
      );
      
      // Create swap transaction
      const swapTx = await service.swap(
        selectedPool.address,
        publicKey,
        bnAmount,
        minAmountOut,
        swapForY
      );
      
      // Send transaction
      await sendTransaction(swapTx, service.connection);
      
      // Reset state after successful swap
      setAmountIn('');
      setQuote(null);
    } catch (error) {
      console.error("Error executing swap:", error);
    } finally {
      setSwapLoading(false);
    }
  };

  // Format amount for display
  const formatAmount = (amount: string | number, decimals: number = 6): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return num.toFixed(decimals);
  };

  return (
    <Card className="relative overflow-hidden">
      {/* Radial blur effect */}
      <div className="absolute -top-4 -left-4 w-[300px] h-[200px] opacity-30 pointer-events-none">
        <div className="absolute -top-4 -left-4 w-[200px] h-[200px] rounded-full bg-primary blur-[60px]"></div>
      </div>

      <CardHeader>
        <CardTitle>DLMM Swap</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Pool Selector */}
            <div className="bg-[#161616] rounded-lg p-3 border border-border">
              <p className="text-xs text-sub-text mb-2">Select Pool:</p>
              <div className="grid grid-cols-2 gap-2">
                {pools.slice(0, 4).map((pool) => (
                  <Button
                    key={pool.address}
                    variant={selectedPool?.address === pool.address ? "default" : "secondary"}
                    size="sm"
                    className="text-xs"
                    onClick={() => handlePoolSelect(pool)}
                  >
                    {pool.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Swap Interface */}
            {selectedPool && (
              <div className="space-y-3">
                {/* From Token */}
                <div className="bg-[#161616] rounded-lg p-3 border border-border">
                  <p className="text-xs text-sub-text mb-2">You pay:</p>
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium">
                      {swapForY ? selectedPool.tokenX : selectedPool.tokenY}
                    </div>
                    <input
                      type="text"
                      value={amountIn}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      placeholder="0.0"
                      className="bg-transparent border-none text-right text-sm focus:outline-none w-2/3"
                    />
                  </div>
                </div>

                {/* Switch Direction Button */}
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full h-8 w-8 p-0"
                    onClick={toggleSwapDirection}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* To Token */}
                <div className="bg-[#161616] rounded-lg p-3 border border-border">
                  <p className="text-xs text-sub-text mb-2">You receive:</p>
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium">
                      {swapForY ? selectedPool.tokenY : selectedPool.tokenX}
                    </div>
                    <div className="text-sm">
                      {quote ? formatAmount(quote.amountOut) : '0.0'}
                    </div>
                  </div>
                </div>

                {/* Quote Details */}
                {quote && (
                  <div className="bg-[#0f0f0f] rounded-lg p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sub-text">Price Impact:</span>
                      <span>{formatAmount(quote.priceImpact)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sub-text">Fee:</span>
                      <span>{formatAmount(quote.fee)}</span>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col gap-2">
                  {!quote ? (
                    <Button
                      onClick={getQuote}
                      disabled={!amountIn || parseFloat(amountIn) <= 0 || quoteLoading}
                      className="w-full"
                    >
                      {quoteLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Get Quote
                    </Button>
                  ) : (
                    <Button
                      onClick={executeSwap}
                      disabled={!connected || swapLoading}
                      className="w-full"
                    >
                      {swapLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      {connected ? 'Swap' : 'Connect Wallet to Swap'}
                    </Button>
                  )}
                </div>

                {/* Disclaimer */}
                <div className="flex items-start gap-2 text-xs text-sub-text">
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p>
                    Trades are executed on Meteora DLMM pools. Price impact and execution may vary.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DlmmSwap;