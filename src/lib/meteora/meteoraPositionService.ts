// src/lib/meteora/meteoraPositionService.ts
import DLMM, { StrategyType, autoFillYByStrategy } from '@meteora-ag/dlmm';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';

// Import types from DLMM service for consistency
export type DlmmType = DLMM;

// Interface for position creation parameters
export interface CreatePositionParams {
  poolAddress: string;
  userPublicKey: PublicKey;
  totalXAmount: BN;
  totalYAmount?: BN; // Made optional for auto-calculation
  minBinId: number;
  maxBinId: number;
  strategyType: StrategyType;
  useAutoFill?: boolean; // New option for balanced positions
}

// Interface for position management parameters
export interface PositionManagementParams {
  poolAddress: string;
  positionPubkey: string;
  userPublicKey: PublicKey;
}

// Interface for remove liquidity parameters - FIXED
export interface RemoveLiquidityParams extends PositionManagementParams {
  fromBinId: number;
  toBinId: number;
  liquiditiesBpsToRemove: BN[];
  shouldClaimAndClose: boolean;
}

/**
 * Service for managing DLMM positions
 */
export class MeteoraPositionService {
  private connection: Connection;
  private poolInstances: Map<string, DlmmType> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
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
      const pool = await DLMM.create(this.connection, pubkey);
      this.poolInstances.set(poolAddress, pool);
      return pool;
    } catch (error) {
      console.error('Error initializing Meteora DLMM pool:', error);
      throw error;
    }
  }

  /**
   * Create a new position with balanced liquidity - FIXED
   */
  async createBalancedPosition(params: CreatePositionParams): Promise<{
    transaction: Transaction | Transaction[];
    positionKeypair: Keypair;
  }> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const newPosition = new Keypair();
      const typedPool = pool as any;

      let totalYAmount = params.totalYAmount || new BN(0);

      // Use autoFillYByStrategy for truly balanced positions
      if (params.useAutoFill !== false) {
        try {
          // Get active bin information
          const activeBin = await typedPool.getActiveBin();
          
          // Calculate balanced Y amount using SDK helper
          totalYAmount = autoFillYByStrategy(
            activeBin.binId,
            typedPool.lbPair.binStep,
            params.totalXAmount,
            activeBin.xAmount,
            activeBin.yAmount,
            params.minBinId,
            params.maxBinId,
            params.strategyType
          );

          console.log('Auto-calculated balanced Y amount:', totalYAmount.toString());
        } catch (autoFillError) {
          console.warn('AutoFill failed, using provided or zero Y amount:', autoFillError);
          // Fallback to provided amount or zero
          totalYAmount = params.totalYAmount || new BN(0);
        }
      }

      const createPositionTx = await typedPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newPosition.publicKey,
        user: params.userPublicKey,
        totalXAmount: params.totalXAmount,
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
      console.error('Error creating balanced position:', error);
      throw error;
    }
  }

  /**
   * Create a one-sided position (single token) - IMPROVED
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
      const typedPool = pool as any;
      
      // For one-sided position, set either X or Y amount to 0
      const totalXAmount = useTokenX ? params.totalXAmount : new BN(0);
      const totalYAmount = useTokenX ? new BN(0) : (params.totalYAmount || params.totalXAmount);

      // Adjust bin range for one-sided positions
      let minBinId = params.minBinId;
      let maxBinId = params.maxBinId;

      if (useTokenX) {
        // For X token only, position should be above current price
        const activeBin = await typedPool.getActiveBin();
        minBinId = activeBin.binId;
        maxBinId = activeBin.binId + (params.maxBinId - params.minBinId);
      }

      const createPositionTx = await typedPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newPosition.publicKey,
        user: params.userPublicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId,
          minBinId,
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
   * Add liquidity to an existing position - IMPROVED
   */
  async addLiquidity(
    params: PositionManagementParams,
    totalXAmount: BN,
    totalYAmount: BN,
    minBinId: number,
    maxBinId: number,
    strategyType: StrategyType,
    useAutoFill: boolean = true
  ): Promise<Transaction | Transaction[]> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as any;
      
      let finalTotalYAmount = totalYAmount;

      // Use autoFillYByStrategy for balanced liquidity addition
      if (useAutoFill && totalYAmount.isZero()) {
        try {
          const activeBin = await typedPool.getActiveBin();
          
          finalTotalYAmount = autoFillYByStrategy(
            activeBin.binId,
            typedPool.lbPair.binStep,
            totalXAmount,
            activeBin.xAmount,
            activeBin.yAmount,
            minBinId,
            maxBinId,
            strategyType
          );
        } catch (autoFillError) {
          console.warn('AutoFill failed for add liquidity, using zero Y amount:', autoFillError);
          finalTotalYAmount = new BN(0);
        }
      }
      
      const addLiquidityTx = await typedPool.addLiquidityByStrategy({
        positionPubKey,
        user: params.userPublicKey,
        totalXAmount,
        totalYAmount: finalTotalYAmount,
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
   * Remove liquidity from a position - FIXED
   */
  async removeLiquidity(
    params: RemoveLiquidityParams
  ): Promise<Transaction | Transaction[]> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as any;
      
      // Use the correct SDK parameters
      const removeLiquidityTx = await typedPool.removeLiquidity({
        position: positionPubKey,
        user: params.userPublicKey,
        fromBinId: params.fromBinId,
        toBinId: params.toBinId,
        liquiditiesBpsToRemove: params.liquiditiesBpsToRemove,
        shouldClaimAndClose: params.shouldClaimAndClose,
      });

      return removeLiquidityTx;
    } catch (error) {
      console.error('Error removing liquidity:', error);
      throw error;
    }
  }

  /**
   * Remove liquidity with automatic bin detection - NEW
   */
  async removeLiquidityFromPosition(
    params: PositionManagementParams,
    percentageToRemove: number = 100,
    shouldClaimAndClose: boolean = true
  ): Promise<Transaction | Transaction[]> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as any;

      // Get user positions to find the specific position
      const { userPositions } = await typedPool.getPositionsByUserAndLbPair(params.userPublicKey);
      
      const userPosition = userPositions.find((pos: any) => 
        pos.publicKey.equals(positionPubKey)
      );

      if (!userPosition) {
        throw new Error('Position not found');
      }

      // Extract bin IDs from position data
      const binIdsToRemove = userPosition.positionData.positionBinData.map((bin: any) => bin.binId);
      
      if (binIdsToRemove.length === 0) {
        throw new Error('No bins found in position');
      }

      const fromBinId = Math.min(...binIdsToRemove);
      const toBinId = Math.max(...binIdsToRemove);
      
      // Calculate percentage in basis points (10000 = 100%)
      const bpsToRemove = new BN(percentageToRemove * 100); // Convert to basis points
      const liquiditiesBpsToRemove = new Array(binIdsToRemove.length).fill(bpsToRemove);

      const removeLiquidityTx = await typedPool.removeLiquidity({
        position: positionPubKey,
        user: params.userPublicKey,
        fromBinId,
        toBinId,
        liquiditiesBpsToRemove,
        shouldClaimAndClose,
      });

      return removeLiquidityTx;
    } catch (error) {
      console.error('Error removing liquidity from position:', error);
      throw error;
    }
  }

  /**
   * Claim fees from a position - UPDATED
   */
  async claimFees(params: PositionManagementParams): Promise<Transaction> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as any;
      
      const claimFeeTx = await typedPool.claimSwapFee({
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
   * Claim all fees from multiple positions - NEW
   */
  async claimAllFees(
    poolAddress: string,
    userPublicKey: PublicKey
  ): Promise<Transaction[]> {
    try {
      const pool = await this.initializePool(poolAddress);
      const typedPool = pool as any;

      // Get all user positions
      const { userPositions } = await typedPool.getPositionsByUserAndLbPair(userPublicKey);

      const claimFeeTxs = await typedPool.claimAllSwapFee({
        owner: userPublicKey,
        positions: userPositions,
      });

      return Array.isArray(claimFeeTxs) ? claimFeeTxs : [claimFeeTxs];
    } catch (error) {
      console.error('Error claiming all fees:', error);
      throw error;
    }
  }

  /**
   * Close a position
   */
  async closePosition(params: PositionManagementParams): Promise<Transaction> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as any;
      
      const closePositionTx = await typedPool.closePosition({
        owner: params.userPublicKey,
        position: positionPubKey,
      });

      return closePositionTx;
    } catch (error) {
      console.error('Error closing position:', error);
      throw error;
    }
  }

  /**
   * Get position information - NEW
   */
  async getPositionInfo(
    poolAddress: string,
    positionPubkey: string
  ): Promise<any> {
    try {
      const pool = await this.initializePool(poolAddress);
      const positionPubKey = new PublicKey(positionPubkey);
      const typedPool = pool as any;

      const positionInfo = await typedPool.getPosition(positionPubKey);
      return positionInfo;
    } catch (error) {
      console.error('Error getting position info:', error);
      throw error;
    }
  }
}

// Hook to use the position service
export function useMeteoraPositionService() {
  const { publicKey, sendTransaction } = useWallet();
  
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl);
  
  const service = new MeteoraPositionService(connection);

  return {
    service,
    publicKey,
    sendTransaction,
  };
}