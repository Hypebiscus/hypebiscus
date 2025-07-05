// Enhanced meteoraPositionService.ts with cost estimation and better error handling
import DLMM, { StrategyType, autoFillYByStrategy } from '@meteora-ag/dlmm';
import { Connection, PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';

// Import types from DLMM service for consistency
export type DlmmType = DLMM;

// Enhanced interface for position creation parameters
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

// Enhanced interface for remove liquidity parameters
export interface RemoveLiquidityParams extends PositionManagementParams {
  fromBinId: number;
  toBinId: number;
  liquiditiesBpsToRemove: BN[];
  shouldClaimAndClose: boolean;
}

// New interface for cost estimation
export interface CostEstimation {
  positionRent: number;
  binArrayCost: number;
  transactionFees: number;
  total: number;
  breakdown: {
    newBinArraysNeeded: number;
    existingBinArrays: number;
    estimatedComputeUnits: number;
  };
}

// Enhanced interface for position creation result
export interface CreatePositionResult {
  transaction: Transaction | Transaction[];
  positionKeypair: Keypair;
  estimatedCost: CostEstimation;
}

/**
 * Enhanced Service for managing DLMM positions with cost estimation
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
   * Check if binArrays exist for a given range and estimate creation costs
   */
  async checkBinArrayCreationCost(
    poolAddress: string,
    minBinId: number,
    maxBinId: number
  ): Promise<CostEstimation> {
    try {
      const pool = await this.initializePool(poolAddress);
      const typedPool = pool as any;
      
      // Calculate which binArrays would be needed
      const binArraysNeeded = new Set<number>();
      
      // Each binArray typically covers ~70 bins, but this can vary
      // We'll check by trying to get bin data for key positions
      for (let binId = minBinId; binId <= maxBinId; binId += 35) {
        const binArrayIndex = Math.floor(binId / 35); // Approximate binArray indexing
        binArraysNeeded.add(binArrayIndex);
      }
      
      let newBinArraysCount = 0;
      let existingBinArraysCount = 0;
      
      // Check which binArrays already exist
      for (const binArrayIndex of binArraysNeeded) {
        try {
          // Try to get a bin in this array to see if it exists
          const testBinId = binArrayIndex * 35;
          await typedPool.getBin(testBinId);
          existingBinArraysCount++;
          console.log(`BinArray ${binArrayIndex} exists (test bin ${testBinId})`);
        } catch (error) {
          // BinArray doesn't exist, will need creation
          newBinArraysCount++;
          console.log(`BinArray ${binArrayIndex} needs creation (test bin failed)`);
        }
      }
      
      // Calculate costs
      const positionRent = 0.057; // Standard position rent (refundable)
      const binArrayCost = newBinArraysCount * 0.075; // 0.075 SOL per new binArray (non-refundable)
      const transactionFees = 0.01; // Estimated transaction fees
      const total = positionRent + binArrayCost + transactionFees;
      
      const costEstimation: CostEstimation = {
        positionRent,
        binArrayCost,
        transactionFees,
        total,
        breakdown: {
          newBinArraysNeeded: newBinArraysCount,
          existingBinArrays: existingBinArraysCount,
          estimatedComputeUnits: newBinArraysCount * 20000 + 50000 // Rough estimate
        }
      };
      
      console.log('Cost estimation for range', minBinId, 'to', maxBinId, ':', costEstimation);
      
      return costEstimation;
      
    } catch (error) {
      console.error('Error checking binArray creation cost:', error);
      
      // Conservative fallback estimate
      const binRangeWidth = maxBinId - minBinId;
      const estimatedBinArrays = Math.ceil(binRangeWidth / 35); // Conservative estimate
      
      return {
        positionRent: 0.057,
        binArrayCost: estimatedBinArrays * 0.075,
        transactionFees: 0.01,
        total: 0.057 + (estimatedBinArrays * 0.075) + 0.01,
        breakdown: {
          newBinArraysNeeded: estimatedBinArrays,
          existingBinArrays: 0,
          estimatedComputeUnits: estimatedBinArrays * 20000 + 50000
        }
      };
    }
  }

  /**
   * Validate user balance before creating position
   */
  async validateUserBalance(
    userPublicKey: PublicKey,
    requiredSolAmount: number,
    estimatedCost: CostEstimation
  ): Promise<{ isValid: boolean; currentBalance: number; shortfall?: number; error?: string }> {
    try {
      const solBalanceLamports = await this.connection.getBalance(userPublicKey);
      const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
      
      const totalRequired = requiredSolAmount + estimatedCost.total;
      
      if (solBalance < totalRequired) {
        return {
          isValid: false,
          currentBalance: solBalance,
          shortfall: totalRequired - solBalance,
          error: `Insufficient SOL balance. Required: ${totalRequired.toFixed(4)} SOL, Available: ${solBalance.toFixed(4)} SOL`
        };
      }
      
      return {
        isValid: true,
        currentBalance: solBalance
      };
      
    } catch (error) {
      return {
        isValid: false,
        currentBalance: 0,
        error: 'Failed to check balance: ' + (error instanceof Error ? error.message : String(error))
      };
    }
  }

  /**
   * Create a new position with enhanced cost estimation and validation
   */
  async createBalancedPosition(params: CreatePositionParams): Promise<CreatePositionResult> {
    try {
      console.log('Creating balanced position with params:', {
        poolAddress: params.poolAddress,
        minBinId: params.minBinId,
        maxBinId: params.maxBinId,
        strategyType: params.strategyType,
        useAutoFill: params.useAutoFill
      });

      // Step 1: Estimate costs before doing anything
      const estimatedCost = await this.checkBinArrayCreationCost(
        params.poolAddress,
        params.minBinId,
        params.maxBinId
      );

      console.log('Estimated cost for position:', estimatedCost);

      // Step 2: Validate user balance
      const estimatedSolForLiquidity = params.totalXAmount.toNumber() / Math.pow(10, 9); // Assuming 9 decimals
      const balanceValidation = await this.validateUserBalance(
        params.userPublicKey,
        estimatedSolForLiquidity,
        estimatedCost
      );

      if (!balanceValidation.isValid) {
        throw new Error(balanceValidation.error || 'Insufficient balance');
      }

      console.log('Balance validation passed:', balanceValidation);

      // Step 3: Initialize pool and create position
      const pool = await this.initializePool(params.poolAddress);
      const newPosition = new Keypair();
      const typedPool = pool as any;

      let totalYAmount = params.totalYAmount || new BN(0);

      // Use autoFillYByStrategy for truly balanced positions
      if (params.useAutoFill !== false) {
        try {
          // Get active bin information
          const activeBin = await typedPool.getActiveBin();
          
          console.log('Active bin info:', {
            binId: activeBin.binId,
            price: activeBin.price,
            xAmount: activeBin.xAmount.toString(),
            yAmount: activeBin.yAmount.toString()
          });
          
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

      // Step 4: Create the position transaction
      console.log('Creating position transaction with:', {
        positionPubKey: newPosition.publicKey.toString(),
        user: params.userPublicKey.toString(),
        totalXAmount: params.totalXAmount.toString(),
        totalYAmount: totalYAmount.toString(),
        strategy: {
          maxBinId: params.maxBinId,
          minBinId: params.minBinId,
          strategyType: params.strategyType,
        }
      });

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

      console.log('Position transaction created successfully');

      return {
        transaction: createPositionTx,
        positionKeypair: newPosition,
        estimatedCost
      };
    } catch (error) {
      console.error('Error creating balanced position:', error);
      
      // Enhanced error handling with specific error types
      if (error instanceof Error) {
        if (error.message.includes('insufficient lamports')) {
          throw new Error('Insufficient SOL balance for position creation. Please add more SOL to your wallet.');
        }
        
        if (error.message.includes('Transaction simulation failed')) {
          throw new Error('Position creation failed during simulation. This usually indicates insufficient funds or invalid parameters.');
        }
        
        if (error.message.includes('binArray')) {
          throw new Error('Error with price bin creation. The selected range may require expensive bin creation. Try a different range.');
        }
      }
      
      throw error;
    }
  }

  /**
   * Create a one-sided position (single token) with cost estimation
   */
  async createOneSidedPosition(
    params: CreatePositionParams,
    useTokenX: boolean
  ): Promise<CreatePositionResult> {
    try {
      // First get cost estimation
      const estimatedCost = await this.checkBinArrayCreationCost(
        params.poolAddress,
        params.minBinId,
        params.maxBinId
      );

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
        estimatedCost
      };
    } catch (error) {
      console.error('Error creating one-sided position:', error);
      throw error;
    }
  }

  /**
   * Add liquidity to an existing position with cost validation
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
   * Remove liquidity from a position
   */
  async removeLiquidity(
    params: RemoveLiquidityParams
  ): Promise<Transaction | Transaction[]> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as any;
      
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
   * Remove liquidity with automatic bin detection and percentage-based removal
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
      const bpsToRemove = new BN(percentageToRemove * 100);
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
   * Claim fees from a position
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
   * Claim all fees from multiple positions
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
   * Get position information
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

  /**
   * Get range recommendations based on existing positions
   */
  async getRangeRecommendations(poolAddress: string): Promise<{
    popular: { minBinId: number; maxBinId: number; cost: CostEstimation };
    cheap: { minBinId: number; maxBinId: number; cost: CostEstimation };
    balanced: { minBinId: number; maxBinId: number; cost: CostEstimation };
  }> {
    try {
      const pool = await this.initializePool(poolAddress);
      const typedPool = pool as any;
      const activeBin = await typedPool.getActiveBin();
      
      // Define some common ranges to check
      const ranges = [
        { width: 5, minBinId: activeBin.binId - 5, maxBinId: activeBin.binId + 5 },
        { width: 10, minBinId: activeBin.binId - 10, maxBinId: activeBin.binId + 10 },
        { width: 15, minBinId: activeBin.binId - 15, maxBinId: activeBin.binId + 15 },
        { width: 20, minBinId: activeBin.binId - 20, maxBinId: activeBin.binId + 20 },
      ];
      
      // Get cost estimates for each range
      const rangeWithCosts = await Promise.all(
        ranges.map(async (range) => ({
          ...range,
          cost: await this.checkBinArrayCreationCost(poolAddress, range.minBinId, range.maxBinId)
        }))
      );
      
      // Find the cheapest option
      const cheap = rangeWithCosts.reduce((prev, curr) => 
        prev.cost.total < curr.cost.total ? prev : curr
      );
      
      // Find popular (assume medium width is popular)
      const popular = rangeWithCosts.find(r => r.width === 10) || rangeWithCosts[1];
      
      // Find balanced (good cost vs range width ratio)
      const balanced = rangeWithCosts.find(r => r.width === 15) || rangeWithCosts[2];
      
      return { popular, cheap, balanced };
    } catch (error) {
      console.error('Error getting range recommendations:', error);
      
      // Fallback recommendations
      const fallbackCost: CostEstimation = {
        positionRent: 0.057,
        binArrayCost: 0.075,
        transactionFees: 0.01,
        total: 0.137,
        breakdown: { newBinArraysNeeded: 1, existingBinArrays: 0, estimatedComputeUnits: 50000 }
      };
      
      return {
        popular: { minBinId: 0, maxBinId: 20, cost: fallbackCost },
        cheap: { minBinId: 0, maxBinId: 10, cost: { ...fallbackCost, total: 0.067 } },
        balanced: { minBinId: 0, maxBinId: 15, cost: fallbackCost }
      };
    }
  }
}

// Enhanced hook to use the position service
export function useMeteoraPositionService() {
  const { publicKey, sendTransaction } = useWallet();
  
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl);
  
  const service = new MeteoraPositionService(connection);

  return {
    service,
    publicKey,
    sendTransaction,
    // Helper function to handle errors gracefully
    handlePositionError: (error: unknown): string => {
      if (error instanceof Error) {
        if (error.message.includes('insufficient lamports')) {
          return 'Insufficient SOL balance for this transaction.';
        }
        if (error.message.includes('Transaction simulation failed')) {
          return 'Transaction simulation failed. Please check your balance and parameters.';
        }
        if (error.message.includes('binArray')) {
          return 'Error with price bin creation. Try selecting a different price range.';
        }
        return error.message;
      }
      return 'An unexpected error occurred. Please try again.';
    }
  };
}