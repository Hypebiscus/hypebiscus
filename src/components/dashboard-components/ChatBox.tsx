// src/components/dashboard-components/ChatBox.tsx
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal, Loader2, Search, Shield, BarChart, PlusCircle } from "lucide-react";
import BtcPoolsList from './BtcPoolsList';
import AddLiquidityModal from './AddLiquidityModal';
import QuickActionButtons from './QuickActionButtons';
import PortfolioStyleModal from './PortfolioStyleModal';
import { fetchMessage } from '@/lib/api/chat';
import { fetchPools } from '@/lib/api/pools';
import { formatPoolData } from '@/lib/api/formatters';
import { useMeteoraDlmmService } from "@/lib/meteora/meteoraDlmmService";
import { useMeteoraPositionService } from "@/lib/meteora/meteoraPositionService";
import { parseDlmmCommand, CommandType } from '@/lib/meteora/meteoraChatCommands';
import { useWallet } from '@solana/wallet-adapter-react';

// Type definitions
type MessageRole = 'user' | 'assistant';

interface Message {
  role: MessageRole;
  content: string;
  timestamp: Date;
}

interface Pool {
  name: string;
  address: string;
  liquidity: string;
  currentPrice: string;
  apy: string;
  fees24h: string;
  volume24h: string;
}

// Component implementation
const ChatBox: React.FC = () => {
  // State management
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Welcome to Hypebiscus',
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [currentPools, setCurrentPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [isAddLiquidityModalOpen, setIsAddLiquidityModalOpen] = useState(false);
  const [isPortfolioStyleModalOpen, setIsPortfolioStyleModalOpen] = useState(false);
  const [selectedPortfolioStyle, setSelectedPortfolioStyle] = useState<string | null>(null);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // DLMM Service
  const { service: dlmmService, publicKey } = useMeteoraDlmmService();
  const { service: positionService } = useMeteoraPositionService();
  const { connected } = useWallet();

  // Methods
  const addMessage = (role: MessageRole, content: string) => {
    setMessages(prev => [
      ...prev,
      { role, content, timestamp: new Date() }
    ]);
    // Hide welcome screen when conversation starts
    if (showWelcomeScreen) {
      setShowWelcomeScreen(false);
    }
  };

  const addErrorMessage = (error: unknown) => {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown error';
    
    addMessage('assistant', `Sorry, there was an error: ${errorMessage}`);
  };

  const handleSendMessage = async (message?: string) => {
    const messageToSend = message || inputMessage;
    if (!messageToSend.trim()) return;

    // Add user message
    addMessage('user', messageToSend);
    const userMessage = messageToSend;
    setInputMessage('');
    setIsLoading(true);

    try {
      // If this is a quick action or regular chat message - skip DLMM parsing
      // Only parse as DLMM command if it's from the text input (not from quick actions)
      let isDlmmCommand = false;
      let commandResult;

      if (!message) { // Only check for DLMM command if not a quick action
        commandResult = await parseDlmmCommand({
          command: userMessage,
          userPublicKey: publicKey || undefined,
          service: {
            dlmm: dlmmService,
            position: positionService
          }
        });

        // If the command was processed successfully
        if (commandResult.type !== CommandType.UNKNOWN || commandResult.message) {
          isDlmmCommand = true;
          addMessage('assistant', commandResult.message || "I'm not sure how to process that DLMM command.");
        }
      }

      // If not a DLMM command or it's a quick action, process as a regular message
      if (!isDlmmCommand || message) {
        const messageHistory = [...messages, {
          role: 'user',
          content: userMessage,
          timestamp: new Date()
        }];
        
        // Send to API
        const response = await fetchMessage(messageHistory);
        addMessage('assistant', response);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      addErrorMessage(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddLiquidity = (pool: Pool) => {
    setSelectedPool(pool);
    setIsAddLiquidityModalOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
    // Add a message to the chat about the selected style
    addMessage('assistant', `You've selected the ${style.charAt(0).toUpperCase() + style.slice(1)} portfolio style. I'll recommend pools that match your risk preference.`);
  };

  // Format time for display
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper function to safely format currency values
  const formatCurrencyValue = (value: any, decimals: number = 0): string => {
    if (typeof value === 'string') {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return num.toLocaleString(undefined, { 
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        });
      }
      return value;
    } else if (typeof value === 'number') {
      return value.toLocaleString(undefined, { 
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    }
    return '0';
  };

  // Helper function to safely format percentage values
  const formatPercentValue = (value: any): string => {
    if (typeof value === 'string') {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return num.toFixed(2);
      }
      return value;
    } else if (typeof value === 'number') {
      return value.toFixed(2);
    }
    return '0';
  };

  // Effects
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Render component
  return (
    <Card className="relative overflow-hidden h-[calc(100vh-200px)] flex flex-col">
      {/* Radial blur effect */}
      <div className="absolute -top-4 -left-4 w-[300px] h-[200px] opacity-30 pointer-events-none">
        <div className="absolute -top-4 -left-4 w-[200px] h-[200px] rounded-full bg-primary blur-[60px]"></div>
      </div>

      {showWelcomeScreen ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Welcome to Hypebiscus</h1>
          <p className="text-white/70 mb-10">
            Your smart assistant for exploring BTC liquidity in the Solana DeFi ecosystem.
          </p>
          
          <div className="grid grid-cols-1 gap-4 max-w-md w-full mb-8">
            <div className="flex items-start gap-3">
              <Search className="w-5 h-5 text-primary mt-1" />
              <span className="text-white text-left">Real-time discovery of BTC and zBTC liquidity pools on Solana.</span>
            </div>
            <div className="flex items-start gap-3">
              <PlusCircle className="w-5 h-5 text-primary mt-1" />
              <span className="text-white text-left">Instant 'Add Position' capability.</span>
            </div>
            <div className="flex items-start gap-3">
              <BarChart className="w-5 h-5 text-primary mt-1" />
              <span className="text-white text-left">Live pool analytics, including TVL, APR, and recent liquidity changes.</span>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary mt-1" />
              <span className="text-white text-left">Secure, non-custodial wallet integration for direct on-chain transactions.</span>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            className="bg-secondary/30 border-primary text-white mb-16"
            onClick={() => setIsPortfolioStyleModalOpen(true)}
          >
            Select Portfolio Style
          </Button>
          
          <div className="w-full">
            <QuickActionButtons onQuickAction={handleQuickAction} disabled={isLoading} />
          </div>
        </div>
      ) : (
        <>
          <CardHeader className="pb-2">
            <CardTitle>Agent</CardTitle>
          </CardHeader>

          {/* Messages area */}
          <CardContent className="flex-1 overflow-y-auto px-4 pt-0 pb-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {messages.map((message, index) => (
              <MessageBubble
                key={index}
                message={message}
                formatTime={formatTime}
              />
            ))}
            
            {/* Display the pools list if there are pools */}
            {currentPools.length > 0 && (
              <div className="w-full">
                <BtcPoolsList 
                  pools={currentPools}
                  onAddLiquidity={handleAddLiquidity}
                  isLoading={isPoolLoading}
                />
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </CardContent>
        </>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-border bg-[#161616]">
        {/* Quick action buttons that appear under input */}
        {!showWelcomeScreen && (
          <div className="mb-3">
            <QuickActionButtons onQuickAction={handleQuickAction} disabled={isLoading} />
          </div>
        )}
        
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
    </Card>
  );
};

// Sub-components
interface MessageBubbleProps {
  message: Message;
  formatTime: (date: Date) => string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, formatTime }) => {
  const isUser = message.role === 'user';
  
  // Format message content with line breaks
  const formattedContent = message.content.split('\n').map((line, i) => (
    <React.Fragment key={i}>
      {line}
      {i < message.content.split('\n').length - 1 && <br />}
    </React.Fragment>
  ));
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2 ${
          isUser
            ? 'bg-primary text-white ml-auto'
            : 'bg-[#161616] text-white border border-border'
        }`}
      >
        <div className="mb-1 text-sm">
          {formattedContent}
        </div>
        <div className="text-xs text-gray-400 text-right">
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
};

interface ChatInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  disabled: boolean;
  onSend: () => void;
  isLoading: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onKeyDown,
  disabled,
  onSend,
  isLoading
}) => {
  return (
    <div className="flex space-x-2">
      <Textarea
        placeholder="Type your message here..."
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        className="resize-none bg-[#0f0f0f] border-border text-white"
        disabled={disabled}
      />
      <Button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="bg-primary text-white hover:bg-primary/80 self-end"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <SendHorizontal className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
};

export default ChatBox;