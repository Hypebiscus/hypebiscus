"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal, Loader2 } from "lucide-react";

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

const ChatBox: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi there! I\'m your agent. How can I help you today?',
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    // Add user message to state
    const userMessage: Message = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      console.log('Sending message to API');
      
      // Call our backend API that interfaces with Anthropic
      // Using the path that matches your project structure: /api/chat
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        }),
      });

      console.log('API response status:', response.status);

      if (!response.ok) {
        // Try to get more detailed error information
        let errorMessage = 'Failed to get response from API';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          console.error('API error details:', errorData);
        } catch (e) {
          // If we can't parse JSON, try getting text
          try {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
          } catch (textError) {
            // Ignore text parsing errors
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Received data from API:', data);
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      // Add error message
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, there was an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
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

  return (
    <Card className="relative overflow-hidden h-[calc(100vh-200px)] flex flex-col">
      {/* Radial blur effect in top left corner */}
      <div className="absolute -top-4 -left-4 w-[300px] h-[200px] opacity-30 pointer-events-none">
        <div className="absolute -top-4 -left-4 w-[200px] h-[200px] rounded-full bg-primary blur-[60px]"></div>
      </div>

      <CardHeader className="pb-2">
        <CardTitle>Agent</CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 pt-0 pb-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-primary text-white ml-auto'
                  : 'bg-[#161616] text-white border border-border'
              }`}
            >
              <div className="mb-1 text-sm">
                {message.content}
              </div>
              <div className="text-xs text-gray-400 text-right">
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </CardContent>

      <div className="p-4 border-t border-border bg-[#161616]">
        <div className="flex space-x-2">
          <Textarea
            placeholder="Type your message..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="resize-none bg-[#0f0f0f] border-border text-white"
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || !inputMessage.trim()}
            className="bg-primary text-white hover:bg-primary/80 self-end"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <SendHorizontal className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ChatBox;