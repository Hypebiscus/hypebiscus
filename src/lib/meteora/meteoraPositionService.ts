// src/lib/meteora/meteoraPositionService.ts
import DLMM, { StrategyType } from '@meteora-ag/dlmm';
import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';

// Interface for position creation parameters
export interface CreatePositionParams {
  poolAddress: string;
  userPublicKey: PublicKey;
  totalXAmount: BN;
  totalYAmount: BN;
  minBinId: number;
  maxBinId: number;
  strategyType: StrategyType;
}

// Interface for position management parameters
export interface PositionManagementParams {
  poolAddress: string;
  positionPubkey: string;
  userPublicKey: PublicKey;
}

/**
 * Service for managing DLMM positions
 */
export class MeteoraPositionService {
  private connection: Connection;
  private poolInstances: Map<string, any> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
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
      const pool = await DLMM.create(this.connection, pubkey);
      this.poolInstances.set(poolAddress, pool);
      return pool;
    } catch (error) {
      console.error('Error initializing Meteora DLMM pool:', error);
      throw error;
    }
  }

  /**
   * Create a new position with balanced liquidity
   * @param params Parameters for creating a position
   * @returns Transaction and new position keypair
   */
  async createBalancedPosition(params: CreatePositionParams): Promise<{
    transaction: Transaction | Transaction[];
    positionKeypair: Keypair;
  }> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const newPosition = new Keypair();

      const createPositionTx = await pool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newPosition.publicKey,
        user: params.userPublicKey,
        totalXAmount: params.totalXAmount,
        totalYAmount: params.totalYAmount,
        strategy: {
          maxBinId: params.maxBinId,
          minBinId: params.minBinId,
          strategyType: params.strategyType,
        },
      });

      return {
        transaction: createPositionTx,
        positionKeypair: newPosition,
      };
    } catch (error) {
      console.error('Error creating balanced position:', error);
      throw error;
    }
  }

  /**
   * Create a one-sided position (single token)
   * @param params Parameters for creating a position
   * @param useTokenX Whether to use token X (true) or token Y (false)
   * @returns Transaction and new position keypair
   */
  async createOneSidedPosition(
    params: CreatePositionParams,
    useTokenX: boolean
  ): Promise<{
    transaction: Transaction | Transaction[];
    positionKeypair: Keypair;
  }> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const newPosition = new Keypair();
      
      // For one-sided position, set either X or Y amount to 0
      const totalXAmount = useTokenX ? params.totalXAmount : new BN(0);
      const totalYAmount = useTokenX ? new BN(0) : params.totalYAmount;

      const createPositionTx = await pool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newPosition.publicKey,
        user: params.userPublicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId: params.maxBinId,
          minBinId: params.minBinId,
          strategyType: params.strategyType,
        },
      });

      return {
        transaction: createPositionTx,
        positionKeypair: newPosition,
      };
    } catch (error) {
      console.error('Error creating one-sided position:', error);
      throw error;
    }
  }

  /**
   * Add liquidity to an existing position
   * @param params Parameters for position management
   * @param totalXAmount Amount of token X to add
   * @param totalYAmount Amount of token Y to add
   * @param minBinId Minimum bin ID
   * @param maxBinId Maximum bin ID
   * @param strategyType Strategy type
   * @returns Transaction for adding liquidity
   */
  async addLiquidity(
    params: PositionManagementParams,
    totalXAmount: BN,
    totalYAmount: BN,
    minBinId: number,
    maxBinId: number,
    strategyType: StrategyType
  ): Promise<Transaction | Transaction[]> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      
      const positionPubKey = new PublicKey(params.positionPubkey);
      
      const addLiquidityTx = await pool.addLiquidityByStrategy({
        positionPubKey,
        user: params.userPublicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId,
          minBinId,
          strategyType,
        },
      });

      return addLiquidityTx;
    } catch (error) {
      console.error('Error adding liquidity:', error);
      throw error;
    }
  }

  /**
   * Remove liquidity from a position
   * @param params Parameters for position management
   * @param fromBinId Starting bin ID to remove liquidity from
   * @param toBinId Ending bin ID to remove liquidity from
   * @param percentages Array of percentages to remove from each bin (in basis points, 10000 = 100%)
   * @param shouldClaimAndClose Whether to claim fees and close the position
   * @returns Transaction for removing liquidity
   */
  async removeLiquidity(
    params: PositionManagementParams,
    fromBinId: number,
    toBinId: number,
    percentages: BN[],
    shouldClaimAndClose: boolean
  ): Promise<Transaction | Transaction[]> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      
      const positionPubKey = new PublicKey(params.positionPubkey);
      
      // Update to use fromBinId and toBinId instead of binIds array
      const removeLiquidityTx = await pool.removeLiquidity({
        position: positionPubKey,
        user: params.userPublicKey,
        fromBinId,
        toBinId,
        liquiditiesBpsToRemove: percentages,
        shouldClaimAndClose,
      });

      return removeLiquidityTx;
    } catch (error) {
      console.error('Error removing liquidity:', error);
      throw error;
    }
  }

  /**
   * Claim fees from a position
   * @param params Parameters for position management
   * @returns Transaction for claiming fees
   */
  async claimFees(params: PositionManagementParams): Promise<Transaction> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      
      const positionPubKey = new PublicKey(params.positionPubkey);
      
      const claimFeeTx = await pool.claimSwapFee({
        owner: params.userPublicKey,
        position: positionPubKey,
      });

      return claimFeeTx;
    } catch (error) {
      console.error('Error claiming fees:', error);
      throw error;
    }
  }

  /**
   * Close a position
   * @param params Parameters for position management
   * @returns Transaction for closing the position
   */
  async closePosition(params: PositionManagementParams): Promise<Transaction> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      
      const positionPubKey = new PublicKey(params.positionPubkey);
      
      const closePositionTx = await pool.closePosition({
        owner: params.userPublicKey,
        position: positionPubKey,
      });

      return closePositionTx;
    } catch (error) {
      console.error('Error closing position:', error);
      throw error;
    }
  }
}

// Hook to use the position service
export function useMeteoraPositionService() {
  const { publicKey, sendTransaction } = useWallet();
  
  // Use environment variable for RPC URL
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl);
  
  const service = new MeteoraPositionService(connection);

  return {
    service,
    publicKey,
    sendTransaction,
  };
}