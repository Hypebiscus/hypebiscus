// Input validation utilities for API endpoints

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequestBody {
  messages: ChatMessage[]
  poolData?: any
  portfolioStyle?: string
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function validateChatRequest(body: any): ChatRequestBody {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Invalid request body')
  }

  const { messages, poolData, portfolioStyle } = body

  // Validate messages array
  if (!messages || !Array.isArray(messages)) {
    throw new ValidationError('Messages must be an array', 'messages')
  }

  // Allow empty messages array if poolData is provided (for initial pool analysis)
  if (messages.length === 0 && !poolData) {
    throw new ValidationError('Messages array cannot be empty when no pool data provided', 'messages')
  }

  if (messages.length > 50) {
    throw new ValidationError('Too many messages. Maximum 50 messages allowed', 'messages')
  }

  // Validate each message (skip if empty array)
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    
    if (!message || typeof message !== 'object') {
      throw new ValidationError(`Message at index ${i} is invalid`, 'messages')
    }

    if (!message.role || !['user', 'assistant'].includes(message.role)) {
      throw new ValidationError(`Message at index ${i} has invalid role`, 'messages')
    }

    if (typeof message.content !== 'string') {
      throw new ValidationError(`Message at index ${i} content must be a string`, 'messages')
    }

    if (message.content.length === 0) {
      throw new ValidationError(`Message at index ${i} content cannot be empty`, 'messages')
    }

    if (message.content.length > 10000) {
      throw new ValidationError(`Message at index ${i} content too long. Maximum 10,000 characters allowed`, 'messages')
    }

    // Basic XSS prevention - reject obvious script tags
    if (/<script|javascript:|on\w+\s*=/i.test(message.content)) {
      throw new ValidationError(`Message at index ${i} contains potentially malicious content`, 'messages')
    }
  }

  // Validate portfolioStyle if provided
  if (portfolioStyle !== undefined) {
    if (typeof portfolioStyle !== 'string') {
      throw new ValidationError('Portfolio style must be a string', 'portfolioStyle')
    }
    
    if (portfolioStyle.length > 100) {
      throw new ValidationError('Portfolio style too long. Maximum 100 characters allowed', 'portfolioStyle')
    }
  }

  // Validate poolData if provided (basic validation)
  if (poolData !== undefined) {
    if (typeof poolData !== 'object' || poolData === null) {
      throw new ValidationError('Pool data must be an object', 'poolData')
    }

    // Convert to string to check serialized size
    const poolDataString = JSON.stringify(poolData)
    if (poolDataString.length > 50000) {
      throw new ValidationError('Pool data too large. Maximum 50KB allowed', 'poolData')
    }
  }

  return { messages, poolData, portfolioStyle }
}

export function sanitizeString(input: string): string {
  // Since React already provides XSS protection for text content,
  // we only need to sanitize actual HTML tags that could be dangerous
  // Don't encode normal characters like apostrophes and quotes
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function validateRequestSize(request: Request): void {
  const contentLength = request.headers.get('content-length')
  
  if (contentLength) {
    const size = parseInt(contentLength, 10)
    
    // Maximum 1MB request size
    if (size > 1024 * 1024) {
      throw new ValidationError('Request body too large. Maximum 1MB allowed')
    }
  }
}