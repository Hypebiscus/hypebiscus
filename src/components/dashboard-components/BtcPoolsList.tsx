"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowSquareIn, Check } from "@phosphor-icons/react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface Pool {
  name: string;
  address: string;
  liquidity: string;
  currentPrice: string;
  apy: string;
  fees24h: string;
  volume24h: string;
  // Optional enhanced data
  riskLevel?: string;
  estimatedDailyEarnings?: string;
  investmentAmount?: string;
  reasons?: string[];
  risks?: string[];
}

interface BtcPoolsListProps {
  pools: Pool[];
  onAddLiquidity: (pool: Pool) => void;
  isLoading: boolean;
}

const BtcPoolsList: React.FC<BtcPoolsListProps> = ({
  pools,
  onAddLiquidity,
  isLoading,
}) => {
  const { connected } = useWallet();

  if (pools.length === 0) {
    return <p className="text-white">No pools found</p>;
  }

  return (
    <div className="space-y-6 mt-4">
      {pools.map((pool, index) => (
        <div key={index}>
          {/* Pool Header */}
          <div className="border border-primary rounded-2xl px-6 py-4">
            <div className="flex justify-between items-center">
              <h4 className="text-white font-bold text-lg">{pool.name}</h4>
              <div className="flex flex-col items-end">
                <span className="text-2xl font-bold">{pool.apy} </span>
                <span className="text-sm text-white">24hr fee / TVL</span>
              </div>
            </div>

            <div className="mt-4">
              {/* Pool Stats */}
              <div className="flex gap-6">
                <div>
                  <div className="text-xs text-white/60">
                    Total Value Locked
                  </div>
                  <div className="text-white font-semibold">
                    ${pool.liquidity}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/60">Trading Volume</div>
                  <div className="text-white font-semibold">
                    ${pool.volume24h}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/60">24h Fee</div>
                  <div className="text-white font-semibold">
                    ${pool.fees24h}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mt-6">
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[#1BE3C2] bg-[#1be3c233] rounded-full px-4 py-1 font-semibold text-sm flex items-center gap-2 cursor-help">
                      Audited <ArrowSquareIn size={16} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs bg-[#191919] border border-[#333] p-3 text-white">
                    <p className="font-medium mb-2">Audited by:</p>
                    <ul className="text-xs space-y-1">
                      <li>• Offside Labs</li>
                      <li>• Sec3 (formerly Soteria)</li>
                      <li>• OtterSec</li>
                      <li>• Quantstamp</li>
                      <li>• Halborn</li>
                      <li>• Oak</li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
                <span className=" bg-[#efb54b33] rounded-full px-4 py-1 font-semibold text-sm">
                  Impermanent Loss Risk: <span className="text-[#EFB54B]">Moderate</span>
                </span>
              </div>
              <div>
                <Button
                  variant="default"
                  size="secondary"
                  onClick={() => onAddLiquidity(pool)}
                  disabled={!connected || isLoading}
                  className="flex-1"
                >
                  {connected
                    ? "Invest in this Pool"
                    : "Connect Wallet to Invest"}
                </Button>
              </div>
            </div>
          </div>

          {/* Rest of the component remains unchanged */}
          {/* Estimated Earnings Section */}
          {pool.estimatedDailyEarnings && (
            <div className="mt-4 bg-secondary rounded-2xl p-4 w-fit">
              <h5 className="text-primary text-base font-medium mb-2">
                Your Estimated Earnings:
              </h5>
              <div className="flex flex-col">
                <p className="text-base text-white flex items-center gap-2">
                  Invest:{" "}
                  <span className="text-white font-semibold text-base">
                    ${pool.investmentAmount || "10,000"}
                  </span>
                </p>
                <p className="text-base text-white flex items-center gap-2">
                  Your Estimated Daily Earnings:{" "}
                  <span className="text-white font-semibold text-base">
                    ${pool.estimatedDailyEarnings}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Why this pool section */}
          {pool.reasons && pool.reasons.length > 0 && (
            <div className="mt-4  bg-[#1be3c233] rounded-2xl p-4">
              <h5 className="text-base  font-bold mb-4">
                Why this pool?
              </h5>
              <div className="space-y-2">
                {pool.reasons.map((reason, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check size={16} className="text-[#1BE3C2]" />
                    <p className="text-base text-white">{reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk Notice */}
          {pool.risks && pool.risks.length > 0 && (
            <div className="mt-4">
              <p className="font-bold">Before You Dive In:</p>
              <ul className="list-disc list-inside mt-1 space-y-1 text-base text-white font-normal">
                {pool.risks.map((risk, i) => (
                  <li key={i}>{risk}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-4">
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    `https://app.meteora.ag/dlmm/${pool.address}`,
                    "_blank"
                  )
                }
                className="bg-transparent border-primary text-white"
              >
                View on Meteora
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default BtcPoolsList;