// Enhanced meteoraDlmmService.ts with better error handling and balance validation

import DLMM, { StrategyType, autoFillYByStrategy } from '@meteora-ag/dlmm';
import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';

// Enhanced error types for better error handling
export enum DLMMErrorType {
  INSUFFICIENT_SOL = 'INSUFFICIENT_SOL',
  INSUFFICIENT_TOKEN = 'INSUFFICIENT_TOKEN',
  INVALID_POOL = 'INVALID_POOL',
  TRANSACTION_SIMULATION_FAILED = 'TRANSACTION_SIMULATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class DLMMError extends Error {
  constructor(
    public type: DLMMErrorType,
    message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'DLMMError';
  }

  get userFriendlyMessage(): string {
    switch (this.type) {
      case DLMMErrorType.INSUFFICIENT_SOL:
        return 'Insufficient SOL balance. Please add more SOL to your wallet or reduce the amount.';
      case DLMMErrorType.INSUFFICIENT_TOKEN:
        return 'Insufficient token balance. Please ensure you have enough tokens for this transaction.';
      case DLMMErrorType.INVALID_POOL:
        return 'Invalid pool configuration. Please try a different pool.';
      case DLMMErrorType.TRANSACTION_SIMULATION_FAILED:
        return 'Transaction simulation failed. This usually indicates insufficient funds or invalid parameters.';
      case DLMMErrorType.NETWORK_ERROR:
        return 'Network error. Please check your connection and try again.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }
}

// Enhanced balance validation interface
export interface BalanceValidation {
  isValid: boolean;
  solBalance: number;
  requiredSol: number;
  tokenBalance?: number;
  requiredToken?: number;
  error?: DLMMError;
}

// Rest of your existing interfaces...
export type DlmmType = DLMM;

export interface BinArrayType {
  publicKey: PublicKey;
  [key: string]: unknown;
}

export interface PositionType {
  publicKey: PublicKey;
  positionData: {
    positionBinData: BinDataType[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BinDataType {
  binId: number;
  xAmount: { toString(): string };
  yAmount: { toString(): string };
  liquidityAmount: { toString(): string };
  [key: string]: unknown;
}

export interface BinLiquidity {
  binId: number;
  xAmount: string;
  yAmount: string;
  liquidityAmount: string;
  price: string;
}

export interface DlmmPoolInfo {
  address: string;
  name: string;
  tokenX: string;
  tokenY: string;
  activeBinPrice: number;
  binStep: number;
  totalXAmount: string;
  totalYAmount: string;
}

export interface DlmmPositionInfo {
  pubkey: string;
  liquidityPerBin: {
    binId: number;
    xAmount: string;
    yAmount: string;
    liquidityAmount: string;
  }[];
  totalValue: number;
}

export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  minOutAmount: string;
  fee: string;
  priceImpact: string;
  binArraysPubkey: PublicKey[];
}

export interface ActiveBin {
  binId: number;
  price: string;
  xAmount: string;
  yAmount: string;
}

/**
 * Enhanced Service to interact with Meteora DLMM with better error handling
 */
export class MeteoraDlmmService {
  private _connection: Connection;
  private poolInstances: Map<string, DlmmType> = new Map();

  constructor(connection: Connection) {
    this._connection = connection;
  }

  get connection(): Connection {
    return this._connection;
  }

  /**
   * Validate user balances before attempting transactions
   */
  async validateUserBalance(
    userPublicKey: PublicKey,
    requiredSolAmount: number,
    tokenMint?: PublicKey,
    requiredTokenAmount?: number
  ): Promise<BalanceValidation> {
    try {
      // Check SOL balance
      const solBalanceLamports = await this._connection.getBalance(userPublicKey);
      const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
      
      // Add buffer for transaction fees (0.01 SOL)
      const requiredSolWithBuffer = requiredSolAmount + 0.01;
      
      if (solBalance < requiredSolWithBuffer) {
        return {
          isValid: false,
          solBalance,
          requiredSol: requiredSolWithBuffer,
          error: new DLMMError(
            DLMMErrorType.INSUFFICIENT_SOL,
            `Insufficient SOL balance. Required: ${requiredSolWithBuffer.toFixed(4)}, Available: ${solBalance.toFixed(4)}`
          )
        };
      }

      // TODO: Add token balance validation if tokenMint is provided
      // This would require additional logic to fetch token accounts

      return {
        isValid: true,
        solBalance,
        requiredSol: requiredSolWithBuffer
      };
    } catch (error) {
      return {
        isValid: false,
        solBalance: 0,
        requiredSol: requiredSolAmount,
        error: new DLMMError(
          DLMMErrorType.NETWORK_ERROR,
          'Failed to validate balances',
          error instanceof Error ? error.message : String(error)
        )
      };
    }
  }

  /**
   * Enhanced pool initialization with error handling
   */
  async initializePool(poolAddress: string): Promise<DlmmType> {
    try {
      if (this.poolInstances.has(poolAddress)) {
        return this.poolInstances.get(poolAddress)!;
      }

      const pubkey = new PublicKey(poolAddress);
      const pool = await DLMM.create(this._connection, pubkey);
      this.poolInstances.set(poolAddress, pool);
      return pool;
    } catch (error) {
      throw new DLMMError(
        DLMMErrorType.INVALID_POOL,
        'Failed to initialize DLMM pool',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Enhanced get active bin with error handling
   */
  async getActiveBin(poolAddress: string): Promise<ActiveBin> {
    try {
      const pool = await this.initializePool(poolAddress);
      const activeBin = await (pool as any).getActiveBin();
      
      return {
        binId: activeBin.binId,
        price: activeBin.price,
        xAmount: activeBin.xAmount?.toString() || '0',
        yAmount: activeBin.yAmount?.toString() || '0',
      };
    } catch (error) {
      throw new DLMMError(
        DLMMErrorType.INVALID_POOL,
        'Failed to get active bin information',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Enhanced calculate balanced Y amount with error handling
   */
  calculateBalancedYAmount(
    activeBinId: number,
    binStep: number,
    totalXAmount: BN,
    activeBinXAmount: string,
    activeBinYAmount: string,
    minBinId: number,
    maxBinId: number,
    strategyType: StrategyType
  ): BN {
    try {
      const activeBinXAmountBN = new BN(activeBinXAmount || '0');
      const activeBinYAmountBN = new BN(activeBinYAmount || '0');
      
      return autoFillYByStrategy(
        activeBinId,
        binStep,
        totalXAmount,
        activeBinXAmountBN,
        activeBinYAmountBN,
        minBinId,
        maxBinId,
        strategyType
      );
    } catch (error) {
      console.error('Error calculating balanced Y amount:', error);
      return new BN(0);
    }
  }

  /**
   * Enhanced transaction simulation with better error reporting
   */
  async simulateTransaction(
    transaction: Transaction,
    userPublicKey: PublicKey
  ): Promise<{ success: boolean; error?: DLMMError }> {
    try {
      const simulation = await this._connection.simulateTransaction(transaction, []);
      
      if (simulation.value.err) {
        const errorMessage = JSON.stringify(simulation.value.err);
        
        if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient lamports')) {
          return {
            success: false,
            error: new DLMMError(
              DLMMErrorType.INSUFFICIENT_SOL,
              'Transaction simulation failed due to insufficient funds'
            )
          };
        }
        
        return {
          success: false,
          error: new DLMMError(
            DLMMErrorType.TRANSACTION_SIMULATION_FAILED,
            'Transaction simulation failed',
            errorMessage
          )
        };
      }
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new DLMMError(
          DLMMErrorType.NETWORK_ERROR,
          'Failed to simulate transaction',
          error instanceof Error ? error.message : String(error)
        )
      };
    }
  }

  // Include all your existing methods here...
  async getAllPools(): Promise<DlmmPoolInfo[]> {
    try {
      const response = await fetch('https://dlmm-api.meteora.ag/pair/all');
      if (!response.ok) {
        throw new Error('Failed to fetch DLMM pools');
      }
      
      const data = await response.json();
      const pools: DlmmPoolInfo[] = [];
      
      for (const pool of data.pairs || []) {
        pools.push({
          address: pool.address,
          name: pool.name,
          tokenX: pool.token_x.symbol,
          tokenY: pool.token_y.symbol,
          activeBinPrice: parseFloat(pool.price),
          binStep: parseFloat(pool.bin_step),
          totalXAmount: pool.token_x_amount,
          totalYAmount: pool.token_y_amount
        });
      }
      
      return pools;
    } catch (error) {
      throw new DLMMError(
        DLMMErrorType.NETWORK_ERROR,
        'Failed to fetch DLMM pools',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async getUserPositions(poolAddress: string, userPublicKey: PublicKey): Promise<DlmmPositionInfo[]> {
    try {
      const pool = await this.initializePool(poolAddress);
      const { userPositions } = await (pool as any).getPositionsByUserAndLbPair(userPublicKey);
      
      const positions: DlmmPositionInfo[] = [];
      
      for (const position of userPositions) {
        const typedPosition = position as PositionType;
        const bins = typedPosition.positionData.positionBinData.map((bin) => ({
          binId: bin.binId,
          xAmount: bin.xAmount.toString(),
          yAmount: bin.yAmount.toString(),
          liquidityAmount: bin.liquidityAmount.toString()
        }));
        
        positions.push({
          pubkey: typedPosition.publicKey.toString(),
          liquidityPerBin: bins,
          totalValue: 0
        });
      }
      
      return positions;
    } catch (error) {
      throw new DLMMError(
        DLMMErrorType.INVALID_POOL,
        'Failed to fetch user positions',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Add other existing methods with similar error handling...
}

// Enhanced hook with error handling
export function useMeteoraDlmmService() {
  const { publicKey, sendTransaction } = useWallet();
  
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl);
  
  const service = new MeteoraDlmmService(connection);

  return {
    service,
    publicKey,
    sendTransaction,
    // Helper function to handle common errors
    handleDLMMError: (error: unknown): string => {
      if (error instanceof DLMMError) {
        return error.userFriendlyMessage;
      }
      return 'An unexpected error occurred. Please try again.';
    }
  };
}