// src/components/dashboard-components/ChatBox.tsx
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal, Loader2 } from "lucide-react";
import BtcPoolButtons from './BtcPoolButtons';
import { fetchMessage } from '@/lib/api/chat';
import { fetchPools } from '@/lib/api/pools';
import { formatPoolData } from '@/lib/api/formatters';

// Type definitions
type MessageRole = 'user' | 'assistant';

interface Message {
  role: MessageRole;
  content: string;
  timestamp: Date;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    setInputMessage('');
    setIsLoading(true);

    try {
      // Get all messages for context
      const messageHistory = [...messages, {
        role: 'user',
        content: inputMessage,
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
    
    try {
      // Fetch pools data
      const poolsData = await fetchPools(searchTerm);
      
      // Format the data
      const formattedMessage = formatPoolData(searchTerm, poolsData);
      
      // Add to chat
      addMessage('assistant', formattedMessage);
    } catch (error) {
      console.error(`Error fetching ${searchTerm} pools:`, error);
      addMessage('assistant', `Sorry, there was an error fetching ${searchTerm.toUpperCase()} pools: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsPoolLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2 ${
          isUser
            ? 'bg-primary text-white ml-auto'
            : 'bg-[#161616] text-white border border-border'
        }`}
      >
        <div className="mb-1 text-sm whitespace-pre-line">
          {message.content}
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