// src/lib/meteora/meteoraDlmmService.ts
import DLMM, { StrategyType, autoFillYByStrategy } from '@meteora-ag/dlmm';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';

// Define type aliases for the library types
export type DlmmType = DLMM;

// Interface for BinArray with known properties
export interface BinArrayType {
  publicKey: PublicKey;
  [key: string]: unknown;
}

// Interface for Position with known properties
export interface PositionType {
  publicKey: PublicKey;
  positionData: {
    positionBinData: BinDataType[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Interface for BinData with known properties
export interface BinDataType {
  binId: number;
  xAmount: { toString(): string };
  yAmount: { toString(): string };
  liquidityAmount: { toString(): string };
  [key: string]: unknown;
}

// Interface for bin liquidity information
export interface BinLiquidity {
  binId: number;
  xAmount: string;
  yAmount: string;
  liquidityAmount: string;
  price: string;
}

// Interface for pool information
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

// Interface for position information
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

// Enhanced swap quote interface
export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  minOutAmount: string;
  fee: string;
  priceImpact: string;
  binArraysPubkey: PublicKey[];
}

// Enhanced active bin interface
export interface ActiveBin {
  binId: number;
  price: string;
  xAmount: string;
  yAmount: string;
}

/**
 * Service to interact with Meteora DLMM
 */
export class MeteoraDlmmService {
  private _connection: Connection;
  private poolInstances: Map<string, DlmmType> = new Map();

  constructor(connection: Connection) {
    this._connection = connection;
  }

  /**
   * Get the Solana connection
   */
  get connection(): Connection {
    return this._connection;
  }

  /**
   * Initialize a DLMM pool
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
      console.error('Error initializing Meteora DLMM pool:', error);
      throw error;
    }
  }

  /**
   * Initialize multiple pools at once
   */
  async initializeMultiplePools(poolAddresses: string[]): Promise<DlmmType[]> {
    try {
      const pubkeys = poolAddresses.map(addr => new PublicKey(addr));
      const pools = await DLMM.createMultiple(this._connection, pubkeys);
      
      // Cache the pools
      pools.forEach((pool, index) => {
        this.poolInstances.set(poolAddresses[index], pool);
      });
      
      return pools;
    } catch (error) {
      console.error('Error initializing multiple Meteora DLMM pools:', error);
      throw error;
    }
  }

  /**
   * Get all available pools from Meteora API
   */
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
      console.error('Error fetching DLMM pools:', error);
      throw error;
    }
  }

  /**
   * Get active bin information for a pool - FIXED
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
      console.error('Error getting active bin:', error);
      throw error;
    }
  }

  /**
   * Get user positions for a specific pool
   */
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
          totalValue: 0 // Calculate based on current prices
        });
      }
      
      return positions;
    } catch (error) {
      console.error('Error fetching user positions:', error);
      throw error;
    }
  }

  /**
   * Get swap quote - FIXED
   */
  async getSwapQuote(poolAddress: string, amountIn: BN, swapForY: boolean): Promise<SwapQuote> {
    try {
      const pool = await this.initializePool(poolAddress);
      const poolWithMethods = pool as any;
      
      // Get bin arrays for swap
      const binArrays = await poolWithMethods.getBinArrayForSwap(swapForY);
      
      // Get swap quote with proper slippage
      const quote = await poolWithMethods.swapQuote(
        amountIn,
        swapForY,
        new BN(1), // 0.01% slippage
        binArrays
      );
      
      return {
        amountIn: amountIn.toString(),
        amountOut: quote.outAmount?.toString() || '0',
        minOutAmount: quote.minOutAmount?.toString() || '0',
        fee: quote.fee?.toString() || '0',
        priceImpact: quote.priceImpact?.toString() || '0',
        binArraysPubkey: quote.binArraysPubkey || []
      };
    } catch (error) {
      console.error('Error getting swap quote:', error);
      throw error;
    }
  }

  /**
   * Perform a swap - FIXED
   */
  async swap(
    poolAddress: string, 
    userPublicKey: PublicKey, 
    amountIn: BN, 
    minAmountOut: BN, 
    swapForY: boolean
  ): Promise<Transaction> {
    try {
      const pool = await this.initializePool(poolAddress);
      const typedPool = pool as any;
      
      // Get bin arrays and quote first
      const binArrays = await typedPool.getBinArrayForSwap(swapForY);
      const swapQuote = await typedPool.swapQuote(amountIn, swapForY, new BN(1), binArrays);
      
      // Create swap transaction using quote data
      const swapTx = await typedPool.swap({
        inToken: swapForY ? typedPool.tokenX.publicKey : typedPool.tokenY.publicKey,
        binArraysPubkey: swapQuote.binArraysPubkey,
        inAmount: amountIn,
        lbPair: typedPool.pubkey,
        user: userPublicKey,
        minOutAmount: minAmountOut,
        outToken: swapForY ? typedPool.tokenY.publicKey : typedPool.tokenX.publicKey,
      });
      
      return swapTx;
    } catch (error) {
      console.error('Error creating swap transaction:', error);
      throw error;
    }
  }

  /**
   * Calculate balanced Y amount using SDK helper - FIXED BN TYPES
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
      // Convert string amounts to BN as required by autoFillYByStrategy
      const activeBinXAmountBN = new BN(activeBinXAmount || '0');
      const activeBinYAmountBN = new BN(activeBinYAmount || '0');
      
      return autoFillYByStrategy(
        activeBinId,
        binStep,
        totalXAmount,
        activeBinXAmountBN,  // ✅ Fixed: Convert string to BN
        activeBinYAmountBN,  // ✅ Fixed: Convert string to BN
        minBinId,
        maxBinId,
        strategyType
      );
    } catch (error) {
      console.error('Error calculating balanced Y amount:', error);
      // Fallback to zero if calculation fails
      return new BN(0);
    }
  }

  /**
   * Update pool state - NEW
   */
  async updatePoolState(poolAddress: string): Promise<void> {
    try {
      const pool = await this.initializePool(poolAddress);
      await (pool as any).refetchStates();
    } catch (error) {
      console.error('Error updating pool state:', error);
      throw error;
    }
  }

  /**
   * Get bins in range - NEW
   */
  async getBinsInRange(
    poolAddress: string, 
    lowerBinId: number, 
    upperBinId: number
  ): Promise<{ activeBin: number; bins: BinLiquidity[] }> {
    try {
      const pool = await this.initializePool(poolAddress);
      return await (pool as any).getBins(lowerBinId, upperBinId);
    } catch (error) {
      console.error('Error getting bins in range:', error);
      throw error;
    }
  }
}

// Create a hook to use the DLMM service
export function useMeteoraDlmmService() {
  const { publicKey, sendTransaction } = useWallet();
  
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl);
  
  const service = new MeteoraDlmmService(connection);

  return {
    service,
    publicKey,
    sendTransaction,
  };
}