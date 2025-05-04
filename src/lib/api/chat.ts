// src/lib/api/chat.ts

interface MessageForAPI {
    role: string;
    content: string;
    timestamp?: Date;
  }
  
  /**
   * Send message to chat API
   * @param messages Array of message objects
   * @returns Promise with the assistant's response
   */
  export const fetchMessage = async (messages: MessageForAPI[]): Promise<string> => {
    // Format messages for API
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  
    console.log('Sending message to API');
    
    // Call our backend API that interfaces with Anthropic
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: formattedMessages }),
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
    
    return data.message;
  }