// src/lib/meteora/meteoraChatCommands.ts
import { MeteoraDlmmService, DlmmPoolInfo } from './meteoraDlmmService';
import { MeteoraPositionService } from './meteoraPositionService';
import { PublicKey, Connection } from '@solana/web3.js';
import { BN } from 'bn.js';
import { StrategyType } from '@meteora-ag/dlmm';

// Command types
export enum CommandType {
  GET_POOLS,
  GET_POSITION,
  ADD_LIQUIDITY,
  REMOVE_LIQUIDITY,
  CLAIM_FEES,
  CLOSE_POSITION,
  SWAP,
  UNKNOWN
}

// Command result interface
export interface CommandResult {
  type: CommandType;
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

// Parse command interface
export interface CommandParams {
  command: string;
  userPublicKey?: PublicKey;
  service: {
    dlmm: MeteoraDlmmService;
    position: MeteoraPositionService;
  };
}

/**
 * Parse a chat message to identify and execute DLMM commands
 */
export async function parseDlmmCommand(params: CommandParams): Promise<CommandResult> {
  const { command, userPublicKey, service } = params;
  const lowerCommand = command.toLowerCase().trim();

  // Check if user is connected
  if (!userPublicKey && !isQueryCommand(lowerCommand)) {
    return {
      type: CommandType.UNKNOWN,
      success: false,
      message: "Please connect your wallet to perform DLMM operations.",
      error: "No wallet connected"
    };
  }

  try {
    // Handle get pools command
    if (lowerCommand.includes('list pools') || lowerCommand.includes('show pools') || lowerCommand.includes('get pools')) {
      return await handleGetPoolsCommand(service.dlmm);
    }
    
    // Handle get position command
    else if (lowerCommand.includes('my position') || lowerCommand.includes('show position') || lowerCommand.includes('list position')) {
      if (!userPublicKey) {
        return {
          type: CommandType.GET_POSITION,
          success: false,
          message: "Please connect your wallet to view your positions.",
          error: "No wallet connected"
        };
      }
      
      // Extract pool address if provided
      const poolAddress = extractPoolAddress(lowerCommand);
      return await handleGetPositionCommand(service.dlmm, userPublicKey, poolAddress);
    }
    
    // Handle add liquidity command
    else if (lowerCommand.includes('add liquidity') || lowerCommand.match(/add\s+\d+(\.\d+)?\s+to\s+pool/i)) {
      if (!userPublicKey) {
        return {
          type: CommandType.ADD_LIQUIDITY,
          success: false,
          message: "Please connect your wallet to add liquidity.",
          error: "No wallet connected"
        };
      }
      
      // Parse the command to extract amount, token, and pool
      const { amount, token, poolAddress } = extractLiquidityParams(lowerCommand);
      
      if (!amount || !poolAddress) {
        return {
          type: CommandType.ADD_LIQUIDITY,
          success: false,
          message: "Please specify the amount and pool for adding liquidity. Example: 'Add 10 SOL to pool [address]'",
          error: "Invalid parameters"
        };
      }
      
      // Note: This is just a command parser - the actual execution would be handled elsewhere
      return {
        type: CommandType.ADD_LIQUIDITY,
        success: true,
        message: `Preparing to add ${amount} ${token || ''} to pool ${poolAddress.substring(0, 8)}...`,
        data: { amount, token, poolAddress }
      };
    }
    
    // Handle remove liquidity command
    else if (lowerCommand.includes('remove liquidity') || lowerCommand.match(/remove\s+\d+(\.\d+)?%?\s+from\s+position/i)) {
      if (!userPublicKey) {
        return {
          type: CommandType.REMOVE_LIQUIDITY,
          success: false,
          message: "Please connect your wallet to remove liquidity.",
          error: "No wallet connected"
        };
      }
      
      // Parse the command to extract percentage and position
      const { percentage, positionId } = extractRemoveLiquidityParams(lowerCommand);
      
      if (!percentage || !positionId) {
        return {
          type: CommandType.REMOVE_LIQUIDITY,
          success: false,
          message: "Please specify the percentage and position for removing liquidity. Example: 'Remove 50% from position [address]'",
          error: "Invalid parameters"
        };
      }
      
      return {
        type: CommandType.REMOVE_LIQUIDITY,
        success: true,
        message: `Preparing to remove ${percentage}% from position ${positionId.substring(0, 8)}...`,
        data: { percentage, positionId }
      };
    }
    
    // Handle claim fees command
    else if (lowerCommand.includes('claim fee') || lowerCommand.includes('collect fee')) {
      if (!userPublicKey) {
        return {
          type: CommandType.CLAIM_FEES,
          success: false,
          message: "Please connect your wallet to claim fees.",
          error: "No wallet connected"
        };
      }
      
      // Extract position ID if provided
      const positionId = extractPositionId(lowerCommand);
      
      if (!positionId) {
        return {
          type: CommandType.CLAIM_FEES,
          success: false,
          message: "Please specify the position to claim fees from. Example: 'Claim fees from position [address]'",
          error: "Invalid parameters"
        };
      }
      
      return {
        type: CommandType.CLAIM_FEES,
        success: true,
        message: `Preparing to claim fees from position ${positionId.substring(0, 8)}...`,
        data: { positionId }
      };
    }
    
    // Handle close position command
    else if (lowerCommand.includes('close position')) {
      if (!userPublicKey) {
        return {
          type: CommandType.CLOSE_POSITION,
          success: false,
          message: "Please connect your wallet to close a position.",
          error: "No wallet connected"
        };
      }
      
      // Extract position ID
      const positionId = extractPositionId(lowerCommand);
      
      if (!positionId) {
        return {
          type: CommandType.CLOSE_POSITION,
          success: false,
          message: "Please specify the position to close. Example: 'Close position [address]'",
          error: "Invalid parameters"
        };
      }
      
      return {
        type: CommandType.CLOSE_POSITION,
        success: true,
        message: `Preparing to close position ${positionId.substring(0, 8)}...`,
        data: { positionId }
      };
    }
    
    // Handle swap command
    else if (lowerCommand.includes('swap') || lowerCommand.match(/swap\s+\d+(\.\d+)?\s+[a-z]+\s+for\s+[a-z]+/i)) {
      if (!userPublicKey) {
        return {
          type: CommandType.SWAP,
          success: false,
          message: "Please connect your wallet to perform a swap.",
          error: "No wallet connected"
        };
      }
      
      // Parse the command to extract amount, from token, to token, and pool
      const { amount, fromToken, toToken, poolAddress } = extractSwapParams(lowerCommand);
      
      if (!amount || !fromToken || !toToken) {
        return {
          type: CommandType.SWAP,
          success: false,
          message: "Please specify the amount, tokens, and pool for swapping. Example: 'Swap 10 SOL for USDC in pool [address]'",
          error: "Invalid parameters"
        };
      }
      
      return {
        type: CommandType.SWAP,
        success: true,
        message: `Preparing to swap ${amount} ${fromToken} for ${toToken}${poolAddress ? ` in pool ${poolAddress.substring(0, 8)}` : ''}...`,
        data: { amount, fromToken, toToken, poolAddress }
      };
    }
    
    // Unknown command
    else {
      return {
        type: CommandType.UNKNOWN,
        success: false,
        message: "I didn't recognize that as a DLMM command. Try commands like 'list pools', 'show my positions', 'add liquidity', 'remove liquidity', 'claim fees', 'close position', or 'swap'.",
        error: "Unknown command"
      };
    }
  } catch (error) {
    return {
      type: CommandType.UNKNOWN,
      success: false,
      message: "An error occurred while processing your command.",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check if command is just a query (no wallet needed)
 */
function isQueryCommand(command: string): boolean {
  return command.includes('list pools') || 
         command.includes('show pools') || 
         command.includes('get pools');
}

/**
 * Handle get pools command
 */
async function handleGetPoolsCommand(service: MeteoraDlmmService): Promise<CommandResult> {
  try {
    const pools = await service.getAllPools();
    
    if (pools.length === 0) {
      return {
        type: CommandType.GET_POOLS,
        success: true,
        message: "No DLMM pools found.",
        data: { pools: [] }
      };
    }
    
    // Format pool information
    const poolsInfo = pools.map(pool => ({
      name: pool.name,
      address: pool.address,
      price: pool.activeBinPrice.toFixed(6),
      binStep: pool.binStep.toString(),
      tokenX: pool.tokenX,
      tokenY: pool.tokenY
    }));
    
    return {
      type: CommandType.GET_POOLS,
      success: true,
      message: `Found ${pools.length} DLMM pools.`,
      data: { pools: poolsInfo }
    };
  } catch (error) {
    return {
      type: CommandType.GET_POOLS,
      success: false,
      message: "Failed to retrieve pools information.",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Handle get position command
 */
async function handleGetPositionCommand(
  service: MeteoraDlmmService,
  userPublicKey: PublicKey,
  poolAddress?: string
): Promise<CommandResult> {
  try {
    // If no pool address was provided, we'd need to search across all pools
    // This is a simplified version - in a real implementation, you'd query multiple pools
    if (!poolAddress) {
      // Default to a known pool (this is just for example)
      // In reality, you'd want to fetch positions across multiple pools
      const defaultPool = "ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq"; // Example USDC-USDT pool
      poolAddress = defaultPool;
    }
    
    const positions = await service.getUserPositions(poolAddress, userPublicKey);
    
    if (positions.length === 0) {
      return {
        type: CommandType.GET_POSITION,
        success: true,
        message: "You don't have any positions in this pool.",
        data: { positions: [] }
      };
    }
    
    // Format position information
    const positionsInfo = positions.map(position => ({
      id: position.pubkey,
      bins: position.liquidityPerBin.length,
      totalValue: position.totalValue
    }));
    
    return {
      type: CommandType.GET_POSITION,
      success: true,
      message: `Found ${positions.length} position(s).`,
      data: { positions: positionsInfo }
    };
  } catch (error) {
    return {
      type: CommandType.GET_POSITION,
      success: false,
      message: "Failed to retrieve position information.",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Extract pool address from command
 */
function extractPoolAddress(command: string): string | undefined {
  // Look for patterns like "pool XYZ123..." or "in XYZ123..."
  const poolMatch = command.match(/(?:pool|in)\s+([a-zA-Z0-9]{32,})/i);
  return poolMatch ? poolMatch[1] : undefined;
}

/**
 * Extract position ID from command
 */
function extractPositionId(command: string): string | undefined {
  // Look for patterns like "position XYZ123..." or "from XYZ123..."
  const positionMatch = command.match(/(?:position|from)\s+([a-zA-Z0-9]{32,})/i);
  return positionMatch ? positionMatch[1] : undefined;
}

/**
 * Extract liquidity parameters from command
 */
function extractLiquidityParams(command: string): { amount?: number; token?: string; poolAddress?: string } {
  // Extract amount
  const amountMatch = command.match(/(?:add|deposit)\s+(\d+(?:\.\d+)?)\s+([a-zA-Z]+)?/i);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : undefined;
  const token = amountMatch && amountMatch[2] ? amountMatch[2].toUpperCase() : undefined;
  
  // Extract pool address
  const poolAddress = extractPoolAddress(command);
  
  return { amount, token, poolAddress };
}

/**
 * Extract remove liquidity parameters from command
 */
function extractRemoveLiquidityParams(command: string): { percentage?: number; positionId?: string } {
  // Extract percentage
  const percentageMatch = command.match(/(?:remove|withdraw)\s+(\d+(?:\.\d+)?)\s*(%)?/i);
  let percentage = percentageMatch ? parseFloat(percentageMatch[1]) : undefined;
  
  // If percentage doesn't have % symbol and is greater than 1, assume it's meant to be a percentage (e.g., 50 -> 50%)
  if (percentage && percentage > 1 && !percentageMatch?.[2]) {
    percentage = Math.min(percentage, 100); // Cap at 100%
  }
  
  // Extract position ID
  const positionId = extractPositionId(command);
  
  return { percentage, positionId };
}

/**
 * Extract swap parameters from command
 */
function extractSwapParams(command: string): { 
  amount?: number; fromToken?: string; toToken?: string; poolAddress?: string 
} {
  // Extract amount and tokens
  const swapMatch = command.match(/swap\s+(\d+(?:\.\d+)?)\s+([a-zA-Z]+)\s+(?:for|to)\s+([a-zA-Z]+)/i);
  const amount = swapMatch ? parseFloat(swapMatch[1]) : undefined;
  const fromToken = swapMatch ? swapMatch[2].toUpperCase() : undefined;
  const toToken = swapMatch ? swapMatch[3].toUpperCase() : undefined;
  
  // Extract pool address
  const poolAddress = extractPoolAddress(command);
  
  return { amount, fromToken, toToken, poolAddress };
}