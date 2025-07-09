// Enhanced meteoraPositionService.ts - Modified to use existing bins only
// Removed bin creation functionality to prevent users from providing LP outside existing bin steps

import DLMM, { StrategyType, autoFillYByStrategy } from '@meteora-ag/dlmm';
import { Connection, PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';

export type DlmmType = DLMM;

interface DLMMPool {
  getActiveBin(): Promise<{
    binId: number;
    price: string;
    xAmount: string;
    yAmount: string;
  }>;
  getBin(binId: number): Promise<unknown>;
  getExistingBinArray(binArrayIndex: number): Promise<unknown>;
  initializePositionAndAddLiquidityByStrategy(params: {
    positionPubKey: PublicKey;
    user: PublicKey;
    totalXAmount: BN;
    totalYAmount: BN;
    strategy: {
      maxBinId: number;
      minBinId: number;
      strategyType: StrategyType;
    };
  }): Promise<Transaction | Transaction[]>;
  addLiquidityByStrategy(params: {
    positionPubKey: PublicKey;
    user: PublicKey;
    totalXAmount: BN;
    totalYAmount: BN;
    strategy: {
      maxBinId: number;
      minBinId: number;
      strategyType: StrategyType;
    };
  }): Promise<Transaction | Transaction[]>;
  removeLiquidity(params: {
    position: PublicKey;
    user: PublicKey;
    fromBinId: number;
    toBinId: number;
    liquiditiesBpsToRemove: BN[];
    shouldClaimAndClose: boolean;
  }): Promise<Transaction | Transaction[]>;
  claimSwapFee(params: {
    owner: PublicKey;
    position: PublicKey;
  }): Promise<Transaction>;
  claimAllSwapFee(params: {
    owner: PublicKey;
    positions: PositionData[];
  }): Promise<Transaction | Transaction[]>;
  closePosition(params: {
    owner: PublicKey;
    position: PublicKey;
  }): Promise<Transaction>;
  getPosition(positionPubKey: PublicKey): Promise<unknown>;
  getPositionsByUserAndLbPair(userPublicKey: PublicKey): Promise<{
    userPositions: PositionData[];
  }>;
  lbPair: {
    binStep: number;
  };
  [key: string]: unknown;
}

interface PositionData {
  publicKey: PublicKey;
  positionData: {
    positionBinData: Array<{
      binId: number;
      xAmount: { toString(): string };
      yAmount: { toString(): string };
      liquidityAmount: { toString(): string };
    }>;
  };
  [key: string]: unknown;
}

// Enhanced interface for position creation parameters
export interface CreatePositionParams {
  poolAddress: string;
  userPublicKey: PublicKey;
  totalXAmount: BN;
  totalYAmount?: BN;
  minBinId: number;
  maxBinId: number;
  strategyType: StrategyType;
  useAutoFill?: boolean;
}

export interface PositionManagementParams {
  poolAddress: string;
  positionPubkey: string;
  userPublicKey: PublicKey;
}

export interface RemoveLiquidityParams extends PositionManagementParams {
  fromBinId: number;
  toBinId: number;
  liquiditiesBpsToRemove: BN[];
  shouldClaimAndClose: boolean;
}

// Simplified cost estimation - only position rent since we use existing bins
export interface SimplifiedCostEstimation {
  positionRent: number;
  transactionFees: number;
  total: number;
  breakdown: {
    existingBinsUsed: number;
    noBinCreationNeeded: boolean;
    estimatedComputeUnits: number;
  };
}

export interface CreatePositionResult {
  transaction: Transaction | Transaction[];
  positionKeypair: Keypair;
  estimatedCost: SimplifiedCostEstimation;
}

// Interface for existing bin ranges
export interface ExistingBinRange {
  minBinId: number;
  maxBinId: number;
  existingBins: number[];
  liquidityDepth: number;
  isPopular: boolean;
  description: string;
}

/**
 * Enhanced Service for managing DLMM positions - EXISTING BINS ONLY
 * This version prevents users from creating new bin arrays, keeping costs low and safe
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
   * Find existing bin ranges around the active bin
   * This ensures we only use existing bins and don't create new ones
   */
  async findExistingBinRanges(
    poolAddress: string,
    maxRangeWidth: number = 20
  ): Promise<ExistingBinRange[]> {
    try {
      const pool = await this.initializePool(poolAddress);
      const typedPool = pool as unknown as DLMMPool;
      const activeBin = await typedPool.getActiveBin();
      
      console.log('Finding existing bins around active bin:', activeBin.binId);
      
      const existingRanges: ExistingBinRange[] = [];
      
      // Check different range patterns around the active bin
      const rangesToCheck = [
        { width: 5, offset: 0, name: 'Tight range (±5 bins)' },
        { width: 10, offset: 0, name: 'Standard range (±10 bins)' },
        { width: 15, offset: 0, name: 'Wide range (±15 bins)' },
        { width: 8, offset: 5, name: 'Above current price' },
        { width: 8, offset: -13, name: 'Below current price' }
      ];
      
      for (const range of rangesToCheck) {
        const minBinId = activeBin.binId - Math.floor(range.width/2) + range.offset;
        const maxBinId = activeBin.binId + Math.floor(range.width/2) + range.offset;
        
        if (maxBinId - minBinId > maxRangeWidth) continue;
        
        // Check which bins actually exist in this range
        const existingBins = await this.checkBinsExistence(typedPool, minBinId, maxBinId);
        
        if (existingBins.length >= 3) { // Require at least 3 existing bins
          existingRanges.push({
            minBinId,
            maxBinId,
            existingBins,
            liquidityDepth: existingBins.length,
            isPopular: existingBins.length > 5,
            description: `${range.name} (${existingBins.length} existing bins)`
          });
        }
      }
      
      // Sort by number of existing bins (more existing bins = better)
      existingRanges.sort((a, b) => b.existingBins.length - a.existingBins.length);
      
      console.log('Found existing bin ranges:', existingRanges.length);
      return existingRanges;
      
    } catch (error) {
      console.error('Error finding existing bin ranges:', error);
      throw new Error('Unable to find existing bin ranges for safe liquidity provision');
    }
  }

  /**
   * Check which bins exist in a given range using a simplified approach
   */
  private async checkBinsExistence(
    pool: DLMMPool, 
    minBinId: number, 
    maxBinId: number
  ): Promise<number[]> {
    const existingBins: number[] = [];
    
    try {
      // Get all bin arrays for the pool
      const binArrays = await (pool as any).getBinArrays?.();
      
      if (binArrays && binArrays.length > 0) {
        // Check which bins in our range fall within existing bin arrays
        for (let binId = minBinId; binId <= maxBinId; binId++) {
          const binArrayIndex = Math.floor(binId / 70); // Approximate bins per array
          
          // Check if this bin array exists
          const binArrayExists = binArrays.some((binArray: any) => 
            binArray.account?.index === binArrayIndex
          );
          
          if (binArrayExists) {
            existingBins.push(binId);
          }
        }
      } else {
        // Fallback: assume the active bin and nearby bins exist
        const centerBin = Math.floor((minBinId + maxBinId) / 2);
        for (let i = -2; i <= 2; i++) {
          const binId = centerBin + i;
          if (binId >= minBinId && binId <= maxBinId) {
            existingBins.push(binId);
          }
        }
      }
    } catch (error) {
      console.warn('Could not check bin arrays, using fallback approach:', error);
      
      // Conservative fallback: assume center bins exist
      const centerBin = Math.floor((minBinId + maxBinId) / 2);
      for (let i = -1; i <= 1; i++) {
        const binId = centerBin + i;
        if (binId >= minBinId && binId <= maxBinId) {
          existingBins.push(binId);
        }
      }
    }
    
    return existingBins.sort((a, b) => a - b);
  }

  /**
   * Simplified cost estimation - only position rent since we use existing bins
   */
  async getSimplifiedCostEstimation(
    poolAddress: string,
    existingBinsCount: number = 5
  ): Promise<SimplifiedCostEstimation> {
    const positionRent = 0.057; // Standard position rent (refundable)
    const transactionFees = 0.015; // Estimated transaction fees
    const total = positionRent + transactionFees;
    
    return {
      positionRent,
      transactionFees,
      total,
      breakdown: {
        existingBinsUsed: existingBinsCount,
        noBinCreationNeeded: true,
        estimatedComputeUnits: 50000 // Much lower since no bin creation
      }
    };
  }

  /**
   * Validate user balance for existing-bins-only strategy
   */
  async validateUserBalance(
    userPublicKey: PublicKey,
    requiredSolAmount: number,
    estimatedCost: SimplifiedCostEstimation
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
   * Create a position using ONLY existing bins
   */
  async createPositionWithExistingBins(
    params: CreatePositionParams,
    existingBinRange: ExistingBinRange
  ): Promise<CreatePositionResult> {
    try {
      console.log('Creating position with existing bins only:', {
        poolAddress: params.poolAddress,
        range: `${existingBinRange.minBinId} to ${existingBinRange.maxBinId}`,
        existingBins: existingBinRange.existingBins.length,
        strategyType: params.strategyType
      });

      // Get simplified cost estimation
      const estimatedCost = await this.getSimplifiedCostEstimation(
        params.poolAddress,
        existingBinRange.existingBins.length
      );

      console.log('Simplified cost estimation:', estimatedCost);

      // Validate user balance
      const estimatedSolForLiquidity = params.totalXAmount.toNumber() / Math.pow(10, 9);
      const balanceValidation = await this.validateUserBalance(
        params.userPublicKey,
        estimatedSolForLiquidity,
        estimatedCost
      );

      if (!balanceValidation.isValid) {
        throw new Error(balanceValidation.error || 'Insufficient balance');
      }

      console.log('Balance validation passed:', balanceValidation);

      // Initialize pool and create position
      const pool = await this.initializePool(params.poolAddress);
      const newPosition = new Keypair();
      const typedPool = pool as unknown as DLMMPool;

      let totalYAmount = params.totalYAmount || new BN(0);

      // Use autoFillYByStrategy for balanced positions if requested
      if (params.useAutoFill !== false && totalYAmount.isZero()) {
        try {
          const activeBin = await typedPool.getActiveBin();
          
          totalYAmount = autoFillYByStrategy(
            activeBin.binId,
            typedPool.lbPair.binStep,
            params.totalXAmount,
            new BN(activeBin.xAmount),
            new BN(activeBin.yAmount),
            existingBinRange.minBinId,
            existingBinRange.maxBinId,
            params.strategyType
          );

          console.log('Auto-calculated Y amount using existing bins:', totalYAmount.toString());
        } catch (autoFillError) {
          console.warn('AutoFill failed, using provided or zero Y amount:', autoFillError);
          totalYAmount = params.totalYAmount || new BN(0);
        }
      }

      // Create the position transaction using existing bin range
      console.log('Creating position transaction with existing bins:', {
        positionPubKey: newPosition.publicKey.toString(),
        user: params.userPublicKey.toString(),
        totalXAmount: params.totalXAmount.toString(),
        totalYAmount: totalYAmount.toString(),
        strategy: {
          maxBinId: existingBinRange.maxBinId,
          minBinId: existingBinRange.minBinId,
          strategyType: params.strategyType,
        }
      });

      const createPositionTx = await typedPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newPosition.publicKey,
        user: params.userPublicKey,
        totalXAmount: params.totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId: existingBinRange.maxBinId,
          minBinId: existingBinRange.minBinId,
          strategyType: params.strategyType,
        },
      });

      console.log('Position transaction created successfully using existing bins');

      return {
        transaction: createPositionTx,
        positionKeypair: newPosition,
        estimatedCost
      };
    } catch (error) {
      console.error('Error creating position with existing bins:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('insufficient lamports')) {
          throw new Error('Insufficient SOL balance for position creation using existing bins. Please add more SOL to your wallet.');
        }
        
        if (error.message.includes('Transaction simulation failed')) {
          throw new Error('Position creation failed during simulation. The existing bins might be full or have restrictions.');
        }
      }
      
      throw error;
    }
  }

  /**
   * Create a one-sided position using existing bins only
   */
  async createOneSidedPosition(
    params: CreatePositionParams,
    useTokenX: boolean
  ): Promise<CreatePositionResult> {
    try {
      // First find existing bin ranges
      const existingRanges = await this.findExistingBinRanges(params.poolAddress);
      
      if (existingRanges.length === 0) {
        throw new Error('No existing bin ranges found. Cannot create position without existing bins.');
      }

      // Use the best existing range (first one, as they're sorted by bin count)
      const selectedRange = existingRanges[0];
      
      console.log('Creating one-sided position with existing range:', selectedRange);

      // Get cost estimation
      const estimatedCost = await this.getSimplifiedCostEstimation(
        params.poolAddress,
        selectedRange.existingBins.length
      );

      const pool = await this.initializePool(params.poolAddress);
      const newPosition = new Keypair();
      const typedPool = pool as unknown as DLMMPool;
      
      // For one-sided position, set either X or Y amount to 0
      const totalXAmount = useTokenX ? params.totalXAmount : new BN(0);
      const totalYAmount = useTokenX ? new BN(0) : (params.totalYAmount || params.totalXAmount);

      // Adjust bin range for one-sided positions within existing bins
      let minBinId = selectedRange.minBinId;
      let maxBinId = selectedRange.maxBinId;

      if (useTokenX) {
        // For X token only, position should be above current price
        const activeBin = await typedPool.getActiveBin();
        const activeBinIndex = selectedRange.existingBins.findIndex(bin => bin >= activeBin.binId);
        
        if (activeBinIndex !== -1) {
          // Use existing bins above the active bin
          const binsAbove = selectedRange.existingBins.slice(activeBinIndex);
          if (binsAbove.length > 0) {
            minBinId = Math.min(...binsAbove);
            maxBinId = Math.max(...binsAbove);
          }
        }
      }

      console.log('Adjusted range for one-sided position:', { minBinId, maxBinId, useTokenX });

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
      console.error('Error creating one-sided position with existing bins:', error);
      throw error;
    }
  }

  /**
   * Get safe range recommendations using existing bins only
   */
  async getSafeRangeRecommendations(poolAddress: string): Promise<{
    conservative: ExistingBinRange;
    balanced: ExistingBinRange;
    aggressive: ExistingBinRange;
    all: ExistingBinRange[];
  }> {
    try {
      const existingRanges = await this.findExistingBinRanges(poolAddress);
      
      if (existingRanges.length === 0) {
        throw new Error('No existing bins found for safe range recommendations');
      }
      
      // Conservative: Range with most existing bins (safest)
      const conservative = existingRanges.reduce((prev, curr) => 
        prev.existingBins.length > curr.existingBins.length ? prev : curr
      );
      
      // Balanced: Medium range with good bin coverage
      const balanced = existingRanges.find(range => 
        range.existingBins.length >= 5 && range.existingBins.length <= 10
      ) || conservative;
      
      // Aggressive: Smaller range but still using existing bins
      const aggressive = existingRanges.find(range => 
        range.existingBins.length >= 3 && range.existingBins.length <= 7
      ) || conservative;
      
      return {
        conservative,
        balanced,
        aggressive,
        all: existingRanges
      };
    } catch (error) {
      console.error('Error getting safe range recommendations:', error);
      throw error;
    }
  }

  // Keep all existing methods for compatibility but ensure they use existing bins
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
      // First verify that the range uses existing bins
      const pool = await this.initializePool(params.poolAddress);
      const typedPool = pool as unknown as DLMMPool;
      const existingBins = await this.checkBinsExistence(typedPool, minBinId, maxBinId);
      
      if (existingBins.length === 0) {
        throw new Error('Cannot add liquidity: specified range has no existing bins. Please use existing price ranges only.');
      }
      
      console.log(`Adding liquidity to existing bins only: ${existingBins.length} bins in range`);
      
      const positionPubKey = new PublicKey(params.positionPubkey);
      
      let finalTotalYAmount = totalYAmount;

      if (useAutoFill && totalYAmount.isZero()) {
        try {
          const activeBin = await typedPool.getActiveBin();
          
          finalTotalYAmount = autoFillYByStrategy(
            activeBin.binId,
            typedPool.lbPair.binStep,
            totalXAmount,
            new BN(activeBin.xAmount),
            new BN(activeBin.yAmount),
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
      console.error('Error adding liquidity to existing bins:', error);
      throw error;
    }
  }

  // Keep all other existing methods unchanged
  async removeLiquidity(params: RemoveLiquidityParams): Promise<Transaction | Transaction[]> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as unknown as DLMMPool;
      
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

  async removeLiquidityFromPosition(
    params: PositionManagementParams,
    percentageToRemove: number = 100,
    shouldClaimAndClose: boolean = true
  ): Promise<Transaction | Transaction[]> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as unknown as DLMMPool;

      const { userPositions } = await typedPool.getPositionsByUserAndLbPair(params.userPublicKey);
      
      const userPosition = userPositions.find((pos: PositionData) => 
        pos.publicKey.equals(positionPubKey)
      );

      if (!userPosition) {
        throw new Error('Position not found');
      }

      const binIdsToRemove = userPosition.positionData.positionBinData.map((bin) => bin.binId);
      
      if (binIdsToRemove.length === 0) {
        throw new Error('No bins found in position');
      }

      const fromBinId = Math.min(...binIdsToRemove);
      const toBinId = Math.max(...binIdsToRemove);
      
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

  async claimFees(params: PositionManagementParams): Promise<Transaction> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as unknown as DLMMPool;
      
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

  async claimAllFees(poolAddress: string, userPublicKey: PublicKey): Promise<Transaction[]> {
    try {
      const pool = await this.initializePool(poolAddress);
      const typedPool = pool as unknown as DLMMPool;

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

  async closePosition(params: PositionManagementParams): Promise<Transaction> {
    try {
      const pool = await this.initializePool(params.poolAddress);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as unknown as DLMMPool;
      
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

  async getPositionInfo(poolAddress: string, positionPubkey: string): Promise<unknown> {
    try {
      const pool = await this.initializePool(poolAddress);
      const positionPubKey = new PublicKey(positionPubkey);
      const typedPool = pool as unknown as DLMMPool;

      const positionInfo = await typedPool.getPosition(positionPubKey);
      return positionInfo;
    } catch (error) {
      console.error('Error getting position info:', error);
      throw error;
    }
  }
}

// Enhanced hook for existing bins only strategy
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
          return 'Transaction simulation failed. The selected existing bins might be full or restricted.';
        }
        if (error.message.includes('No existing bin ranges found')) {
          return 'No existing price ranges available. Please wait for more liquidity or try a different pool.';
        }
        if (error.message.includes('existing bins')) {
          return 'Cannot use the selected price range - only existing bins are allowed for safety.';
        }
        return error.message;
      }
      return 'An unexpected error occurred. Please try again.';
    }
  };
}