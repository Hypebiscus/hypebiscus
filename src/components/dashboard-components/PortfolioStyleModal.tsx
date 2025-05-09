// src/components/dashboard-components/PortfolioStyleModal.tsx
"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface PortfolioStyleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStyle: (style: string) => void;
}

type PortfolioStyle = {
  id: string;
  title: string;
  description: string;
  icon?: string; // Optional icon character
};

const PortfolioStyleModal: React.FC<PortfolioStyleModalProps> = ({ 
  isOpen, 
  onClose,
  onSelectStyle
}) => {
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  
  const portfolioStyles: PortfolioStyle[] = [
    {
      id: 'conservative',
      title: 'Conservative',
      description: 'Protect your capital by focusing on stable, audited pools-lower risk, safe but smaller returns.',
      icon: '🛡️'
    },
    {
      id: 'moderate',
      title: 'Moderate',
      description: 'Balance growth and stability using a mix of established and growth pools-moderate risk, steadier returns.',
      icon: '⚖️'
    },
    {
      id: 'aggressive',
      title: 'Aggressive',
      description: 'Maximize returns with higher-yield, more volatile pools-expect bigger ups and downs.',
      icon: '🚀'
    }
  ];
  
  const handleStyleSelect = (styleId: string) => {
    setSelectedStyle(styleId);
  };
  
  const handleConfirm = () => {
    if (selectedStyle) {
      onSelectStyle(selectedStyle);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#121212] border-[#333] text-white max-w-md p-0 overflow-hidden">
        
        {/* Modal Content */}
        <div className="px-6 pt-10 pb-8">
          {/* Title */}
          <h2 className="text-2xl font-bold text-white text-center mb-6">Choose Your Portfolio Style</h2>
          
          {/* Subtitle */}
          <div className="mb-8">
            <h3 className="text-lg text-gray-300 mb-2 text-center">Select Your Preferred Investment Style</h3>
            <p className="text-sm text-gray-400 text-center">
              Choose how you want to grow your portfolio. Your selection helps us recommend the best liquidity pools for your risk comfort and goals.
            </p>
          </div>
          
          {/* Options */}
          <div className="space-y-3 mb-8">
            {portfolioStyles.map((style) => {
              const isSelected = selectedStyle === style.id;
              let bgColor = "bg-[#1A1A1A]";
              let borderColor = "border-[#333]";
              let textColor = "text-white";
              
              if (isSelected) {
                if (style.id === 'conservative') {
                  bgColor = "bg-blue-950/30";
                  borderColor = "border-blue-600";
                  textColor = "text-blue-400";
                } else if (style.id === 'moderate') {
                  bgColor = "bg-yellow-950/30";
                  borderColor = "border-yellow-600";
                  textColor = "text-yellow-400";
                } else if (style.id === 'aggressive') {
                  bgColor = "bg-red-600";
                  borderColor = "border-red-600";
                  textColor = "text-white";
                }
              }
              
              return (
                <div
                  key={style.id}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${bgColor} ${borderColor}`}
                  onClick={() => handleStyleSelect(style.id)}
                >
                  <div className="flex items-center gap-3">
                    {isSelected ? (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-transparent">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border border-gray-500"></div>
                    )}
                    
                    <div className="flex-1">
                      <div className="flex items-center">
                        {style.icon && <span className="mr-2">{style.icon}</span>}
                        <h3 className={`font-medium ${textColor}`}>
                          {style.title}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {style.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Continue Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleConfirm}
              disabled={!selectedStyle}
              className="w-full bg-red-600 hover:bg-red-700 text-white rounded-md py-3 font-medium"
            >
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PortfolioStyleModal;