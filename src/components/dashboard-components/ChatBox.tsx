// src/components/dashboard-components/ChatBox.tsx
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal, Loader2 } from "lucide-react";
import BtcPoolButtons from './BtcPoolButtons';
import BtcPoolsList from './BtcPoolsList';
import AddLiquidityModal from './AddLiquidityModal';
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
      content: 'Hi there! I\'m your agent. How can I help you today? You can search for BTC liquidity pools using the buttons below.',
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [currentPools, setCurrentPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [isAddLiquidityModalOpen, setIsAddLiquidityModalOpen] = useState(false);
  
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
  };

  const addErrorMessage = (error: unknown) => {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown error';
    
    addMessage('assistant', `Sorry, there was an error: ${errorMessage}`);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    // Add user message
    addMessage('user', inputMessage);
    const userMessage = inputMessage;
    setInputMessage('');
    setIsLoading(true);

    try {
      // Check if this is a DLMM command
      const commandResult = await parseDlmmCommand({
        command: userMessage,
        userPublicKey: publicKey || undefined,
        service: {
          dlmm: dlmmService,
          position: positionService
        }
      });

      // If the command was processed successfully
      if (commandResult.type !== CommandType.UNKNOWN || commandResult.message) {
        // Format message based on command type
        let responseMessage = commandResult.message;
        
        // If it's a GET_POOLS command, format the pool information nicely
        if (commandResult.type === CommandType.GET_POOLS && commandResult.success && commandResult.data?.pools) {
          const pools = commandResult.data.pools;
          if (pools.length > 0) {
            responseMessage = `Here are the available DLMM pools:\n\n`;
            pools.slice(0, 5).forEach((pool: any, index: number) => {
              responseMessage += `${index + 1}. ${pool.name}\n`;
              responseMessage += `   Pair: ${pool.tokenX}/${pool.tokenY}\n`;
              responseMessage += `   Price: ${pool.price}\n`;
              responseMessage += `   Bin Step: ${pool.binStep}\n\n`;
            });
            if (pools.length > 5) {
              responseMessage += `... and ${pools.length - 5} more pools.\n\nTo interact with a specific pool, you can use commands like "add 10 SOL to pool [address]" or "show positions in pool [address]".`;
            }
          }
        }
        
        // Add the assistant's response
        addMessage('assistant', responseMessage || "I'm not sure how to process that DLMM command. Try using commands like 'list pools', 'show my positions', or 'swap 1 SOL for USDC'.");
        setIsLoading(false);
        return;
      }

      // If not a DLMM command, process normally
      // Get all messages for context
      const messageHistory = [...messages, {
        role: 'user',
        content: userMessage,
        timestamp: new Date()
      }];
      
      // Send to API
      const response = await fetchMessage(messageHistory);
      addMessage('assistant', response);
    } catch (error) {
      console.error('Error sending message:', error);
      addErrorMessage(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchBtcPools = async (searchTerm: string) => {
    setIsPoolLoading(true);
    setCurrentPools([]);
    
    try {
      // Fetch pools data
      const poolsData = await fetchPools(searchTerm);
      
      // Format the data
      const formattedMessage = formatPoolData(searchTerm, poolsData);
      
      // Add to chat
      addMessage('assistant', formattedMessage);
      
      // Convert the API response to our Pool format
      if (poolsData.groups && poolsData.groups.length > 0) {
        const groups = poolsData.groups;
        const convertedPools: Pool[] = [];
        
        for (const group of groups) {
          if (group.pairs && group.pairs.length > 0) {
            for (const pair of group.pairs) {
              convertedPools.push({
                name: pair.name,
                address: pair.address || `pool-${convertedPools.length + 1}`, // Use a placeholder if no address
                liquidity: formatCurrencyValue(pair.liquidity),
                currentPrice: formatCurrencyValue(pair.current_price, 2),
                apy: formatPercentValue(pair.apy),
                fees24h: formatCurrencyValue(pair.fees_24h, 2),
                volume24h: formatCurrencyValue(pair.trade_volume_24h, 2)
              });
            }
          }
        }
        
        setCurrentPools(convertedPools);
      }
    } catch (error) {
      console.error(`Error fetching ${searchTerm} pools:`, error);
      addMessage('assistant', `Sorry, there was an error fetching ${searchTerm.toUpperCase()} pools: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsPoolLoading(false);
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

  // Format time for display
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper function to safely format currency values
  const formatCurrencyValue = (value: any, decimals: number = 0): string => {
    if (typeof value === 'string') {
      // Try to parse the string as a number
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return num.toLocaleString(undefined, { 
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        });
      }
      return value; // Return the original string if it can't be parsed
    } else if (typeof value === 'number') {
      return value.toLocaleString(undefined, { 
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    }
    return '0'; // Default value for undefined, null, or other types
  };

  // Helper function to safely format percentage values
  const formatPercentValue = (value: any): string => {
    if (typeof value === 'string') {
      // Try to parse the string as a number
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return num.toFixed(2);
      }
      return value; // Return the original string if it can't be parsed
    } else if (typeof value === 'number') {
      return value.toFixed(2);
    }
    return '0'; // Default value for undefined, null, or other types
  };

  // Effects
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Render component
  return (
    <Card className="relative overflow-hidden h-[calc(100vh-200px)] flex flex-col lg:max-w-5xl max-w-full mx-auto">
      {/* Radial blur effect */}
      <div className="absolute -top-4 -left-4 w-[300px] h-[200px] opacity-30 pointer-events-none">
        <div className="absolute -top-4 -left-4 w-[200px] h-[200px] rounded-full bg-primary blur-[60px]"></div>
      </div>

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

      {/* Input area */}
      <div className="p-4 border-t border-border bg-[#161616]">
        <BtcPoolButtons 
          onFetchPools={handleFetchBtcPools} 
          isLoading={isPoolLoading} 
        />
        
        <ChatInput
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading || isPoolLoading}
          onSend={handleSendMessage}
          isLoading={isLoading}
        />
      </div>
      
      {/* Add Liquidity Modal */}
      <AddLiquidityModal 
        isOpen={isAddLiquidityModalOpen}
        onClose={() => setIsAddLiquidityModalOpen(false)}
        pool={selectedPool}
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
        placeholder="Type your message..."
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