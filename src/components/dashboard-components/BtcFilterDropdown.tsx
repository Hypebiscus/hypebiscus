// src/components/dashboard-components/BtcFilterDropdown.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, Bitcoin } from "lucide-react";

interface BtcFilterDropdownProps {
  onFilterSelect: (filter: string) => void;
  isLoading: boolean;
  activeFilter?: string;
}

const BtcFilterDropdown: React.FC<BtcFilterDropdownProps> = ({
  onFilterSelect,
  isLoading,
  activeFilter
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const filterOptions = [
    {
      id: 'wbtc-sol',
      label: 'wBTC-SOL',
      description: 'Wrapped Bitcoin pools',
      icon: Bitcoin
    },
    {
      id: 'zbtc-sol',
      label: 'zBTC-SOL',
      description: 'Zeus Bitcoin pools',
      icon: Bitcoin
    },
    {
      id: 'cbbtc-sol',
      label: 'cbBTC-SOL',
      description: 'Coinbase Bitcoin pools',
      icon: Bitcoin
    }
  ];

  const getActiveFilterLabel = () => {
    const activeOption = filterOptions.find(option => option.id === activeFilter);
    if (activeOption) {
      return (
        <>
          <span className="hidden sm:inline">Pool: </span>
          {activeOption.label}
        </>
      );
    }
    return (
      <>
        <span className="hidden sm:inline">Select </span>Pool<span className="hidden sm:inline"> Filter</span>
      </>
    );
  };

  const handleFilterSelect = (filterId: string) => {
    onFilterSelect(filterId);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Dropdown Trigger Button */}
      <Button
        variant="secondary"
        size="secondary"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="bg-secondary/30 border-primary text-white flex items-center gap-2 hover:bg-primary/20 min-w-[120px] sm:min-w-[160px] justify-between text-xs"
      >
        <span className="truncate">{getActiveFilterLabel()}</span>
        <ChevronDown 
          className={`w-4 h-4 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </Button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Overlay to close dropdown when clicking outside */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown Content */}
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#161616] border border-primary rounded-lg shadow-lg z-20 overflow-hidden">
            {filterOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = activeFilter === option.id;
              
              return (
                <button
                  key={option.id}
                  onClick={() => handleFilterSelect(option.id)}
                  disabled={isLoading}
                  className={`w-full px-4 py-3 text-left hover:bg-primary/20 transition-colors flex items-center gap-3 ${
                    isSelected ? 'bg-primary/10' : ''
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">
                      <span className="hidden sm:inline">Pool: </span>
                      {option.label}
                    </div>
                    <div className="text-sub-text text-xs truncate">
                      {option.description}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default BtcFilterDropdown;