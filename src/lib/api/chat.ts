// src/lib/api/chat.ts

interface MessageForAPI {
    role: string;
    content: string;
    timestamp?: Date;
  }

// Import the Pool interface type
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
  
  /**
   * Send message to chat API
   * @param messages Array of message objects
   * @param poolData Optional pool data for analysis
   * @param portfolioStyle Optional portfolio style for contextual analysis
   * @param onStreamUpdate Optional callback function that receives text chunks as they arrive
   * @returns Promise with the assistant's response
   */
  export const fetchMessage = async (
    messages: MessageForAPI[],
    poolData?: Pool,
    portfolioStyle?: string,
    onStreamUpdate?: (chunk: string) => void
  ): Promise<string> => {
    // Format messages for API
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  
    console.log('Sending message to API', {
      messageCount: formattedMessages.length,
      hasPoolData: !!poolData,
      portfolioStyle: portfolioStyle || 'none'
    });
    
    // Call our backend API that interfaces with Anthropic
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        messages: formattedMessages,
        poolData,
        portfolioStyle
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
      } catch {
        // If we can't parse JSON, try getting text
        try {
          const errorText = await response.text();
          if (errorText) errorMessage = errorText;
        } catch {
          // Ignore text parsing errors
        }
      }
      throw new Error(errorMessage);
    }
  
    // Handle streaming response
    if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let result = '';
  
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Decode and append the chunk
        const chunk = decoder.decode(value);
        result += chunk;
        
        // Call the onStreamUpdate callback if provided
        if (onStreamUpdate) {
          onStreamUpdate(chunk);
        }
      }
  
      return result;
    }
  
    // Handle traditional JSON response (fallback)
    const data = await response.json();
    console.log('Received data from API:', data);
    
    return data.message;
  }