// src/components/dashboard-components/BtcPoolButtons.tsx
"use client";

import { Button } from "@/components/ui/button";
// Using Lucide icons since they're already in the project
import { Bitcoin } from "lucide-react";

interface BtcPoolButtonsProps {
  onFetchPools: (searchTerm: string) => void;
  isLoading: boolean;
}

const BtcPoolButtons: React.FC<BtcPoolButtonsProps> = ({ 
  onFetchPools, 
  isLoading 
}) => {
  return (
    <div className="flex flex-col space-y-2 mb-4">
      <p className="text-sm text-sub-text mb-1">Search BTC Pools:</p>
      <div className="flex space-x-2">
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={() => onFetchPools('wbtc-sol')}
          disabled={isLoading}
          className="text-xs"
        >
          <Bitcoin height="fill" className="w-4 h-4 mr-1" />
          wBTC-SOL Pools
        </Button>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={() => onFetchPools('zbtc-sol')}
          disabled={isLoading}
          className="text-xs"
        >
          <Bitcoin height="fill" className="w-4 h-4 mr-1" />
          zBTC-SOL Pools
        </Button>
      </div>
    </div>
  );
};

export default BtcPoolButtons;