// src/components/dashboard-components/ChatBox.tsx
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChartLine, Clock, Plus, Wallet , ArrowClockwise } from "@phosphor-icons/react";
import BtcPoolsList from "./BtcPoolsList";
import AddLiquidityModal from "./AddLiquidityModal";
import QuickActionButtons from "./QuickActionButtons";
import PortfolioStyleModal from "./PortfolioStyleModal";
import ChatMessage from "@/components/chat-message";
import ChatInput from "@/components/chat-input";
import { fetchMessage } from "@/lib/api/chat";
import { fetchPools } from "@/lib/api/pools";
// import { useMeteoraDlmmService } from "@/lib/meteora/meteoraDlmmService";
// import { useMeteoraPositionService } from "@/lib/meteora/meteoraPositionService";e
// import { useWallet } from "@solana/wallet-adapter-react";

// Type definitions
type MessageRole = "user" | "assistant";

interface Message {
  role: MessageRole;
  content: string;
  timestamp: Date;
}

// API response types
interface ApiPool {
  name: string;
  address: string;
  liquidity: string;
  current_price: string | number;
  apy: number;
  fees_24h: number;
  trade_volume_24h: number;
  [key: string]: unknown; // Using 'unknown' instead of 'any' for better type safety
}

// Define Group type to match what the API response actually contains
interface Group {
  name: string;
  pairs: ApiPool[];
  [key: string]: unknown;
}

interface Pool {
  name: string;
  address: string;
  liquidity: string;
  currentPrice: string;
  apy: string;
  fees24h: string;
  volume24h: string;
  // Optional enhanced data
  estimatedDailyEarnings?: string;
  investmentAmount?: string;
  riskLevel?: string;
  reasons?: string[];
  risks?: string[];
}

// Add new interface for message with associated pool
interface MessageWithPool {
  message: Message;
  pools?: Pool[];
}

// Component implementation
const ChatBox: React.FC = () => {
  // State management
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [currentPools, setCurrentPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [isAddLiquidityModalOpen, setIsAddLiquidityModalOpen] = useState(false);
  const [isPortfolioStyleModalOpen, setIsPortfolioStyleModalOpen] =
    useState(false);
  const [selectedPortfolioStyle, setSelectedPortfolioStyle] = useState<
    string | null
  >(null);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(true);

  const [messageWithPools, setMessageWithPools] = useState<MessageWithPool[]>(
    []
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);



  // Helper function to safely format currency values - must be defined before it's used
  const formatCurrencyValue = useCallback(
    (value: string | number | undefined, decimals: number = 0): string => {
      if (typeof value === "string") {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          return num.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          });
        }
        return value;
      } else if (typeof value === "number") {
        return value.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      }
      return "0";
    },
    []
  );

  // Methods
  const addMessage = useCallback(
    (role: MessageRole, content: string, pools?: Pool[]) => {
      const newMessage = { role, content, timestamp: new Date() };
      setMessages((prev) => [...prev, newMessage]);
      setMessageWithPools((prev) => [...prev, { message: newMessage, pools }]);

      // Hide welcome screen when conversation starts
      if (showWelcomeScreen) {
        setShowWelcomeScreen(false);
      }
    },
    [showWelcomeScreen]
  );

  const addErrorMessage = useCallback(
    (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      addMessage("assistant", `Sorry, there was an error: ${errorMessage}`);
    },
    [addMessage]
  );

  // Function to fetch and display the best yield pool - must be defined before handleSendMessage
  const showBestYieldPool = useCallback(
    async (style: string) => {
      setIsPoolLoading(true);

      try {
        // Display a loading message
        addMessage(
          "assistant",
          `Finding the best ${style} Solana liquidity pools for you...`
        );

        // Add a deliberate delay to show loading state (1.5 seconds)
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Use different search terms based on portfolio style
        const searchTerms =
          style === "conservative"
            ? ["wbtc-sol", "zbtc-sol"] // Conservative: only wBTC-SOL
            : style === "moderate"
            ? ["wbtc-sol", "zbtc-sol"] // Moderate: both pairs for diversification
            : ["wbtc-sol", "zbtc-sol"]; // Aggressive: only zBTC-SOL

        let allPools: ApiPool[] = [];

        // Fetch pools for each search term
        for (const term of searchTerms) {
          try {
            console.log(`Fetching pools with search term: ${term}`);
            const poolsData = await fetchPools(term);

            if (poolsData && poolsData.groups && poolsData.groups.length > 0) {
              // Use type assertion to ensure compatibility with the Group type
              (poolsData.groups as Group[]).forEach((group) => {
                if (group.pairs && group.pairs.length > 0) {
                  allPools = [...allPools, ...group.pairs];
                }
              });
            }
          } catch (error) {
            console.error(`Error fetching pools for ${term}:`, error);
            // Continue with next term
          }
        }

        if (allPools.length > 0) {
          // Sort pools based on portfolio style
          if (style === "conservative") {
            // Sort by TVL (liquidity) for conservative
            allPools.sort(
              (a, b) => parseFloat(b.liquidity) - parseFloat(a.liquidity)
            );
          } else if (style === "moderate") {
            // Sort by balance of TVL and APY for moderate
            allPools.sort((a, b) => {
              const scoreA = parseFloat(a.liquidity) * 0.5 + a.apy * 0.5;
              const scoreB = parseFloat(b.liquidity) * 0.5 + b.apy * 0.5;
              return scoreB - scoreA;
            });
          } else {
            // Sort by APY for aggressive
            allPools.sort((a, b) => b.apy - a.apy);
          }

          // Take the top pool, but avoid showing the same one again
          let selectedPool = allPools[0];
          let poolIndex = 0;

          // Check if we already have this pool displayed and try to find a different one
          const existingPoolAddresses = currentPools.map((p) => p.address);
          while (
            existingPoolAddresses.includes(selectedPool.address) &&
            poolIndex < allPools.length - 1
          ) {
            poolIndex++;
            selectedPool = allPools[poolIndex];
          }

          // If we found a pool (either new or all are duplicates)
          if (selectedPool) {
            // Calculate fee APY safely
            const fees24h =
              typeof selectedPool.fees_24h === "number"
                ? selectedPool.fees_24h
                : 0;
            const liquidityValue = parseFloat(selectedPool.liquidity);
            const feeAPY = (fees24h / liquidityValue) * 100;

            // Create formatted pool
            const formattedPool = {
              name: selectedPool.name,
              address: selectedPool.address,
              liquidity: formatCurrencyValue(selectedPool.liquidity, 0),
              currentPrice: formatCurrencyValue(selectedPool.current_price, 2),
              // Calculate APY based on 24h fees to TVL ratio instead of using the API's apy field
              // This matches what Meteora displays as "24hr fee / TVL"
              apy: feeAPY.toFixed(2) + "%",
              fees24h: formatCurrencyValue(fees24h, 2),
              volume24h: formatCurrencyValue(selectedPool.trade_volume_24h, 0),
              // Enhanced data for display
              estimatedDailyEarnings: (
                (fees24h / liquidityValue) *
                10000
              ).toFixed(2),
              investmentAmount: "10,000",
              riskLevel: style,
              reasons: [
                // Style-specific first reason
                style === "conservative"
                  ? `Deep liquidity — $${formatCurrencyValue(
                      selectedPool.liquidity,
                      0
                    )} locked in this pool minimizes slippage and provides capital stability.`
                  : style === "moderate"
                  ? `Balanced metrics — $${formatCurrencyValue(
                      selectedPool.liquidity,
                      0
                    )} TVL coupled with ${feeAPY.toFixed(
                      2
                    )}% returns offers the ideal middle ground.`
                  : `Revenue maximizer — ${feeAPY.toFixed(
                      2
                    )}% annualized yield outperforms most alternatives in the ecosystem.`,

                // Volume-based reason
                `Active trading — $${formatCurrencyValue(
                  selectedPool.trade_volume_24h,
                  0
                )} daily volume indicates strong market participation and ease of exit.`,

                // Fee-based reason
                `Consistent revenue — $${formatCurrencyValue(
                  fees24h,
                  2
                )} collected in fees yesterday demonstrates real earning potential.`,

                // Trading activity reason
                parseFloat(String(selectedPool.trade_volume_24h)) > 1000000
                  ? "High demand trading pair — market participants heavily favor this asset combination."
                  : "Sustainable activity — trading frequency supports reliable returns without excessive volatility.",

                // Final recommendation reason
                style === "conservative"
                  ? "Capital preservation focus — lower volatility profile aligns with your safety-first approach."
                  : style === "moderate"
                  ? "Growth with guardrails — this pool balances upside potential with downside protection."
                  : "Opportunistic positioning — designed for investors seeking maximum capital appreciation.",
              ],
              risks: [
                // Market related risk
                "Market dynamics vary — future performance may differ from historical data as trading conditions evolve.",

                // Impermanent loss risk with different wording
                style === "conservative"
                  ? "Price divergence impact — if token values change significantly relative to each other, returns may be affected by impermanent loss."
                  : style === "moderate"
                  ? "Asset correlation factor — substantial price differences between paired assets can impact expected returns."
                  : "Volatility tradeoff — higher returns come with increased exposure to impermanent loss during market swings.",

                // Protocol/technical risk
                "Protocol considerations — while thoroughly audited, all DeFi interactions carry inherent smart contract risk.",

                // Style-specific risk
                style === "conservative"
                  ? "Opportunity cost — selecting safety means potentially lower returns than more aggressive options."
                  : style === "moderate"
                  ? "Partial downside protection — moderate strategy provides some but not complete insulation from market downturns."
                  : "Amplified movements — this pool may experience larger price fluctuations during market volatility.",
              ],
            };

            // Show success message with the pool
            addMessage(
              "assistant",
              `${currentPools.length === 0 ? "Here's a" : "Here's another"} ${selectedPortfolioStyle ? `${style} pool that matches your investment style` : "pool"}. This pool offers ${
                style === "conservative" 
                  ? "stability and reliable returns"
                  : style === "moderate"
                  ? "a balance of risk and reward"
                  : style === "aggressive"
                  ? "high potential returns with managed risk"
                  : "competitive returns"
              }.`,
              [formattedPool] // Pass the pool with the message
            );

            // Update current pools for reference
            setCurrentPools([formattedPool]);
          } else {
            // No pools found after filtering
            addMessage(
              "assistant",
              `I searched but couldn't find any suitable pools matching your ${style} portfolio style. Please try again later or adjust your preferences.`
            );
          }
        } else {
          // No pools found at all
          addMessage(
            "assistant",
            `Sorry, I couldn't find any Bitcoin liquidity pools on Solana at the moment. Please try again later.`
          );
        }
      } catch (error) {
        console.error("Error in showBestYieldPool:", error);
        addMessage(
          "assistant",
          `Sorry, there was an error finding pools: ${
            error instanceof Error ? error.message : "Unknown error"
          }. Please try again later.`
        );
      } finally {
        setIsPoolLoading(false);
      }
    },
    [currentPools, addMessage, formatCurrencyValue, selectedPortfolioStyle]
  );

  const handleSendMessage = useCallback(async (message?: string) => {
    const messageToSend = message || inputMessage;
    if (!messageToSend.trim()) return;
  
    // Add user message
    addMessage("user", messageToSend);
    const userMessage = messageToSend;
    setInputMessage("");
    setIsLoading(true);
  
    try {
      // Check if message is about finding pools/recommendations
      const lowerCaseMessage = userMessage.toLowerCase();
      
      // Check if this is a quick action educational question about pools
      const isEducationalPoolQuestion = 
        (lowerCaseMessage.includes("what is") && 
         (lowerCaseMessage.includes("pool") || lowerCaseMessage.includes("lp") || lowerCaseMessage.includes("liquidity"))) ||
        (lowerCaseMessage.includes("how does") && lowerCaseMessage.includes("work")) ||
        lowerCaseMessage.includes("why solana") ||
        lowerCaseMessage.includes("what are the risks");
      
      // If it's an educational question, skip the pool recommendation logic
      if (isEducationalPoolQuestion) {
        // Process as a regular message
        const messageHistory = [
          ...messages,
          {
            role: "user",
            content: userMessage,
            timestamp: new Date(),
          },
        ];
  
        // Send to API
        const response = await fetchMessage(messageHistory);
        addMessage("assistant", response);
      }
      // Otherwise, check if it's a pool discovery request
      else if (
        // More specific pool finding patterns
        (lowerCaseMessage.includes("find") || lowerCaseMessage.includes("show") || lowerCaseMessage.includes("get")) && 
          (lowerCaseMessage.includes("pool") || lowerCaseMessage.includes("liquidity")) ||
        lowerCaseMessage.includes("recommend") || 
        lowerCaseMessage.match(/best\s+pool/i) ||
        lowerCaseMessage.match(/highest\s+yield/i) ||
        lowerCaseMessage.match(/best\s+yield/i) ||
        lowerCaseMessage.match(/best\s+liquidity/i) ||
        lowerCaseMessage.match(/high\s+tvl/i) ||
        
        // Questions specifically about what to invest in
        (lowerCaseMessage.includes("invest") && lowerCaseMessage.includes("where")) ||
        (lowerCaseMessage.includes("which") && lowerCaseMessage.includes("pool")) ||
        
        // Direct pool requests
        lowerCaseMessage.match(/btc\s+pool/i) ||
        lowerCaseMessage.match(/bitcoin\s+pool/i) ||
        
        // Clear requests for LP opportunities
        lowerCaseMessage.match(/lp\s+opportunities/i) ||
        lowerCaseMessage.match(/liquidity\s+provision\s+options/i)
      ) {
        console.log("Detected pool query:", lowerCaseMessage);
        await showBestYieldPool(selectedPortfolioStyle || 'conservative');
      } else {
        // Process as a regular message
        const messageHistory = [
          ...messages,
          {
            role: "user",
            content: userMessage,
            timestamp: new Date(),
          },
        ];
  
        // Send to API
        const response = await fetchMessage(messageHistory);
        addMessage("assistant", response);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      addErrorMessage(error);
    } finally {
      setIsLoading(false);
    }
    }, [inputMessage, messages, selectedPortfolioStyle, addMessage, addErrorMessage, showBestYieldPool]);
  
  const handleAddLiquidity = (pool: Pool) => {
    setSelectedPool(pool);
    setIsAddLiquidityModalOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle quick action - directly sends the question to AI, bypassing DLMM parsing
  const handleQuickAction = (question: string) => {
    handleSendMessage(question);
  };

  // Handle portfolio style selection
  const handleSelectPortfolioStyle = (style: string) => {
    setSelectedPortfolioStyle(style);
 

    if (!showWelcomeScreen) {
      // Not first-time selection
      addMessage(
        "assistant",
        `You've selected the ${
          style.charAt(0).toUpperCase() + style.slice(1)
        } portfolio style. I'll recommend pools that match your risk preference.`
      );
    } else {
      // First-time selection from welcome screen
      setShowWelcomeScreen(false);
      addMessage(
        "assistant",
        `Welcome! You've selected the ${
          style.charAt(0).toUpperCase() + style.slice(1)
        } portfolio style. I'll recommend pools that match your risk preference. How can I help you today?`
      );
    }

    // Always show pool recommendations, regardless of whether we're coming from welcome screen
    showBestYieldPool(style);
  };

     // Handle refresh pools functionality
  const handleRefreshPools = useCallback(async () => {
    if (!selectedPortfolioStyle) {
      addMessage(
        "assistant",
        "Please select a portfolio style first to get pool recommendations."
      );
      return;
    }

    setIsPoolLoading(true);
    try {
      await showBestYieldPool(selectedPortfolioStyle);
      addMessage(
        "assistant", 
        `I've found fresh ${selectedPortfolioStyle} BTC pools with updated data!`
      );
    } catch (error) {
      console.error("Error refreshing pools:", error);
      addMessage(
        "assistant",
        "Sorry, I couldn't refresh the pools right now. Please try again later."
      );
    } finally {
      setIsPoolLoading(false);
    }
  }, [selectedPortfolioStyle, showBestYieldPool, addMessage]);
  
  // ------------------------------------------------------------

  // Format time for display - kept for potential future use but marked with a comment instead of ts-expect-error
  // const formatTime = (date: Date) => {
  //   return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  // };
  // Note: formatTime is currently unused but will be used in future enhancements for message timestamps

  // Helper function to safely format percentage values
  // const formatPercentValue = (value: string | number | undefined): string => {
  //   if (typeof value === "string") {
  //     const num = parseFloat(value);
  //     if (!isNaN(num)) {
  //       // Format as percentage with 2 decimal places
  //       return num.toFixed(2) + "%";
  //     }
  //     return value;
  //   } else if (typeof value === "number") {
  //     // Format as percentage with 2 decimal places
  //     return value.toFixed(2) + "%";
  //   }
  //   return "0%";
  // };
  // Note: formatPercentValue is saved for future enhancements when percentage formatting is needed

  // Effects
  useEffect(() => {
    // Add a small delay to ensure DOM updates have completed
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, [messages, currentPools]);

  // Convert the original Message[] format to the simplified format needed for ChatMessage component
  // const simplifiedMessages = messages.map((msg) => ({
  //   role: msg.role,
  //   content: msg.content,
  // }));

  // Render component - using the new structure
  if (showWelcomeScreen) {
    return (
      <div className="flex flex-col lg:h-[calc(100vh-140px)] h-[calc(100vh-130px)] w-full lg:max-w-4xl mx-auto">
        <div className="flex-1 flex flex-col items-center justify-start p-6 lg:mt-14">
          <h1 className="lg:text-3xl text-xl font-bold text-primary mb-2">
            Welcome to Hypebiscus
          </h1>
          <p className="text-white text-center font-medium max-w-md lg:mb-8 mb-4">
            Your smart assistant for exploring BTC liquidity in the Solana DeFi
            ecosystem.
          </p>
          <div className="lg:grid grid-cols-1 max-w-2xl gap-4 mb-6">
            <div className="flex items-center gap-2 mb-2 lg:mb-0">
              <div>
                <Clock className="text-primary" size={20} />
              </div>
              <p className="text-white text-left lg:text-base text-sm">
                Real-time discovery of BTC and zBTC liquidity pools on Solana.
              </p>
            </div>
            <div className="flex items-center gap-2 mb-2 lg:mb-0">
              <div>
                <Plus className="text-primary" size={20} />
              </div>
              <p className="text-white text-left lg:text-base text-sm">
                Instant &apos;Add Position&apos; capability.
              </p>
            </div>
            <div className="flex items-center gap-2 mb-2 lg:mb-0">
              <div>
                <ChartLine className="text-primary" size={20} />
              </div>
              <p className="text-white text-left lg:text-base text-sm">
                Live pool analytics, including TVL, APR, and recent liquidity
                changes.
              </p>
            </div>
            <div className="flex items-center gap-2 mb-2 lg:mb-0">
              <div>
                <Wallet className="text-primary" size={20} />
              </div>
              <p className="text-white text-left lg:text-base text-sm">
                Secure, non-custodial wallet integration for direct on-chain
                transactions.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="secondary"
            className="bg-secondary/30 border-primary text-white flex items-center gap-2"
            onClick={() => setIsPortfolioStyleModalOpen(true)}
          >
            <ChartLine size={20} />
            <span>Select Portfolio Style</span>
          </Button>
        </div>

        {/* Chat input area for welcome screen */}
        <QuickActionButtons
          onQuickAction={handleQuickAction}
          disabled={isLoading}
        />
        <ChatInput
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading || isPoolLoading}
          onSend={() => handleSendMessage()}
          isLoading={isLoading}
        />

        <PortfolioStyleModal
          isOpen={isPortfolioStyleModalOpen}
          onClose={() => setIsPortfolioStyleModalOpen(false)}
          onSelectStyle={handleSelectPortfolioStyle}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:h-[calc(100vh-140px)] h-[calc(100vh-130px)] lg:max-w-4xl mx-auto">
      <div className="flex justify-end lg:mb-10 mb-4 gap-2">
        {selectedPortfolioStyle && (
          <Button
            variant="secondary"
            size="secondary"
            className="bg-secondary/30 border-primary text-white flex items-center gap-2 hover:bg-primary/20"
            onClick={handleRefreshPools}
            disabled={isPoolLoading}
            title="Find different BTC pools with your current portfolio style"
          >
            <ArrowClockwise 
              size={16}
              className={isPoolLoading ? 'animate-spin' : ''} 
            />
            {isPoolLoading ? 'Finding...' : 'Refresh Pools'}
          </Button>
        )}

        <Button
          variant="secondary"
          size="secondary"
          className="bg-secondary/30 border-primary text-white flex items-center gap-2"
          onClick={() => setIsPortfolioStyleModalOpen(true)}
        >
          <span>
            {selectedPortfolioStyle
              ? `Portfolio: ${
                  selectedPortfolioStyle.charAt(0).toUpperCase() +
                  selectedPortfolioStyle.slice(1)
                }`
              : "Select Portfolio Style"}
          </span>
        </Button>
      </div>

      {/* Scrollable chat messages area */}
      <div className="flex-1 overflow-y-auto lg:pb-8 pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <div className="flex flex-col">
          {messageWithPools.map((item, index, array) => {
            // Check if this is a loading or result message
            const isPoolMessage = 
              item.message.role === "assistant" &&
              (item.message.content.includes("Finding the best") || 
               item.message.content.includes("Found the optimal") ||
               /Finding the best \w+ Solana liquidity pools for you/.test(item.message.content));

            // Show loading message only if it's the last message and no pools yet
            const isLoadingState = 
              isPoolMessage && 
              index === array.length - 1 && 
              (!item.pools || item.pools.length === 0);

            return (
              <React.Fragment key={index}>
                {(isLoadingState || !isPoolMessage) && <ChatMessage message={item.message} />}
                {item.pools && item.pools.length > 0 && (
                  <div className="w-full">
                    <BtcPoolsList
                      pools={item.pools}
                      onAddLiquidity={handleAddLiquidity}
                      isLoading={isPoolLoading}
                    />
                    <hr className="mt-8" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed chat input area */}
      <QuickActionButtons
        onQuickAction={handleQuickAction}
        disabled={isLoading}
      />

      <ChatInput
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading || isPoolLoading}
        onSend={() => handleSendMessage()}
        isLoading={isLoading}
      />

      {/* Add Liquidity Modal */}
      <AddLiquidityModal
        isOpen={isAddLiquidityModalOpen}
        onClose={() => setIsAddLiquidityModalOpen(false)}
        pool={selectedPool}
      />

      {/* Portfolio Style Modal */}
      <PortfolioStyleModal
        isOpen={isPortfolioStyleModalOpen}
        onClose={() => setIsPortfolioStyleModalOpen(false)}
        onSelectStyle={handleSelectPortfolioStyle}
      />
    </div>
  );
};

export default ChatBox;
