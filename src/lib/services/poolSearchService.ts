// src/lib/services/poolSearchService.ts

import { fetchPools } from '@/lib/api/pools';
import { fetchMessage } from '@/lib/api/chat';
import { 
  formatPool, 
  sortPoolsByStyle, 
  selectOptimalPool,
  ApiPool,
  FormattedPool 
} from '@/lib/utils/poolUtils';
import { useErrorHandler } from '@/lib/utils/errorHandling';

// Types
interface Group {
  name: string;
  pairs: ApiPool[];
  [key: string]: unknown;
}

export interface PoolSearchConfig {
  searchTerms: string[];
  allowedBinSteps: number[];
  minAPY: number;
  minFees: number;
}

export interface PoolSearchResult {
  pools: ApiPool[];
  searchTerm: string;
}

export interface PoolSearchParams {
  style: string | null;
  shownPoolAddresses: string[];
  onLoadingMessage: (message: string) => void;
  onError: (error: unknown) => void;
  handleAsyncError: <T>(operation: () => Promise<T>, context?: string) => Promise<T | null>;
}

export interface ProcessPoolParams {
  selectedPool: ApiPool;
  style: string | null;
  onStreamingUpdate: (chunk: string) => void;
  onComplete: (analysis: string, formattedPool: FormattedPool) => void;
  onError: (error: unknown) => void;
}

// Configuration constants
const POOL_SEARCH_CONFIG: PoolSearchConfig = {
  searchTerms: ["wbtc-sol", "zbtc-sol", "cbbtc-sol"],
  allowedBinSteps: [5, 10, 15, 50],
  minAPY: 0.03,
  minFees: 5,
};

const BROADER_SEARCH_TERMS = ["wbtc", "zbtc", "cbbtc"];

/**
 * Pool Search Service Class
 */
export class PoolSearchService {
  private config: PoolSearchConfig;

  constructor(config: PoolSearchConfig = POOL_SEARCH_CONFIG) {
    this.config = config;
  }

  /**
   * Fetches pools for a specific search term
   */
  private async fetchPoolsForTerm(
    searchTerm: string,
    handleAsyncError: <T>(operation: () => Promise<T>, context?: string) => Promise<T | null>
  ): Promise<PoolSearchResult> {
    try {
      const poolsData = await handleAsyncError(
        () => fetchPools(searchTerm),
        `Fetching ${searchTerm} pools`
      );

      const pools: ApiPool[] = [];
      
      if (poolsData && poolsData.groups && poolsData.groups.length > 0) {
        console.log(`Found ${poolsData.groups.length} groups for ${searchTerm}`);
        
        (poolsData.groups as Group[]).forEach((group) => {
          if (group.pairs?.length > 0) {
            const validPairs = this.filterValidPairs(group.pairs);
            pools.push(...validPairs);
          }
        });
      }
      
      return { pools, searchTerm };
    } catch (error) {
      console.error(`Error fetching pools for ${searchTerm}:`, error);
      return { pools: [], searchTerm };
    }
  }

  /**
   * Filters pairs based on validation criteria
   */
  private filterValidPairs(pairs: ApiPool[]): ApiPool[] {
    return pairs.filter((pair) => {
      const name = pair.name.toLowerCase();
      const binStep = pair.bin_step || 0;

      const isValidPair =
        (name === "wbtc-sol" || name === "zbtc-sol" || name === "cbbtc-sol") &&
        !name.includes("jito") &&
        this.config.allowedBinSteps.includes(binStep);

      if (isValidPair) {
        console.log(`Found valid pair: ${pair.name} with bin step: ${binStep}`);
      }
      return isValidPair;
    });
  }

  /**
   * Removes duplicate pools based on name and bin step
   */
  private removeDuplicatePools(existingPools: ApiPool[], newPools: ApiPool[]): ApiPool[] {
    const validPools: ApiPool[] = [];
    
    for (const pair of newPools) {
      const isDuplicate = existingPools.some(
        (p) => p.name === pair.name && p.bin_step === pair.bin_step
      );

      if (!isDuplicate) {
        validPools.push(pair);
        console.log(`Added new pool: ${pair.name} with bin step: ${pair.bin_step || "unknown"}`);
      }
    }
    
    return validPools;
  }

  /**
   * Filters pools by quality metrics (APY and fees)
   */
  private filterPoolsByQuality(pools: ApiPool[]): ApiPool[] {
    return pools.filter((pool) => {
      const isLowAPY = pool.apy < this.config.minAPY;
      const isLowFees = pool.fees_24h < this.config.minFees;
      const shouldKeep = !isLowAPY && !isLowFees;

      if (!shouldKeep) {
        console.log(
          `Removing pool with low metrics: ${pool.name} (Bin Step: ${pool.bin_step}) - APY: ${pool.apy}%, 24h Fees: $${pool.fees_24h}`
        );
      }

      return shouldKeep;
    });
  }

  /**
   * Searches for pools using direct search terms
   */
  private async searchDirectTerms(
    handleAsyncError: <T>(operation: () => Promise<T>, context?: string) => Promise<T | null>
  ): Promise<ApiPool[]> {
    const allPools: ApiPool[] = [];
    
    console.log("Searching for specific BTC-SOL pairs with standard bin steps");
    
    for (const term of this.config.searchTerms) {
      const result = await this.fetchPoolsForTerm(term, handleAsyncError);
      const validPools = this.removeDuplicatePools(allPools, result.pools);
      allPools.push(...validPools);
    }
    
    return allPools;
  }

  /**
   * Searches for pools using broader search terms
   */
  private async searchBroaderTerms(
    existingPools: ApiPool[],
    handleAsyncError: <T>(operation: () => Promise<T>, context?: string) => Promise<T | null>
  ): Promise<ApiPool[]> {
    console.log(`Only found ${existingPools.length} pools with direct searches, trying broader search`);
    
    const additionalPools: ApiPool[] = [];
    
    for (const term of BROADER_SEARCH_TERMS) {
      const result = await this.fetchPoolsForTerm(term, handleAsyncError);
      const validPools = this.removeDuplicatePools([...existingPools, ...additionalPools], result.pools);
      additionalPools.push(...validPools);
      
      if (validPools.length > 0) {
        console.log(`Broader search found ${validPools.length} pairs for ${term}`);
      }
    }
    
    return additionalPools;
  }

  /**
   * Main pool search method
   */
  public async searchPools(params: PoolSearchParams): Promise<ApiPool[]> {
    const { onLoadingMessage, handleAsyncError } = params;
    
    // Display loading message
    onLoadingMessage(
      params.style
        ? `Finding the best ${params.style} Solana liquidity pools for you...`
        : "Finding the best Solana liquidity pools based on your request..."
    );

    // Add deliberate delay to show loading state
    await new Promise((resolve) => setTimeout(resolve, 3500));

    // Step 1: Direct search
    let allPools = await this.searchDirectTerms(handleAsyncError);
    
    // Step 2: Broader search if needed
    if (allPools.length < 6) {
      const additionalPools = await this.searchBroaderTerms(allPools, handleAsyncError);
      allPools.push(...additionalPools);
    }
    
    // Step 3: Quality filtering
    allPools = this.filterPoolsByQuality(allPools);
    
    console.log(`Total pools found after all searches and filtering: ${allPools.length}`);
    console.log("Pool bin steps found:", allPools.map((p) => `${p.name}: ${p.bin_step}`).join(", "));
    
    return allPools;
  }

  /**
   * Processes the selected pool with AI analysis
   */
  public async processSelectedPool(params: ProcessPoolParams): Promise<void> {
    const { selectedPool, style, onStreamingUpdate, onComplete, onError } = params;
    
    try {
      const formattedPool = formatPool(selectedPool, style || "conservative");
      
      // Get AI analysis with streaming updates
      const analysis = await fetchMessage(
        [],
        formattedPool,
        style || "conservative",
        onStreamingUpdate
      );
      
      onComplete(analysis, formattedPool);
      
    } catch (error) {
      console.error("Error getting AI analysis:", error);
      onError(error);
    }
  }

  /**
   * Gets the best pool from search results
   */
  public getBestPool(
    pools: ApiPool[],
    style: string | null,
    shownPoolAddresses: string[]
  ): ApiPool | null {
    if (pools.length === 0) return null;

    console.log("Top 3 sorted pools:", pools.slice(0, 3).map((p) => ({
      name: p.name,
      tvl: p.liquidity,
      apy: p.apy,
      binStep: p.bin_step || "unknown",
    })));

    // Sort and select optimal pool
    const sortedPools = sortPoolsByStyle(pools, style || 'conservative');
    return selectOptimalPool(sortedPools, style || 'conservative', shownPoolAddresses);
  }

  /**
   * Generates no pools found message
   */
  public getNoPoolsFoundMessage(): string {
    return `I searched specifically for zBTC, wBTC, and cbBTC liquidity pools paired with SOL on Solana but couldn't find any matching pools at the moment. This could be due to:
    1. API limitations or temporary unavailability
    2. These specific pools might not be indexed by our data provider
    3. The pools might exist but with different naming conventions
    You could try again in a few moments.`;
  }
}

/**
 * Hook to use the pool search service
 */
export function usePoolSearchService(config?: PoolSearchConfig) {
  const { handleAsyncError } = useErrorHandler();
  const service = new PoolSearchService(config);

  return {
    service,
    handleAsyncError
  };
}