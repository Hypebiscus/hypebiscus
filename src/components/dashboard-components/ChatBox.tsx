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
import { FormattedPool } from '@/lib/utils/poolUtils';
import { useErrorHandler } from '@/lib/utils/errorHandling';
import { usePoolSearchService } from '@/lib/services/poolSearchService';
import { getPreferredBinSteps } from '@/lib/utils/poolUtils';

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
  const [selectedPortfolioStyle, setSelectedPortfolioStyle] = useState<string | null>(null);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(true);
  
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

  /**
   * Refactored showBestYieldPool using the new service
   */
  const showBestYieldPool = useCallback(
    async (style: string | null) => {
      setIsPoolLoading(true);

      try {
        // Search for pools using the service
        const allPools = await poolSearchService.searchPools({
          style,
          shownPoolAddresses,
          onLoadingMessage: (message) => addMessage("assistant", message),
          onError: addErrorMessage,
          handleAsyncError
        });

        // Handle no pools found
        if (allPools.length === 0) {
          addMessage("assistant", poolSearchService.getNoPoolsFoundMessage());
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

          // Add empty assistant message to start streaming
          addMessage("assistant", "", []);
          
          // Reset streaming state
          setStreamingMessage("");
          setIsStreaming(true);

          // Process the selected pool with AI analysis
          await poolSearchService.processSelectedPool({
            selectedPool,
            style,
            onStreamingUpdate: (chunk) => {
              setStreamingMessage(prev => (prev || "") + chunk);
            },
            onComplete: (analysis, formattedPool) => {
              // Update the placeholder message with the full response
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].content = analysis;
                return newMessages;
              });
              
              setMessageWithPools(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  message: { ...newMessages[newMessages.length - 1].message, content: analysis },
                  pools: [formattedPool]
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
            `I couldn't find any ${style} pools that match your criteria at the moment. Please try again later or adjust your preferences.`
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
      cleanupLoadingMessages
    ]
  );

  // Rest of the component methods remain the same...
  const handleSendMessage = useCallback(
    async (message?: string) => {
      const messageToSend = message || inputMessage;
      if (!messageToSend.trim()) return;

      addMessage("user", messageToSend);
      const userMessage = messageToSend;
      setInputMessage("");
      setIsLoading(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        const lowerCaseMessage = userMessage.toLowerCase();

        const isEducationalPoolQuestion =
          (lowerCaseMessage.includes("what is") &&
            (lowerCaseMessage.includes("pool") ||
              lowerCaseMessage.includes("lp") ||
              lowerCaseMessage.includes("liquidity"))) ||
          (lowerCaseMessage.includes("how does") &&
            lowerCaseMessage.includes("work")) ||
          lowerCaseMessage.includes("why solana") ||
          lowerCaseMessage.includes("what are the risks");

        const isAskingForAnotherPool =
          lowerCaseMessage.includes("another") ||
          lowerCaseMessage.includes("different") ||
          (lowerCaseMessage.includes("show") &&
            lowerCaseMessage.includes("more")) ||
          lowerCaseMessage.includes("other options") ||
          lowerCaseMessage.includes("alternatives");

        if (isEducationalPoolQuestion) {
          const messageHistory = [
            ...messages,
            {
              role: "user" as const,
              content: userMessage,
              timestamp: new Date(),
            },
          ];

          addMessage("assistant", "", undefined);
          setStreamingMessage("");
          setIsStreaming(true);

          const response = await fetchMessage(
            messageHistory, 
            undefined, 
            undefined,
            (chunk) => {
              setStreamingMessage(prev => (prev || "") + chunk);
            }
          );
          
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
          
          setStreamingMessage(null);
          setIsStreaming(false);
        }
        else if (isAskingForAnotherPool) {
          console.log("User is asking for another pool");

          setDifferentPoolRequests((prev) => prev + 1);

          const shownBinStepsForStyle =
            shownBinStepsPerStyle[selectedPortfolioStyle || "conservative"] ||
            [];
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
        }
        else if (
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
          (lowerCaseMessage.includes("invest") &&
            lowerCaseMessage.includes("where")) ||
          (lowerCaseMessage.includes("which") &&
            lowerCaseMessage.includes("pool")) ||
          lowerCaseMessage.match(/btc\s+pool/i) ||
          lowerCaseMessage.match(/bitcoin\s+pool/i) ||
          lowerCaseMessage.match(/lp\s+opportunities/i) ||
          lowerCaseMessage.match(/liquidity\s+provision\s+options/i)
        ) {
          console.log("Detected pool query:", lowerCaseMessage);
          await showBestYieldPool(selectedPortfolioStyle || null);
        } else {
          const messageHistory = [
            ...messages,
            {
              role: "user" as const,
              content: userMessage,
              timestamp: new Date(),
            },
          ];

          addMessage("assistant", "", undefined);
          setStreamingMessage("");
          setIsStreaming(true);

          const response = await fetchMessage(
            messageHistory, 
            undefined, 
            undefined,
            (chunk) => {
              setStreamingMessage(prev => (prev || "") + chunk);
            }
          );
          
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
          
          setStreamingMessage(null);
          setIsStreaming(false);
        }
      } catch (error) {
        console.error("Error sending message:", error);
        addErrorMessage(error);
        setStreamingMessage(null);
        setIsStreaming(false);
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
      shownBinStepsPerStyle
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

    try {
      if (!showWelcomeScreen) {
        addMessage("assistant", "", undefined);
      } else {
        setShowWelcomeScreen(false);
        addMessage("assistant", "", undefined);
      }

      setStreamingMessage("");
      setIsStreaming(true);
      
      const welcomeMessage = await fetchMessage(
        [{ 
          role: "user", 
          content: `I've selected the ${style} portfolio style. Please provide a well-structured welcome message explaining what this means for my liquidity pool recommendations. Format it with clear bullet points for the key characteristics of this portfolio style and end with a brief question about what I'm interested in learning more about.` 
        }],
        undefined,
        style,
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

      showBestYieldPool(style);
    } catch (error) {
      console.error("Error generating welcome message:", error);
      
      setStreamingMessage(null);
      setIsStreaming(false);
      
      if (!showWelcomeScreen) {
        addMessage(
          "assistant",
          `You've selected the ${
            style.charAt(0).toUpperCase() + style.slice(1)
          } portfolio style. I'll recommend pools that match your risk preference.`
        );
      } else {
        setShowWelcomeScreen(false);
        addMessage(
          "assistant",
          `Welcome! You've selected the ${
            style.charAt(0).toUpperCase() + style.slice(1)
          } portfolio style. I'll recommend pools that match your risk preference.`
        );
      }
      
      showBestYieldPool(style);
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

  // Split AI response function (unchanged)
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
    <div className="flex flex-col h-[calc(100vh-100px)] lg:max-w-4xl mx-auto">
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
                        <ChatMessage 
                          message={item.message} 
                          streamingMessage={showStreamingInMessage ? streamingMessage : undefined}
                          isStreaming={showStreamingInMessage}
                        />
                      )}
                      {item.message.role === "assistant" &&
                        !item.pools &&
                        !isLoadingState && 
                        !showStreamingInMessage && <hr className="mt-8" />}
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