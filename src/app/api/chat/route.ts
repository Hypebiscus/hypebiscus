import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// This handles POST requests to /api/chat
export async function POST(request: Request) {
  try {
    // Log that we received a request
    console.log('API route: Received request');
    
    // Check if API key is configured
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('API route: ANTHROPIC_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    // Parse request body
    const body = await request.json();
    const { messages } = body;

    console.log('API route: Request body', { messagesCount: messages?.length || 0 });

    if (!messages || !Array.isArray(messages)) {
      console.error('API route: Invalid request format');
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      );
    }

    // Format messages for Anthropic API
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    console.log('API route: Calling Anthropic API');
    
    // Call Anthropic API
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // You can change the model as needed
      max_tokens: 1024,
      messages: formattedMessages,
    });

    console.log('API route: Received response from Anthropic API');

    // Extract the content from the response
    // Check the type of content block to safely access its properties
    let assistantMessage = '';
    
    if (response.content && response.content.length > 0) {
      const contentBlock = response.content[0];
      
      // Check if it's a text block (has type property equal to 'text')
      if (contentBlock.type === 'text') {
        assistantMessage = contentBlock.text;
      } else {
        // Handle other content types if needed
        assistantMessage = 'Response received, but it was not in text format.';
      }
    }

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error('API route: Error calling Anthropic API:', error);
    return NextResponse.json({ 
      error: 'Failed to get response from Claude API', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Add a simple GET handler for testing the route
export async function GET() {
  return NextResponse.json({ status: "API route is working" });
}