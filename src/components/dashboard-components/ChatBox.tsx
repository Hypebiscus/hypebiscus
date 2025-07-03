// src/components/dashboard-components/ChatBox.tsx
"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  ChartLine,
  Clock,
  Plus,
  Wallet,
  ArrowClockwise,
  Shuffle,
} from "@phosphor-icons/react";
import BtcPoolsList from "./BtcPoolsList";
import BtcFilterDropdown from "./BtcFilterDropdown";
import BtcFilterModal from "./BtcFilterModal";
import AddLiquidityModal from "./AddLiquidityModal";
import QuickActionButtons from "./QuickActionButtons";
import PortfolioStyleModal from "./PortfolioStyleModal";
import ChatMessage from "@/components/chat-message";
import ChatInput from "@/components/chat-input";
import JupiterTerminal from "@/components/JupiterTerminal";
import { fetchMessage } from "@/lib/api/chat";
import { FormattedPool, formatPool, getPreferredBinSteps } from '@/lib/utils/poolUtils';
import { useErrorHandler } from '@/lib/utils/errorHandling';
import { usePoolSearchService } from '@/lib/services/poolSearchService';

// Type definitions
type MessageRole = "user" | "assistant";

interface Message {
  role: MessageRole;
  content: string;
  timestamp: Date;
}

interface MessageWithPool {
  message: Message;
  pools?: FormattedPool[];
}

const ChatBox: React.FC = () => {
  // State management
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [selectedPool, setSelectedPool] = useState<FormattedPool | null>(null);
  const [isAddLiquidityModalOpen, setIsAddLiquidityModalOpen] = useState(false);
  const [isPortfolioStyleModalOpen, setIsPortfolioStyleModalOpen] = useState(false);
  const [isBtcFilterModalOpen, setIsBtcFilterModalOpen] = useState(false);
  const [selectedPortfolioStyle, setSelectedPortfolioStyle] = useState<string | null>(null);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(true);
  const [activeTokenFilter, setActiveTokenFilter] = useState<string>('');
  
  // Jupiter Terminal state
  const [showJupiterTerminal, setShowJupiterTerminal] = useState(false);
  
  // Pool tracking states
  const [shownPoolAddresses, setShownPoolAddresses] = useState<string[]>([]);
  const [shownBinStepsPerStyle, setShownBinStepsPerStyle] = useState<{
    [style: string]: number[];
  }>({ conservative: [], moderate: [], aggressive: [] });
  const [, setDifferentPoolRequests] = useState(0);
  const [messageWithPools, setMessageWithPools] = useState<MessageWithPool[]>([]);

  // Streaming states
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Services
  const { handleError, handleAsyncError } = useErrorHandler();
  const { service: poolSearchService } = usePoolSearchService();

  // Intent detection patterns - moved to useMemo to avoid dependency warnings
  const MESSAGE_PATTERNS = useMemo(() => ({
    educational: [
      /what is.*(?:pool|lp|liquidity)/i,
      /how does.*work/i,
      /why solana/i,
      /what are the risks/i,
    ],
    poolRequest: [
      /(?:find|show|get).*(?:pool|liquidity)/i,
      /recommend/i,
      /best.*pool/i,
      /highest.*yield/i,
      /best.*yield/i,
      /best.*liquidity/i,
      /high.*tvl/i,
      /invest.*where/i,
      /which.*pool/i,
      /btc.*pool/i,
      /bitcoin.*pool/i,
      /lp.*opportunities/i,
      /liquidity.*provision.*options/i,
    ],
    alternativeRequest: [
      /another/i,
      /different/i,
      /show.*more/i,
      /other options/i,
      /alternatives/i,
    ],
    swapRequest: [
      /swap/i,
      /exchange/i,
      /trade.*token/i,
      /convert.*to/i,
      /buy.*with/i,
      /sell.*for/i,
      /jupiter/i,
    ],
  }), []);

  // Core message management
  const addMessage = useCallback(
    (role: MessageRole, content: string, pools?: FormattedPool[]) => {
      const newMessage = { role, content, timestamp: new Date() };
      setMessages((prev) => [...prev, newMessage]);
      setMessageWithPools((prev) => [...prev, { message: newMessage, pools }]);

      if (showWelcomeScreen) {
        setShowWelcomeScreen(false);
      }
    },
    [showWelcomeScreen]
  );

  const addErrorMessage = useCallback(
    (error: unknown) => {
      const appError = handleError(error, 'Chat operation');
      addMessage("assistant", appError.userMessage);
    },
    [addMessage, handleError]
  );

  /**
   * Cleans up loading messages from the message history
   */
  const cleanupLoadingMessages = useCallback((style: string | null) => {
    const loadingPatterns = [
      `Finding the best ${style} Solana liquidity pools for you...`,
      `Finding the best Solana liquidity pools based on your request...`,
      "You've selected the",
      "portfolio style. I'll recommend pools"
    ];

    setMessages((prevMessages) => {
      return prevMessages.filter(
        (msg) => !(
          msg.role === "assistant" &&
          loadingPatterns.some(pattern => msg.content.includes(pattern))
        )
      );
    });

    setMessageWithPools((prevMsgWithPools) => {
      return prevMsgWithPools.filter(
        (item) => !(
          item.message.role === "assistant" &&
          loadingPatterns.some(pattern => item.message.content.includes(pattern))
        )
      );
    });
  }, []);

  // Intent analysis function
  const analyzeMessageIntent = useCallback((message: string) => {
    const lowerMessage = message.toLowerCase();
    
    // Check for educational queries
    const isEducational = MESSAGE_PATTERNS.educational.some(pattern => 
      pattern.test(lowerMessage)
    );
    
    // Check for pool requests
    const isPoolRequest = MESSAGE_PATTERNS.poolRequest.some(pattern =>
      pattern.test(lowerMessage)
    );
    
    // Check for alternative pool requests
    const isAlternativeRequest = MESSAGE_PATTERNS.alternativeRequest.some(pattern =>
      pattern.test(lowerMessage)
    );
    
    // Check for swap requests
    const isSwapRequest = MESSAGE_PATTERNS.swapRequest.some(pattern =>
      pattern.test(lowerMessage)
    );
    
    return {
      isEducational,
      isPoolRequest,
      isAlternativeRequest,
      isSwapRequest,
      isGeneralChat: !isEducational && !isPoolRequest && !isAlternativeRequest && !isSwapRequest
    };
  }, [MESSAGE_PATTERNS]);

  // Handle swap requests
  const handleSwapRequest = useCallback(async () => {
    addMessage("assistant", "I'll open Jupiter Terminal for you to swap tokens. Jupiter Terminal provides the best rates across all Solana DEXes.");
    setShowJupiterTerminal(true);
  }, [addMessage]);

  // Streaming response handler
  const handleStreamingResponse = useCallback(async (
    messageHistory: Message[],
    poolData?: FormattedPool,
    portfolioStyle?: string
  ) => {
    addMessage("assistant", "", undefined);
    setStreamingMessage("");
    setIsStreaming(true);

    try {
      const response = await fetchMessage(
        messageHistory,
        poolData,
        portfolioStyle,
        (chunk) => {
          setStreamingMessage(prev => (prev || "") + chunk);
        }
      );
      
      // Update the placeholder message with the full response
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = response;
        return newMessages;
      });
      
      setMessageWithPools(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].message.content = response;
        return newMessages;
      });
      
      return response;
    } catch (error) {
      console.error('Streaming response error:', error);
      addErrorMessage(error);
      throw error;
    } finally {
      setStreamingMessage(null);
      setIsStreaming(false);
    }
  }, [addMessage, addErrorMessage]);

  // Handle educational queries
  const handleEducationalQuery = useCallback(async (userMessage: string) => {
    const messageHistory = [
      ...messages,
      {
        role: "user" as const,
        content: userMessage,
        timestamp: new Date(),
      },
    ];

    await handleStreamingResponse(messageHistory);
  }, [messages, handleStreamingResponse]);

  // Declare showBestYieldPool before it's used
  const showBestYieldPool = useCallback(
    async (style: string | null) => {
      setIsPoolLoading(true);

      try {
        // Search for pools using the service
        const allPools = await poolSearchService.searchPools({
          style,
          shownPoolAddresses,
          tokenFilter: activeTokenFilter || undefined, // Include active token filter
          onLoadingMessage: (message) => addMessage("assistant", message),
          onError: addErrorMessage,
          handleAsyncError
        });

        // Handle no pools found
        if (allPools.length === 0) {
          addMessage("assistant", poolSearchService.getNoPoolsFoundMessage(activeTokenFilter || undefined));
          return;
        }

        // Get the best pool
        const selectedPool = poolSearchService.getBestPool(allPools, style, shownPoolAddresses);

        if (selectedPool) {
          // Add to shown pools list
          setShownPoolAddresses((prev) => [...prev, selectedPool.address]);

          // Track bin step for this portfolio style
          setShownBinStepsPerStyle((prev) => {
            const updatedSteps = { ...prev };
            const binStepNum = selectedPool.bin_step || 0;
            const styleKey = style || "conservative";
            
            if (!updatedSteps[styleKey].includes(binStepNum)) {
              updatedSteps[styleKey] = [...updatedSteps[styleKey], binStepNum];
            }
            return updatedSteps;
          });

          console.log(`Adding pool with bin step ${selectedPool.bin_step} to shown pools for ${style} portfolio`);

          // First add the pool to the UI without AI analysis
          // Create a simple formatted pool with just the essential data
          const formattedPool: FormattedPool = formatPool(selectedPool, style || 'conservative');
          
          // Add empty assistant message with the pool data
          // This will show the pool UI immediately before streaming starts
          addMessage("assistant", "", [formattedPool]);
          
          // Reset streaming state
          setStreamingMessage("");
          setIsStreaming(true);
          
                      // We've already added the pool to the message, so we don't need this step anymore
          
          // Now process the selected pool with AI analysis
          await poolSearchService.processSelectedPool({
            selectedPool,
            style,
            onStreamingUpdate: (chunk) => {
              setStreamingMessage(prev => (prev || "") + chunk);
            },
            onComplete: (analysis) => {
              // Update the placeholder message with the full response
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].content = analysis;
                return newMessages;
              });
              
              // Update the message content but keep our existing pool data
              setMessageWithPools(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  message: { ...newMessages[newMessages.length - 1].message, content: analysis },
                  pools: newMessages[newMessages.length - 1].pools // Keep existing pools
                };
                return newMessages;
              });
              
              // Reset streaming state
              setStreamingMessage(null);
              setIsStreaming(false);
            },
            onError: () => {
              // Reset streaming state
              setStreamingMessage(null);
              setIsStreaming(false);
              
              // Fallback message if AI analysis fails
              const formattedPool = { 
                name: selectedPool.name, 
                binStep: selectedPool.bin_step?.toString() || 'N/A',
                apy: selectedPool.apy.toFixed(2) + '%'
              };
              
              addMessage(
                "assistant",
                `Here's a ${style || "recommended"} liquidity pool that matches your criteria. This ${formattedPool.name} pool has a bin step of ${formattedPool.binStep} and currently offers an APY of ${formattedPool.apy}.`,
                []
              );
            }
          });

          // Clean up loading messages
          cleanupLoadingMessages(style);

        } else {
          addMessage(
            "assistant",
            `I couldn't find any ${style || 'recommended'} pools that match your criteria at the moment. Please try again later or adjust your preferences.`
          );
        }

      } catch (error) {
        console.error("Error in showBestYieldPool:", error);
        addErrorMessage(error);
      } finally {
        setIsPoolLoading(false);
      }
    },
    [
      poolSearchService,
      addMessage,
      handleAsyncError,
      addErrorMessage,
      shownPoolAddresses,
      activeTokenFilter,
      cleanupLoadingMessages
    ]
  );

  // Handle alternative pool requests
  const handleAlternativePoolRequest = useCallback(async () => {
    console.log("User is asking for another pool");
    
    setDifferentPoolRequests((prev) => prev + 1);

    const shownBinStepsForStyle =
      shownBinStepsPerStyle[selectedPortfolioStyle || "conservative"] || [];
    const preferredBinSteps = getPreferredBinSteps(selectedPortfolioStyle || "conservative");

    const allPreferredBinStepsShown = preferredBinSteps.every((step) =>
      shownBinStepsForStyle.includes(step)
    );

    if (allPreferredBinStepsShown) {
      console.log("All preferred bin steps have been shown, resetting tracking to show them again");
      setShownBinStepsPerStyle((prev) => ({
        ...prev,
        [selectedPortfolioStyle || "conservative"]: [],
      }));
    }

    await showBestYieldPool(selectedPortfolioStyle || "conservative");
  }, [
    selectedPortfolioStyle,
    shownBinStepsPerStyle,
    setDifferentPoolRequests,
    setShownBinStepsPerStyle,
    showBestYieldPool
  ]);

  // Handle general pool requests
  const handlePoolRequest = useCallback(async () => {
    await showBestYieldPool(selectedPortfolioStyle || null);
  }, [selectedPortfolioStyle, showBestYieldPool]);

  // Handle general chat
  const handleGeneralChat = useCallback(async (userMessage: string) => {
    const messageHistory = [
      ...messages,
      {
        role: "user" as const,
        content: userMessage,
        timestamp: new Date(),
      },
    ];

    await handleStreamingResponse(messageHistory);
  }, [messages, handleStreamingResponse]);

  // Handle token filter search
  const handleTokenFilterSearch = useCallback(async (tokenFilter: string) => {
    setActiveTokenFilter(tokenFilter);
    
    // Clear previous messages about filters
    setMessages(prev => prev.filter(msg => 
      !msg.content.includes('Filtering by') && 
      !msg.content.includes('Showing pools for')
    ));
    
    // Add user message indicating filter selection
    const filterLabels: Record<string, string> = {
      'wbtc-sol': 'wBTC-SOL',
      'zbtc-sol': 'zBTC-SOL', 
      'cbbtc-sol': 'cbBTC-SOL',
      'btc': 'All BTC'
    };
    
    const filterMessage = `Show me ${filterLabels[tokenFilter] || tokenFilter} pools`;
    addMessage("user", filterMessage);
    
    // Set loading states
    setIsLoading(true);
    setIsPoolLoading(true);

    try {
      // Use the pool search service with token-specific filtering
      const filteredPools = await poolSearchService.searchPools({
        style: selectedPortfolioStyle,
        shownPoolAddresses: [], // Reset shown pools for new filter
        tokenFilter, // Pass the token filter
        onLoadingMessage: (message) => addMessage("assistant", message),
        onError: addErrorMessage,
        handleAsyncError
      });

      if (filteredPools.length === 0) {
        addMessage("assistant", `No ${filterLabels[tokenFilter] || tokenFilter} pools found that match your criteria. Try adjusting your portfolio style or check back later.`);
        return;
      }

      // Get the best pool for the selected style and token filter
      const selectedPool = poolSearchService.getBestPool(
        filteredPools, 
        selectedPortfolioStyle, 
        []
      );

      if (selectedPool) {
        // Reset shown pool addresses for new filter
        setShownPoolAddresses([selectedPool.address]);

        // First create a formatted pool to display immediately
        const formattedPool: FormattedPool = formatPool(selectedPool, selectedPortfolioStyle || 'conservative');
        
        // Add message with the pool data so it shows immediately
        addMessage("assistant", "", [formattedPool]);
        
        // Start streaming the AI analysis
        setStreamingMessage("");
        setIsStreaming(true);

        await poolSearchService.processSelectedPool({
          selectedPool,
          style: selectedPortfolioStyle,
          onStreamingUpdate: (chunk) => {
            setStreamingMessage(prev => (prev || "") + chunk);
          },
          onComplete: (analysis) => {
            setMessages(prev => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1].content = analysis;
              return newMessages;
            });
            
            // Update the message content but keep our existing pool data
            setMessageWithPools(prev => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                message: { ...newMessages[newMessages.length - 1].message, content: analysis },
                pools: newMessages[newMessages.length - 1].pools // Keep existing pools
              };
              return newMessages;
            });
            
            setStreamingMessage(null);
            setIsStreaming(false);
          },
          onError: () => {
            setStreamingMessage(null);
            setIsStreaming(false);
            addErrorMessage(new Error('Failed to analyze pool'));
          }
        });

        // Clean up loading messages
        cleanupLoadingMessages(selectedPortfolioStyle);
      }
    } catch (error) {
      console.error("Error in token filter search:", error);
      addErrorMessage(error);
    } finally {
      setIsLoading(false);
      setIsPoolLoading(false);
    }
  }, [
    selectedPortfolioStyle,
    poolSearchService,
    addMessage,
    addErrorMessage,
    handleAsyncError,
    cleanupLoadingMessages
  ]);

  // Main refactored handleSendMessage function
  const handleSendMessage = useCallback(
    async (message?: string) => {
      const messageToSend = message || inputMessage;
      if (!messageToSend.trim()) return;

      // Add user message and clear input
      addMessage("user", messageToSend);
      const userMessage = messageToSend;
      setInputMessage("");
      setIsLoading(true);

      // Small delay for UI responsiveness
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        // Analyze message intent
        const intent = analyzeMessageIntent(userMessage);
        
        // Route to appropriate handler based on intent
        if (intent.isSwapRequest) {
          await handleSwapRequest();
        } else if (intent.isEducational) {
          await handleEducationalQuery(userMessage);
        } else if (intent.isAlternativeRequest) {
          await handleAlternativePoolRequest();
        } else if (intent.isPoolRequest) {
          await handlePoolRequest();
        } else {
          await handleGeneralChat(userMessage);
        }
      } catch (error) {
        console.error("Error sending message:", error);
        addErrorMessage(error);
        // Ensure streaming state is cleaned up on error
        setStreamingMessage(null);
        setIsStreaming(false);
      } finally {
        setIsLoading(false);
      }
    },
    [
      inputMessage,
      addMessage,
      analyzeMessageIntent,
      handleSwapRequest,
      handleEducationalQuery,
      handleAlternativePoolRequest,
      handlePoolRequest,
      handleGeneralChat,
      addErrorMessage
    ]
  );

  const handleAddLiquidity = (pool: FormattedPool) => {
    setSelectedPool(pool);
    setIsAddLiquidityModalOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickAction = (question: string) => {
    handleSendMessage(question);
  };

  const handleSelectPortfolioStyle = async (style: string) => {
    setSelectedPortfolioStyle(style);
    
    // Close portfolio style modal and open BTC filter modal
    setIsPortfolioStyleModalOpen(false);
    setIsBtcFilterModalOpen(true);
  };

  const handleSelectBtcFilter = async (filter: string) => {
  setActiveTokenFilter(filter);
  setIsBtcFilterModalOpen(false);

  // Define filter labels inside the function
  const filterLabels: Record<string, string> = {
    'wbtc-sol': 'wBTC-SOL',
    'zbtc-sol': 'zBTC-SOL',
    'cbbtc-sol': 'cbBTC-SOL',
    'btc': 'All BTC'
  };

  try {
    if (!showWelcomeScreen) {
      addMessage("assistant", "", undefined);
    } else {
      setShowWelcomeScreen(false);
      addMessage("assistant", "", undefined);
    }

    setStreamingMessage("");
    setIsStreaming(true);
    
         // Generate concise portfolio + filter specific welcome message
     const portfolioStyle = selectedPortfolioStyle || 'conservative'; // Fix: provide fallback
     const welcomeMessage = await fetchMessage(
       [{ 
         role: "user", 
         content: `I've selected the ${portfolioStyle} portfolio style and want to focus on ${filterLabels[filter] || filter} pools. Please provide a VERY BRIEF welcome message (2-3 sentences maximum) that welcomes me to Hypebiscus and explains what this combination means for my liquidity pool recommendations. Be concise but engaging.` 
       }],
       undefined,
       portfolioStyle, // Use the fallback variable
       (chunk) => {
         setStreamingMessage(prev => (prev || "") + chunk);
       }
     );

    setMessages(prev => {
      const newMessages = [...prev];
      newMessages[newMessages.length - 1].content = welcomeMessage;
      return newMessages;
    });
    
    setMessageWithPools(prev => {
      const newMessages = [...prev];
      newMessages[newMessages.length - 1].message.content = welcomeMessage;
      return newMessages;
    });
    
    setStreamingMessage(null);
    setIsStreaming(false);

    // Start searching for pools with the selected filter
    await handleTokenFilterSearch(filter);
    
  } catch (error) {
    console.error("Error generating welcome message:", error);
    
    setStreamingMessage(null);
    setIsStreaming(false);
    
    // Fix: Use safe string manipulation with fallbacks
    const portfolioStyleFormatted = selectedPortfolioStyle 
      ? selectedPortfolioStyle.charAt(0).toUpperCase() + selectedPortfolioStyle.slice(1)
      : 'Conservative';
    
    if (!showWelcomeScreen) {
      addMessage(
        "assistant",
        `You've selected the ${portfolioStyleFormatted} portfolio style focusing on ${filterLabels[filter] || filter} pools. I'll recommend pools that match your preferences.`
      );
    } else {
      setShowWelcomeScreen(false);
      addMessage(
        "assistant",
        `Welcome! You've selected the ${portfolioStyleFormatted} portfolio style with ${filterLabels[filter] || filter} focus. I'll recommend pools that match your preferences.`
      );
    }
    
    await handleTokenFilterSearch(filter);
  }
};

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
      addErrorMessage(error);
    } finally {
      setIsPoolLoading(false);
    }
  }, [selectedPortfolioStyle, showBestYieldPool, addMessage, addErrorMessage]);

  // Effects
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.role === "user";
    
    if (isUserMessage || showWelcomeScreen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages, showWelcomeScreen]);

  // Split AI response function
  const splitAIResponse = (response: string): { part1: string, part2: string } => {
    if (!response) return { part1: "", part2: "" };
    
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
    
    for (const keyword of splitKeywords) {
      const index = response.indexOf(keyword);
      if (index !== -1) {
        return {
          part1: response.substring(0, index).trim(),
          part2: response.substring(index).trim()
        };
      }
    }
    
    const questionRegex = /\n\n(Have you considered|Would you like|Are you interested|What are your thoughts|How do you feel|Do you prefer|Are you looking|What's your|What is your|Do you have)[^?]+\?(\s*\n\n[^?]+\?)?$/i;
    const questionMatch = response.match(questionRegex);
    
    if (questionMatch && questionMatch.index !== undefined) {
      const questionStartIndex = questionMatch.index;
      const questionText = questionMatch[0];
      
      if (response.length < 500) {
        return {
          part1: response,
          part2: ""
        };
      }
      
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
    
    const paragraphs = response.split("\n\n");
    if (paragraphs.length > 1) {
      const midPoint = Math.floor(paragraphs.length / 2);
      return {
        part1: paragraphs.slice(0, midPoint).join("\n\n").trim(),
        part2: paragraphs.slice(midPoint).join("\n\n").trim()
      };
    }
    
    const midPoint = Math.floor(response.length / 2);
    const sentenceEndNearMid = response.substring(0, midPoint).lastIndexOf(". ") + 1;
    
    if (sentenceEndNearMid > 0) {
      return {
        part1: response.substring(0, sentenceEndNearMid).trim(),
        part2: response.substring(sentenceEndNearMid).trim()
      };
    }
    
    return {
      part1: response,
      part2: ""
    };
  };

  // Render component
  if (showWelcomeScreen) {
    return (
      <div className="flex flex-col h-[calc(100vh-100px)] w-full max-w-4xl mx-auto px-4">
        <div className="flex-1 flex flex-col items-center justify-start lg:p-4 p-0 mt-8 overflow-y-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-primary mb-2 text-center">
            Welcome to Hypebiscus
          </h1>
          <p className="text-white text-center font-medium max-w-md mb-6 text-sm md:text-base break-words">
            Your smart assistant for exploring BTC liquidity in the Solana DeFi ecosystem.
          </p>
          
          <div className="grid grid-cols-1 max-w-2xl gap-3 mb-6 w-full">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Clock className="text-primary" size={18} />
              </div>
              <p className="text-white text-sm break-words">
                Real-time discovery of BTC and zBTC liquidity pools on Solana.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Plus className="text-primary" size={18} />
              </div>
              <p className="text-white text-sm break-words">
                Instant &apos;Add Position&apos; capability.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <ChartLine className="text-primary" size={18} />
              </div>
              <p className="text-white text-sm break-words">
                Live pool analytics, including TVL, APR, and recent liquidity changes.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Wallet className="text-primary" size={18} />
              </div>
              <p className="text-white text-sm break-words">
                Secure, non-custodial wallet integration for direct on-chain transactions.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Shuffle className="text-primary" size={18} />
              </div>
              <p className="text-white text-sm break-words">
                Integrated Jupiter Terminal for seamless token swaps across all Solana DEXes.
              </p>
            </div>
          </div>
          
          {/* Portfolio Style Selection - Only this button */}
          <Button
            variant="outline"
            size="secondary"
            className="bg-secondary/30 border-primary text-white flex items-center gap-2 w-full max-w-xs"
            onClick={() => setIsPortfolioStyleModalOpen(true)}
          >
            <ChartLine size={18} />
            <span>Select Portfolio Style</span>
          </Button>
        </div>

        <div className="flex-shrink-0 lg:px-4 pb-4">
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
        </div>

        {/* Portfolio Style Modal */}
        <PortfolioStyleModal
          isOpen={isPortfolioStyleModalOpen}
          onClose={() => setIsPortfolioStyleModalOpen(false)}
          onSelectStyle={handleSelectPortfolioStyle}
        />
        
        {/* BTC Filter Modal */}
        <BtcFilterModal
          isOpen={isBtcFilterModalOpen}
          onClose={() => setIsBtcFilterModalOpen(false)}
          onSelectFilter={handleSelectBtcFilter}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6 flex-wrap">
        {/* Left side - BTC Filter Dropdown */}
        <div className="flex-shrink-0 min-w-0">
          <BtcFilterDropdown
            onFilterSelect={handleTokenFilterSearch}
            isLoading={isLoading || isPoolLoading}
            activeFilter={activeTokenFilter}
          />
        </div>
        
        {/* Right side - Portfolio, Jupiter, and Refresh buttons */}
        <div className="flex items-center lg:gap-2 gap-1 flex-shrink-0">
          {/* Jupiter Terminal Button */}
          <Button
            variant="secondary"
            size="secondary"
            className="bg-secondary/30 border-primary text-white flex items-center gap-2 hover:bg-primary/20 text-xs"
            onClick={() => setShowJupiterTerminal(true)}
            title="Open Jupiter Terminal for token swaps"
          >
            <Shuffle size={14} />
            <span className="hidden sm:inline">Swap</span>
          </Button>

          {selectedPortfolioStyle && (
            <Button
              variant="secondary"
              size="secondary"
              className="bg-secondary/30 border-primary text-white flex items-center gap-2 hover:bg-primary/20 text-xs"
              onClick={handleRefreshPools}
              disabled={isPoolLoading}
              title="Find different BTC pools with your current portfolio style"
            >
              <ArrowClockwise
                size={14}
                className={isPoolLoading ? "animate-spin" : ""}
              />
              <span className="hidden sm:inline">
                {isPoolLoading ? "Finding..." : "Refresh Pools"}
              </span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="secondary"
            className="bg-secondary/30 border-primary text-white flex items-center gap-2 text-xs"
            onClick={() => setIsPortfolioStyleModalOpen(true)}
          >
            <span className="truncate max-w-[120px] sm:max-w-none">
              {selectedPortfolioStyle ? (
                <>
                  <span className="hidden sm:inline">Portfolio: </span>
                  {selectedPortfolioStyle.charAt(0).toUpperCase() + selectedPortfolioStyle.slice(1)}
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Select </span>Portfolio<span className="hidden sm:inline"> Style</span>
                </>
              )}
            </span>
          </Button>
        </div>
      </div>

      {/* Jupiter Terminal Modal */}
      {showJupiterTerminal && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowJupiterTerminal(false)}
        >
          <div 
            className="w-full max-w-md lg:h-[600px] h-[85vh] max-h-[800px] rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()} // Prevent clicks on terminal from closing modal
          >
            <JupiterTerminal 
              className="w-full"
              onClose={() => setShowJupiterTerminal(false)}
            />
          </div>
        </div>
      )}

      {/* Scrollable chat messages area */}
      <div className="flex-1 overflow-y-auto pb-4 scrollbar-hide">
        <div className="flex flex-col space-y-6">
          {messageWithPools.map((item, index, array) => {
            const isPoolMessage =
              item.message.role === "assistant" &&
              (item.message.content.includes("Finding the best") ||
                item.message.content.includes("Found the optimal") ||
                /Finding the best \w+ Solana liquidity pools for you/.test(
                  item.message.content
                ));

            const isLoadingState =
              isPoolMessage &&
              index === array.length - 1 &&
              (!item.pools || item.pools.length === 0);

            const shouldHideLoadingMessage =
              isPoolMessage &&
              index < array.length - 1 &&
              array[index + 1].pools &&
              array[index + 1].pools!.length > 0;

            const isLastMessage = index === array.length - 1;
            const isAssistantMessage = item.message.role === "assistant";
            const shouldShowStreaming = isLastMessage && isAssistantMessage && isStreaming;
            const showStreamingInPool = shouldShowStreaming && item.pools && item.pools.length > 0;
            const showStreamingInMessage = shouldShowStreaming && (!item.pools || item.pools.length === 0);

            return (
              <React.Fragment key={index}>
                {!shouldHideLoadingMessage &&
                  (isLoadingState || !isPoolMessage) && (
                    <>
                      {!(item.message.role === "assistant" && item.pools && item.pools.length > 0) && (
                        <div className="w-full break-words">
                          <ChatMessage 
                            message={item.message} 
                            streamingMessage={showStreamingInMessage ? streamingMessage : undefined}
                            isStreaming={showStreamingInMessage}
                          />
                        </div>
                      )}
                      {item.message.role === "assistant" &&
                        !item.pools &&
                        !isLoadingState && 
                        !showStreamingInMessage && <hr className="mt-6 mb-10 border-border" />}
                    </>
                  )}
                {item.pools && item.pools.length > 0 && (
                  <div className="w-full">
                    {(() => {
                      if (showStreamingInPool) {
                        return (
                          <BtcPoolsList
                            pools={item.pools}
                            onAddLiquidity={handleAddLiquidity}
                            isLoading={isPoolLoading}
                            aiResponse={item.message.content}
                            aiResponsePart1=""
                            aiResponsePart2=""
                            isStreaming={true}
                            streamingContent={streamingMessage}
                          />
                        );
                      } else {
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

                    <hr className="mt-12 mb-8 border-border" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed chat input area */}
      <div className="flex-shrink-0 lg:pb-4 pb-0">
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
      </div>

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

      {/* BTC Filter Modal */}
      <BtcFilterModal
        isOpen={isBtcFilterModalOpen}
        onClose={() => setIsBtcFilterModalOpen(false)}
        onSelectFilter={handleSelectBtcFilter}
      />
    </div>
  );
};

export default ChatBox;