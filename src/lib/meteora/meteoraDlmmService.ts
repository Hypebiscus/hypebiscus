// src/lib/meteora/meteoraDlmmService.ts
import DLMM, { StrategyType } from '@meteora-ag/dlmm';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { BN } from 'bn.js';
import { useWallet } from '@solana/wallet-adapter-react';

// Interface for pool information
export interface DlmmPoolInfo {
  address: string;
  name: string;
  tokenX: string; // Base token
  tokenY: string; // Quote token
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

// Interface for swap quote
export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  fee: string;
  priceImpact: string;
}

/**
 * Service to interact with Meteora DLMM
 */
export class MeteoraDlmmService {
  private _connection: Connection;
  private poolInstances: Map<string, any> = new Map();

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
   * @param poolAddress Address of the DLMM pool
   * @returns Instance of the DLMM pool
   */
  async initializePool(poolAddress: string): Promise<any> {
    try {
      if (this.poolInstances.has(poolAddress)) {
        return this.poolInstances.get(poolAddress);
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
      
      // Process the API response to extract pool information
      // This is a simplified example, you may need to adjust based on actual API response
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
   * Get active bin information for a pool
   * @param poolAddress Address of the DLMM pool
   */
  async getActiveBin(poolAddress: string): Promise<any> {
    const pool = await this.initializePool(poolAddress);
    return await pool.getActiveBin();
  }

  /**
   * Get user positions for a specific pool
   * @param poolAddress Address of the DLMM pool
   * @param userPublicKey User's public key
   */
  async getUserPositions(poolAddress: string, userPublicKey: PublicKey): Promise<DlmmPositionInfo[]> {
    try {
      const pool = await this.initializePool(poolAddress);
      const { userPositions } = await pool.getPositionsByUserAndLbPair(userPublicKey);
      
      const positions: DlmmPositionInfo[] = [];
      
      for (const position of userPositions) {
        const bins = position.positionData.positionBinData.map(bin => ({
          binId: bin.binId,
          xAmount: bin.xAmount.toString(),
          yAmount: bin.yAmount.toString(),
          liquidityAmount: bin.liquidityAmount.toString()
        }));
        
        positions.push({
          pubkey: position.publicKey.toString(),
          liquidityPerBin: bins,
          totalValue: 0 // You would calculate this based on current prices
        });
      }
      
      return positions;
    } catch (error) {
      console.error('Error fetching user positions:', error);
      throw error;
    }
  }

  /**
   * Get swap quote
   * @param poolAddress Address of the DLMM pool
   * @param amountIn Amount to swap
   * @param swapForY Whether to swap token X for token Y (true) or token Y for token X (false)
   */
  async getSwapQuote(poolAddress: string, amountIn: BN, swapForY: boolean): Promise<SwapQuote> {
    try {
      const pool = await this.initializePool(poolAddress);
      
      // Get swap quote
      const quote = await pool.getSwapQuote({
        amountIn,
        swapForY,
      });
      
      return {
        amountIn: quote.amountIn.toString(),
        amountOut: quote.amountOut.toString(),
        fee: quote.fee.toString(),
        priceImpact: quote.priceImpact.toString()
      };
    } catch (error) {
      console.error('Error getting swap quote:', error);
      throw error;
    }
  }

  /**
   * Perform a swap
   * @param poolAddress Address of the DLMM pool
   * @param userPublicKey User's public key
   * @param amountIn Amount to swap
   * @param minAmountOut Minimum amount to receive
   * @param swapForY Whether to swap token X for token Y (true) or token Y for token X (false)
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
      
      // Create swap transaction
      const swapTx = await pool.swap({
        user: userPublicKey,
        amountIn,
        minAmountOut,
        swapForY,
      });
      
      return swapTx;
    } catch (error) {
      console.error('Error creating swap transaction:', error);
      throw error;
    }
  }
}

// Create a hook to use the DLMM service
export function useMeteoraDlmmService() {
  const { publicKey, sendTransaction } = useWallet();
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const service = new MeteoraDlmmService(connection);

  return {
    service,
    publicKey,
    sendTransaction,
  };
}