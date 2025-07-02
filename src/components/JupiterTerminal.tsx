// src/components/JupiterTerminal.tsx
"use client";

import React, { useState, useEffect } from "react";

interface JupiterTerminalProps {
  className?: string;
  onClose?: () => void;
}

const JupiterTerminal: React.FC<JupiterTerminalProps> = ({ 
  className = "", 
}) => {
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if script is already loaded
    if (typeof window !== "undefined" && window.Jupiter) {
      setIsScriptLoaded(true);
      setIsLoading(false);
      return;
    }

    // Wait for the Jupiter script to load
    const checkJupiter = setInterval(() => {
      if (typeof window !== "undefined" && window.Jupiter) {
        setIsScriptLoaded(true);
        setIsLoading(false);
        clearInterval(checkJupiter);
      }
    }, 100);

    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      setIsLoading(false);
      clearInterval(checkJupiter);
    }, 10000);

    return () => {
      clearInterval(checkJupiter);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (isScriptLoaded && window.Jupiter) {
      window.Jupiter.init({
        displayMode: "integrated",
        integratedTargetId: "jupiter-terminal",
        
        // Pre-configure the trade: SOL to zBTC using correct properties
        formProps: {
          initialInputMint: "So11111111111111111111111111111111111111112", // SOL mint address
          initialOutputMint: "zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg", // zBTC mint address
        },
        
        onSuccess: (params) => {
          console.log('Swap successful:', params.txid, params.swapResult);
          // You can add notifications here
        },
        
        onSwapError: (params) => {
          console.error('Swap error:', params.error, params.quoteResponseMeta);
          // You can add error handling here
        },
        
        autoConnect: true,
        defaultExplorer: 'Solscan',
      });
    }
    
    return () => {
      if (typeof window !== "undefined" && window.Jupiter) {
        window.Jupiter.close();
      }
    };
  }, [isScriptLoaded]);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="animate-pulse text-gray-400">
          Loading Jupiter Terminal...
        </div>
      </div>
    );
  }

  if (!isScriptLoaded) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-red-400">
          Failed to load Jupiter Terminal
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div id="jupiter-terminal" className="w-full" />
    </div>
  );
};

export default JupiterTerminal;