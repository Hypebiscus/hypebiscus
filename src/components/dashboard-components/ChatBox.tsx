// src/components/dashboard-components/ChatBox.tsx
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  ChartLine,
  Clock,
  Plus,
  Wallet,
  ArrowClockwise,
} from "@phosphor-icons/react";
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
  bin_step?: number;
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
  binStep?: string;
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
  // Add a state to track shown pool addresses to avoid duplicates
  const [shownPoolAddresses, setShownPoolAddresses] = useState<string[]>([]);
 
  // Track shown bin steps per portfolio style
  const [shownBinStepsPerStyle, setShownBinStepsPerStyle] = useState<{
    [style: string]: number[];
  }>({ conservative: [], moderate: [], aggressive: [] });
  // Count requests for different pools to cycle through strategies
  const [differentPoolRequests, setDifferentPoolRequests] = useState(0);

  const [messageWithPools, setMessageWithPools] = useState<MessageWithPool[]>(
    []
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Add a state for the current streaming message
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Add a function to manually scroll to the bottom
//   const scrollToBottom = useCallback(() => {
//     setTimeout(() => {
//       messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
//     }, 100);
//   }, []);

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

  // Function to fetch and display the best yield pool
  const showBestYieldPool = useCallback(
    async (style: string | null) => {
      setIsPoolLoading(true);

      try {
        // Display a loading message
        addMessage(
          "assistant",
          style
            ? `Finding the best ${style} Solana liquidity pools for you...`
            : "Finding the best Solana liquidity pools based on your request..."
        );

        // Add a deliberate delay to show loading state (3.5 seconds instead of 1.5)
        await new Promise((resolve) => setTimeout(resolve, 3500));

        // Use search terms for specific tokens we want to find
        const searchTerms = ["wbtc-sol", "zbtc-sol", "cbbtc-sol"]; // Direct search for our specific pairs
        const allowedBinSteps = [5, 10, 15, 50]; // Only these bin steps are of interest

        let allPools: ApiPool[] = [];
        console.log(
          "Searching for specific BTC-SOL pairs with standard bin steps"
        );

        // Fetch each specific pair directly
        for (const term of searchTerms) {
          try {
            console.log(`Fetching pools with direct search term: ${term}`);
            const poolsData = await fetchPools(term);

            if (poolsData && poolsData.groups && poolsData.groups.length > 0) {
              console.log(
                `Found ${poolsData.groups.length} groups for ${term}`
              );

              // Process each group and extract matching pairs
              (poolsData.groups as Group[]).forEach((group) => {
                if (group.pairs && group.pairs.length > 0) {
                  console.log(
                    `Group "${group.name}" has ${group.pairs.length} pairs`
                  );

                  // Filter for exact matches of our specific pairs with standard bin steps
                  const filteredPairs = group.pairs.filter((pair) => {
                    const name = pair.name.toLowerCase();
                    const binStep = pair.bin_step || 0;

                    // Only include exact matches with allowed bin steps
                    const isValidPair =
                      (name === "wbtc-sol" ||
                        name === "zbtc-sol" ||
                        name === "cbbtc-sol") &&
                      !name.includes("jito") &&
                      allowedBinSteps.includes(binStep);

                    if (isValidPair) {
                      console.log(
                        `Found valid pair: ${pair.name} with bin step: ${binStep}`
                      );
                    }
                    return isValidPair;
                  });

                  if (filteredPairs.length > 0) {
                    console.log(
                      `Filtered to ${filteredPairs.length} valid pairs for ${term}`
                    );

                    // Check if we already have these pairs (avoid duplicates)
                    for (const pair of filteredPairs) {
                      const isDuplicate = allPools.some(
                        (p) =>
                          p.name === pair.name && p.bin_step === pair.bin_step
                      );

                      if (!isDuplicate) {
                        allPools.push(pair);
                      }
                    }
                  }
                }
              });
            } else {
              console.log(`No groups found for ${term}`);
            }
          } catch (error) {
            console.error(`Error fetching pools for ${term}:`, error);
            // Continue with next term
          }
        }

        // If we're still missing some pairs, try broader searches
        if (allPools.length < 6) {
          console.log(
            `Only found ${allPools.length} pools with direct searches, trying broader search`
          );

          // Try broader search terms
          const broaderTerms = ["wbtc", "zbtc", "cbbtc"];

          for (const term of broaderTerms) {
            try {
              console.log(`Trying broader search for: ${term}`);
              const broadData = await fetchPools(term);

              if (
                broadData &&
                broadData.groups &&
                broadData.groups.length > 0
              ) {
                (broadData.groups as Group[]).forEach((group) => {
                  if (group.pairs && group.pairs.length > 0) {
                    const validPairs = group.pairs.filter((pair) => {
                      const name = pair.name.toLowerCase();
                      const binStep = pair.bin_step || 0;

                      return (
                        (name === "wbtc-sol" ||
                          name === "zbtc-sol" ||
                          name === "cbbtc-sol") &&
                        !name.includes("jito") &&
                        allowedBinSteps.includes(binStep)
                      );
                    });

                    if (validPairs.length > 0) {
                      console.log(
                        `Broader search found ${validPairs.length} pairs for ${term}`
                      );

                      // Add only non-duplicate pairs
                      for (const pair of validPairs) {
                        const isDuplicate = allPools.some(
                          (p) =>
                            p.name === pair.name && p.bin_step === pair.bin_step
                        );

                        if (!isDuplicate) {
                          allPools.push(pair);
                          console.log(
                            `Added new pool: ${pair.name} with bin step: ${
                              pair.bin_step || "unknown"
                            }`
                          );
                        }
                      }
                    }
                  }
                });
              }
            } catch (error) {
              console.error(`Error in broader search for ${term}:`, error);
            }
          }
        }

        console.log(`Total pools found after all searches: ${allPools.length}`);
        console.log(
          "Pool bin steps found:",
          allPools.map((p) => `${p.name}: ${p.bin_step}`).join(", ")
        );

        // Filter out pools with extremely low APY or 24h fees
        allPools = allPools.filter((pool) => {
          // Check if APY is too low (less than 0.03%)
          const isLowAPY = pool.apy < 0.03;

          // Check if 24h fees are too low (less than $5)
          const isLowFees = pool.fees_24h < 5;

          // Keep the pool only if it has reasonable APY and fees
          const shouldKeep = !isLowAPY && !isLowFees;

          // Log which pools are being removed
          if (!shouldKeep) {
            console.log(
              `Removing pool with low metrics: ${pool.name} (Bin Step: ${pool.bin_step}) - APY: ${pool.apy}%, 24h Fees: $${pool.fees_24h}`
            );
          }

          return shouldKeep;
        });

        console.log(`Pools after filtering low APY/fees: ${allPools.length}`);

        // If no pools found, show an error message
        if (allPools.length === 0) {
          // No pools found at all - provide a more informative message
          addMessage(
            "assistant",
            `I searched specifically for zBTC, wBTC, and cbBTC liquidity pools paired with SOL on Solana but couldn't find any matching pools at the moment. This could be due to:
                1. API limitations or temporary unavailability
                2. These specific pools might not be indexed by our data provider
                3. The pools might exist but with different naming conventions
            You could try again in a few moments.`
          );
          return;
        }

        if (allPools.length > 0) {
          // Log sorted pools to help with debugging
          console.log(
            "Top 3 sorted pools:",
            allPools.slice(0, 3).map((p) => ({
              name: p.name,
              tvl: p.liquidity,
              apy: p.apy,
              binStep: p.bin_step || "unknown", // Extract bin step if available
            }))
          );

          // Group pools by their token pair (e.g., WBTC-SOL)
          const poolsByName: { [key: string]: ApiPool[] } = {};

          allPools.forEach((pool) => {
            const name = pool.name;
            if (!poolsByName[name]) {
              poolsByName[name] = [];
            }
            poolsByName[name].push(pool);
          });

          console.log(
            "Grouped pools by name:",
            Object.keys(poolsByName).map((name) => ({
              name,
              count: poolsByName[name].length,
            }))
          );

          // For each group, sort the pools based on portfolio style and bin step
          Object.keys(poolsByName).forEach((name) => {
            const pools = poolsByName[name];

            // Filter out pools with less than $3k TVL
            const filteredPools = pools.filter(
              (pool) => parseFloat(pool.liquidity) >= 3000
            );

            // If no pools meet the TVL threshold, keep the original pools
            const poolsToSort =
              filteredPools.length > 0 ? filteredPools : pools;

            if (style === "conservative") {
              // Conservative: Prioritize bin step 50, then high TVL
              poolsToSort.sort((a, b) => {
                const binStepA = a.bin_step || 0;
                const binStepB = b.bin_step || 0;

                // First prioritize bin step 50
                if (binStepA === 50 && binStepB !== 50) return -1;
                if (binStepA !== 50 && binStepB === 50) return 1;

                // Then prioritize higher TVL
                return parseFloat(b.liquidity) - parseFloat(a.liquidity);
              });
            } else if (style === "moderate") {
              // Moderate: Prioritize bin steps 10 and 15, then balance TVL and APY
              poolsToSort.sort((a, b) => {
                const binStepA = a.bin_step || 0;
                const binStepB = b.bin_step || 0;

                // First check if bin step is 10 or 15
                const isPreferredBinStepA = binStepA === 10 || binStepA === 15;
                const isPreferredBinStepB = binStepB === 10 || binStepB === 15;

                if (isPreferredBinStepA && !isPreferredBinStepB) return -1;
                if (!isPreferredBinStepA && isPreferredBinStepB) return 1;

                // If both are preferred bin steps, prioritize bin step 10 over 15
                if (isPreferredBinStepA && isPreferredBinStepB) {
                  if (binStepA === 10 && binStepB === 15) return -1;
                  if (binStepA === 15 && binStepB === 10) return 1;
                }

                // Then balance TVL and APY
                const scoreA = parseFloat(a.liquidity) * 0.6 + a.apy * 0.4;
                const scoreB = parseFloat(b.liquidity) * 0.6 + b.apy * 0.4;
                return scoreB - scoreA;
              });
            } else {
              // Aggressive: Prioritize bin step 5, then APY
              poolsToSort.sort((a, b) => {
                const binStepA = a.bin_step || 0;
                const binStepB = b.bin_step || 0;

                // First prioritize bin step 5
                if (binStepA === 5 && binStepB !== 5) return -1;
                if (binStepA !== 5 && binStepB === 5) return 1;

                // Then prioritize higher APY
                return b.apy - a.apy;
              });
            }

            // Replace the original pools with the sorted ones
            poolsByName[name] = poolsToSort;
          });

          // Flatten the sorted pools back into a single array
          allPools = [];
          Object.values(poolsByName).forEach((pools) => {
            allPools = [...allPools, ...pools];
          });

          // Select a single pool based on the sorting criteria
          let selectedPool: ApiPool | null = null;

          // Define preferred bin steps based on portfolio style
          const preferredBinSteps =
            style === "conservative"
              ? [50]
              : style === "moderate"
              ? [10, 15]
              : [5];

          console.log(
            `Looking for pools with preferred bin steps for ${style} portfolio: ${preferredBinSteps.join(
              ", "
            )}`
          );

          // If we have any pools available
          if (allPools.length > 0) {
            // First try to find a pool with preferred bin step that we haven't shown yet
            for (const pool of allPools) {
              const binStep = pool.bin_step || 0;
              const isDuplicate = shownPoolAddresses.includes(pool.address);
              const hasPreferredBinStep = preferredBinSteps.includes(binStep);

              if (!isDuplicate && hasPreferredBinStep) {
                selectedPool = pool;
                console.log(
                  `Found unshown pool with preferred bin step ${binStep}: ${pool.name}`
                );
                break;
              }
            }

            // If no preferred bin step pool found, try any unshown pool
            if (!selectedPool) {
              for (const pool of allPools) {
                const isDuplicate = shownPoolAddresses.includes(pool.address);

                if (!isDuplicate) {
                  selectedPool = pool;
                  console.log(
                    `No preferred bin step pools available, using: ${
                      pool.name
                    } with bin step ${pool.bin_step || 0}`
                  );
                  break;
                }
              }
            }

            // If all pools have been shown, take the first one with preferred bin step
            if (!selectedPool) {
              const preferredPool = allPools.find((pool) =>
                preferredBinSteps.includes(pool.bin_step || 0)
              );

              if (preferredPool) {
                selectedPool = preferredPool;
                console.log(
                  `All pools shown already, showing preferred bin step pool again: ${preferredPool.name}`
                );
              } else {
                // If no preferred bin step pool, just take the first one
                selectedPool = allPools[0];
                console.log(
                  `No pools with preferred bin steps, showing first available: ${selectedPool.name}`
                );
              }
            }

            // Format the selected pool
            if (selectedPool) {
              // Calculate fee APY safely
              const fees24h =
                typeof selectedPool.fees_24h === "number"
                  ? selectedPool.fees_24h
                  : 0;
              const liquidityValue = parseFloat(selectedPool.liquidity);
              const feeAPY = (fees24h / liquidityValue) * 100;

              // Get bin step if available
              const binStep = selectedPool.bin_step || "N/A";

              // Add the pool to our shown pools list to avoid duplicates
              setShownPoolAddresses((prev) => [...prev, selectedPool!.address]);

              // Track bin step for this portfolio style
              setShownBinStepsPerStyle((prev) => {
                const updatedSteps = { ...prev };
                const binStepNum =
                  typeof binStep === "string" ? parseInt(binStep) : binStep;
                if (
                  !isNaN(binStepNum) &&
                  !updatedSteps[style || "conservative"].includes(binStepNum)
                ) {
                  updatedSteps[style || "conservative"] = [
                    ...updatedSteps[style || "conservative"],
                    binStepNum,
                  ];
                }
                return updatedSteps;
              });

              console.log(
                `Adding pool with bin step ${binStep} to shown pools for ${style} portfolio`
              );

              // Create formatted pool without hardcoded analysis
              const formattedPool = {
                name: selectedPool.name,
                address: selectedPool.address,
                liquidity: formatCurrencyValue(selectedPool.liquidity, 0),
                currentPrice: formatCurrencyValue(
                  selectedPool.current_price,
                  2
                ),
                apy: feeAPY.toFixed(2) + "%",
                fees24h: formatCurrencyValue(fees24h, 2),
                volume24h: formatCurrencyValue(
                  selectedPool.trade_volume_24h,
                  0
                ),
                binStep: binStep.toString(),
                estimatedDailyEarnings: (
                  (fees24h / liquidityValue) *
                  10000
                ).toFixed(2),
                investmentAmount: "10,000",
                riskLevel: style || "conservative"
              };

              // Use AI to analyze the pool instead of hardcoded messages
              try {
                // Add an empty assistant message with the pool data to start streaming into
                addMessage("assistant", "", [formattedPool]);
                
                // Reset streaming state
                setStreamingMessage("");
                setIsStreaming(true);
                
                // Get AI analysis of the pool with streaming updates
                const analysis = await fetchMessage(
                  [], // Empty message history for pure analysis
                  formattedPool,
                  style || "conservative",
                  (chunk) => {
                    // Update the streaming message as chunks arrive
                    setStreamingMessage(prev => (prev || "") + chunk);
                  }
                );
                
                // Update the placeholder message with the full response
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].content = analysis;
                  return newMessages;
                });
                
                // Also update messageWithPools
                setMessageWithPools(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].message.content = analysis;
                  return newMessages;
                });
                
                // Reset streaming state
                setStreamingMessage(null);
                setIsStreaming(false);

                // Optional: uncomment if you want to scroll to bottom when AI response is finished
                // scrollToBottom();
              } catch (error) {
                console.error("Error getting AI analysis:", error);
                // Reset streaming state
                setStreamingMessage(null);
                setIsStreaming(false);
                
                // Fallback message if AI analysis fails
                addMessage(
                  "assistant",
                  `Here's a ${style || "recommended"} liquidity pool that matches your criteria. This ${formattedPool.name} pool has a bin step of ${formattedPool.binStep} and currently offers an APY of ${formattedPool.apy}.`,
                  [formattedPool]
                );
              }

              // Remove the loading message from the messages array
              setMessages((prevMessages) => {
                // Find and remove both the loading message and the portfolio style selection message
                return prevMessages.filter(
                  (msg) =>
                    !(
                      msg.role === "assistant" &&
                      (msg.content.includes(
                        `Finding the best ${style} Solana liquidity pools for you...`
                      ) ||
                        msg.content.includes(
                          `Finding the best Solana liquidity pools based on your request...`
                        ) ||
                        msg.content.includes("You've selected the") ||
                        msg.content.includes(
                          "portfolio style. I'll recommend pools"
                        ))
                    )
                );
              });

              // Also remove from messageWithPools
              setMessageWithPools((prevMsgWithPools) => {
                return prevMsgWithPools.filter(
                  (item) =>
                    !(
                      item.message.role === "assistant" &&
                      (item.message.content.includes(
                        `Finding the best ${style} Solana liquidity pools for you...`
                      ) ||
                        item.message.content.includes(
                          `Finding the best Solana liquidity pools based on your request...`
                        ) ||
                        item.message.content.includes("You've selected the") ||
                        item.message.content.includes(
                          "portfolio style. I'll recommend pools"
                        ))
                    )
                );
              });

              // Update current pools for reference
              setCurrentPools([formattedPool]);
            }
          } else {
            // No pools found after filtering
            addMessage(
              "assistant",
              `I couldn't find any ${style} pools that match your criteria at the moment. Please try again later or adjust your preferences.`
            );
          }
        } else {
          // No pools found at all - provide a more informative message
          addMessage(
            "assistant",
            `I searched specifically for zBTC, wBTC, and cbBTC liquidity pools paired with SOL on Solana but couldn't find any matching pools at the moment. This could be due to:
            1. API limitations or temporary unavailability
            2. These specific pools might not be indexed by our data provider
            3. The pools might exist but with different naming conventions
            You could try again in a few moments.`
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
    [
      currentPools,
      addMessage,
      formatCurrencyValue,
      selectedPortfolioStyle,
      shownPoolAddresses,
      differentPoolRequests,
    ]
  );

  const handleSendMessage = useCallback(
    async (message?: string) => {
      const messageToSend = message || inputMessage;
      if (!messageToSend.trim()) return;

      // Add user message
      addMessage("user", messageToSend);
      const userMessage = messageToSend;
      setInputMessage("");
      setIsLoading(true);

      // Add a small delay to ensure the user message is displayed first
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        // Check if message is about finding pools/recommendations
        const lowerCaseMessage = userMessage.toLowerCase();

        // Check if this is a quick action educational question about pools
        const isEducationalPoolQuestion =
          (lowerCaseMessage.includes("what is") &&
            (lowerCaseMessage.includes("pool") ||
              lowerCaseMessage.includes("lp") ||
              lowerCaseMessage.includes("liquidity"))) ||
          (lowerCaseMessage.includes("how does") &&
            lowerCaseMessage.includes("work")) ||
          lowerCaseMessage.includes("why solana") ||
          lowerCaseMessage.includes("what are the risks");

        // Check if the user is asking for another pool
        const isAskingForAnotherPool =
          lowerCaseMessage.includes("another") ||
          lowerCaseMessage.includes("different") ||
          (lowerCaseMessage.includes("show") &&
            lowerCaseMessage.includes("more")) ||
          lowerCaseMessage.includes("other options") ||
          lowerCaseMessage.includes("alternatives");

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

          addMessage("assistant", "", undefined);

          // Reset streaming state
          setStreamingMessage("");
          setIsStreaming(true);

          // Send to API with streaming updates
          const response = await fetchMessage(
            messageHistory, 
            undefined, 
            undefined,
            (chunk) => {
              // Update the streaming message as chunks arrive
              setStreamingMessage(prev => (prev || "") + chunk);
            }
          );
          
          // Update the placeholder message with the full response
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = response;
            return newMessages;
          });
          
          // Also update messageWithPools
          setMessageWithPools(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].message.content = response;
            return newMessages;
          });
          
          // Reset streaming state
          setStreamingMessage(null);
          setIsStreaming(false);

          // Optional: uncomment if you want to scroll to bottom when AI response is finished
          // scrollToBottom();
        }
        // Check if user is asking for another pool
        else if (isAskingForAnotherPool) {
          console.log("User is asking for another pool");

          // Increment the counter for different pool requests to cycle through options
          setDifferentPoolRequests((prev) => prev + 1);

          // Check if we've shown all bin steps for this portfolio style
          const shownBinStepsForStyle =
            shownBinStepsPerStyle[selectedPortfolioStyle || "conservative"] ||
            [];
          const preferredBinSteps =
            selectedPortfolioStyle === "conservative"
              ? [50]
              : selectedPortfolioStyle === "moderate"
              ? [10, 15]
              : [5];

          const allPreferredBinStepsShown = preferredBinSteps.every((step) =>
            shownBinStepsForStyle.includes(step)
          );

          console.log(
            `Shown bin steps for ${selectedPortfolioStyle} portfolio: ${shownBinStepsForStyle.join(
              ", "
            )}`
          );
          console.log(
            `All preferred bin steps shown: ${allPreferredBinStepsShown}`
          );

          // If we've shown all preferred bin steps, reset to allow showing them again
          if (allPreferredBinStepsShown) {
            console.log(
              "All preferred bin steps have been shown, resetting tracking to show them again"
            );
            setShownBinStepsPerStyle((prev) => ({
              ...prev,
              [selectedPortfolioStyle || "conservative"]: [],
            }));
          }

          await showBestYieldPool(selectedPortfolioStyle || "conservative");
        }
        // Otherwise, check if it's a pool discovery request
        else if (
          // More specific pool finding patterns
          ((lowerCaseMessage.includes("find") ||
            lowerCaseMessage.includes("show") ||
            lowerCaseMessage.includes("get")) &&
            (lowerCaseMessage.includes("pool") ||
              lowerCaseMessage.includes("liquidity"))) ||
          lowerCaseMessage.includes("recommend") ||
          lowerCaseMessage.match(/best\s+pool/i) ||
          lowerCaseMessage.match(/highest\s+yield/i) ||
          lowerCaseMessage.match(/best\s+yield/i) ||
          lowerCaseMessage.match(/best\s+liquidity/i) ||
          lowerCaseMessage.match(/high\s+tvl/i) ||
          // Questions specifically about what to invest in
          (lowerCaseMessage.includes("invest") &&
            lowerCaseMessage.includes("where")) ||
          (lowerCaseMessage.includes("which") &&
            lowerCaseMessage.includes("pool")) ||
          // Direct pool requests
          lowerCaseMessage.match(/btc\s+pool/i) ||
          lowerCaseMessage.match(/bitcoin\s+pool/i) ||
          // Clear requests for LP opportunities
          lowerCaseMessage.match(/lp\s+opportunities/i) ||
          lowerCaseMessage.match(/liquidity\s+provision\s+options/i)
        ) {
          console.log("Detected pool query:", lowerCaseMessage);
          await showBestYieldPool(selectedPortfolioStyle || null);
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

          addMessage("assistant", "", undefined);

          // Reset streaming state
          setStreamingMessage("");
          setIsStreaming(true);

          // Send to API with streaming updates
          const response = await fetchMessage(
            messageHistory, 
            undefined, 
            undefined,
            (chunk) => {
              // Update the streaming message as chunks arrive
              setStreamingMessage(prev => (prev || "") + chunk);
            }
          );
          
          // Update the placeholder message with the full response
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = response;
            return newMessages;
          });
          
          // Also update messageWithPools
          setMessageWithPools(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].message.content = response;
            return newMessages;
          });
          
          // Reset streaming state
          setStreamingMessage(null);
          setIsStreaming(false);

          // Optional: uncomment if you want to scroll to bottom when AI response is finished
          // scrollToBottom();
        }
      } catch (error) {
        console.error("Error sending message:", error);
        addErrorMessage(error);
        // Reset streaming state
        setStreamingMessage(null);
        setIsStreaming(false);

        // Optional: uncomment if you want to scroll to bottom when error message is shown
        // scrollToBottom();
      } finally {
        setIsLoading(false);
      }
    },
    [
      inputMessage,
      messages,
      selectedPortfolioStyle,
      addMessage,
      addErrorMessage,
      showBestYieldPool,
      shownPoolAddresses,
      shownBinStepsPerStyle
    ]
  );

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
  const handleSelectPortfolioStyle = async (style: string) => {
    setSelectedPortfolioStyle(style);

    try {
      // Add an empty assistant message to start streaming into
      if (!showWelcomeScreen) {
        // Not first-time selection
        addMessage("assistant", "", undefined);
      } else {
        // First-time selection from welcome screen
        setShowWelcomeScreen(false);
        addMessage("assistant", "", undefined);
      }

      // Reset streaming state
      setStreamingMessage("");
      setIsStreaming(true);
      
      // Generate welcome message using AI with streaming updates
      const welcomeMessage = await fetchMessage(
        [{ 
          role: "user", 
          content: `I've selected the ${style} portfolio style. Please provide a well-structured welcome message explaining what this means for my liquidity pool recommendations. Format it with clear bullet points for the key characteristics of this portfolio style and end with a brief question about what I'm interested in learning more about.` 
        }],
        undefined,
        style,
        (chunk) => {
          // Update the streaming message as chunks arrive
          setStreamingMessage(prev => (prev || "") + chunk);
        }
      );

      // Update the placeholder message with the full response
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = welcomeMessage;
        return newMessages;
      });
      
      // Also update messageWithPools
      setMessageWithPools(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].message.content = welcomeMessage;
        return newMessages;
      });
      
      // Reset streaming state
      setStreamingMessage(null);
      setIsStreaming(false);

      // Optional: uncomment if you want to scroll to bottom when welcome message is finished
      // scrollToBottom();

      // Always show pool recommendations, regardless of whether we're coming from welcome screen
      showBestYieldPool(style);
    } catch (error) {
      console.error("Error generating welcome message:", error);
      
      // Reset streaming state
      setStreamingMessage(null);
      setIsStreaming(false);
      
      // Fallback to hardcoded messages if AI fails
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
          } portfolio style. I'll recommend pools that match your risk preference.`
        );
      }
      
      // Show pool recommendations even if welcome message fails
      showBestYieldPool(style);
    }
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

  // Effects
  useEffect(() => {
    // Only scroll to bottom when a new user message is added or when showing the welcome screen
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.role === "user";
    
    if (isUserMessage || showWelcomeScreen) {
      // Add a small delay to ensure DOM updates have completed
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages, showWelcomeScreen]);

  // Update the function to split the AI response into two parts, preserving questions
  const splitAIResponse = (response: string): { part1: string, part2: string } => {
    if (!response) return { part1: "", part2: "" };
    
    // Try to find natural split points
    const splitKeywords = [
      "Risk Considerations:", 
      "Risk Analysis:", 
      "Potential Risks:", 
      "Risk Assessment:",
      "Risk Factors:",
      "Risk Profile:",
      "Before investing, consider:",
      "Important considerations:",
      "Key risks to be aware of:",
      "Risks to consider:"
    ];
    
    // Check if any of the split keywords exist in the response
    for (const keyword of splitKeywords) {
      const index = response.indexOf(keyword);
      if (index !== -1) {
        return {
          part1: response.substring(0, index).trim(),
          part2: response.substring(index).trim()
        };
      }
    }
    
    // Check for questions at the end of the response
    const questionRegex = /\n\n(Have you considered|Would you like|Are you interested|What are your thoughts|How do you feel|Do you prefer|Are you looking|What's your|What is your|Do you have)[^?]+\?(\s*\n\n[^?]+\?)?$/i;
    const questionMatch = response.match(questionRegex);
    
    // If there are questions at the end, make sure they go in the right part
    if (questionMatch && questionMatch.index !== undefined) {
      const questionStartIndex = questionMatch.index;
      const questionText = questionMatch[0];
      
      // If the response is short, keep it all in part1
      if (response.length < 500) {
        return {
          part1: response,
          part2: ""
        };
      }
      
      // Try to split at a paragraph break before the questions
      const contentBeforeQuestions = response.substring(0, questionStartIndex);
      const paragraphs = contentBeforeQuestions.split("\n\n");
      
      if (paragraphs.length > 1) {
        const midPoint = Math.floor(paragraphs.length / 2);
        return {
          part1: paragraphs.slice(0, midPoint).join("\n\n").trim(),
          part2: paragraphs.slice(midPoint).join("\n\n").trim() + questionText
        };
      }
    }
    
    // If no questions or natural split points, try to split at a paragraph break near the middle
    const paragraphs = response.split("\n\n");
    if (paragraphs.length > 1) {
      const midPoint = Math.floor(paragraphs.length / 2);
      return {
        part1: paragraphs.slice(0, midPoint).join("\n\n").trim(),
        part2: paragraphs.slice(midPoint).join("\n\n").trim()
      };
    }
    
    // If no paragraphs, just split in half
    const midPoint = Math.floor(response.length / 2);
    const sentenceEndNearMid = response.substring(0, midPoint).lastIndexOf(". ") + 1;
    
    if (sentenceEndNearMid > 0) {
      return {
        part1: response.substring(0, sentenceEndNearMid).trim(),
        part2: response.substring(sentenceEndNearMid).trim()
      };
    }
    
    // If all else fails, just put everything in part1
    return {
      part1: response,
      part2: ""
    };
  };

  // Render component - using the new structure
  if (showWelcomeScreen) {
    return (
      <div className="flex flex-col h-[calc(100vh-100px)] w-full lg:max-w-4xl mx-auto">
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
    <div className="flex flex-col h-[calc(100vh-100px)]  lg:max-w-4xl mx-auto">
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
              className={isPoolLoading ? "animate-spin" : ""}
            />
            {isPoolLoading ? <span className="lg:inline hidden">Finding...</span> : <span className="lg:inline hidden">Refresh Pools</span>}
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
        <div className="flex flex-col [&:not(:first-child)]:mt-8">
          {messageWithPools.map((item, index, array) => {
            // Check if this is a loading or result message
            const isPoolMessage =
              item.message.role === "assistant" &&
              (item.message.content.includes("Finding the best") ||
                item.message.content.includes("Found the optimal") ||
                /Finding the best \w+ Solana liquidity pools for you/.test(
                  item.message.content
                ));

            // Show loading message only if it's the last message and no pools yet
            const isLoadingState =
              isPoolMessage &&
              index === array.length - 1 &&
              (!item.pools || item.pools.length === 0);

            // Check if this is a loading message and the next message shows pools
            const shouldHideLoadingMessage =
              isPoolMessage &&
              index < array.length - 1 &&
              array[index + 1].pools &&
              array[index + 1].pools!.length > 0;

            // Check if this is the last assistant message and should show streaming content
            const isLastMessage = index === array.length - 1;
            const isAssistantMessage = item.message.role === "assistant";
            const shouldShowStreaming = isLastMessage && isAssistantMessage && isStreaming;
            // Determine if streaming should be shown in the pool list or in the regular message
            const showStreamingInPool = shouldShowStreaming && item.pools && item.pools.length > 0;
            const showStreamingInMessage = shouldShowStreaming && (!item.pools || item.pools.length === 0);

            return (
              <React.Fragment key={index}>
                {/* Only show message if it's not a loading message that should be hidden */}
                {!shouldHideLoadingMessage &&
                  (isLoadingState || !isPoolMessage) && (
                    <>
                      {/* Don't show the AI message if it's already shown in BtcPoolsList */}
                      {!(item.message.role === "assistant" && item.pools && item.pools.length > 0) && (
                        <ChatMessage 
                          message={item.message} 
                          streamingMessage={showStreamingInMessage ? streamingMessage : undefined}
                          isStreaming={showStreamingInMessage}
                        />
                      )}
                      {/* Add hr after AI responses that don't have pools, but only if not streaming */}
                      {item.message.role === "assistant" &&
                        !item.pools &&
                        !isLoadingState && 
                        !showStreamingInMessage && <hr className="mt-8" />}
                    </>
                  )}
                {item.pools && item.pools.length > 0 && (
                  <div className="w-full">
                    {/* Split the AI response or use streaming content */}
                    {(() => {
                      // If streaming, show all content in the first part
                      if (showStreamingInPool) {
                        return (
                          <BtcPoolsList
                            pools={item.pools}
                            onAddLiquidity={handleAddLiquidity}
                            isLoading={isPoolLoading}
                            aiResponse={item.message.content}
                            aiResponsePart1=""  // Will be replaced by streaming content
                            aiResponsePart2=""
                            isStreaming={true}
                            streamingContent={streamingMessage}
                          />
                        );
                      } 
                      // If not streaming, split the response
                      else {
                        const { part1, part2 } = splitAIResponse(item.message.content);
                        return (
                          <BtcPoolsList
                            pools={item.pools}
                            onAddLiquidity={handleAddLiquidity}
                            isLoading={isPoolLoading}
                            aiResponse={item.message.content}
                            aiResponsePart1={part1}
                            aiResponsePart2={part2}
                            isStreaming={false}
                            streamingContent={null}
                          />
                        );
                      }
                    })()}

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
