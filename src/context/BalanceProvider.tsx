// src/lib/services/balanceService.ts

import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TokenInfo } from '@solana/spl-token-registry';
import { TokenBalance, TokenPrices } from '@/lib/types';

interface BalanceCalculation {
  solBalance: number;
  tokenBalances: TokenBalance[];
  totalBalance: number;
}

interface RawTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: {
            uiAmount: number;
          };
        };
      };
    };
  };
}

/**
 * Service for managing wallet balance calculations
 */
export class BalanceService {
  private connection: Connection;

  constructor(rpcUrl?: string) {
    const defaultRpcUrl = `https://solana-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`;
    this.connection = new Connection(rpcUrl || defaultRpcUrl, 'confirmed');
  }

  /**
   * Fetch SOL balance for a wallet
   */
  async fetchSolBalance(publicKey: PublicKey): Promise<number> {
    try {
      const balanceLamports = await this.connection.getBalance(publicKey);
      return balanceLamports / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error fetching SOL balance:', error);
      throw new Error('Failed to fetch SOL balance');
    }
  }

  /**
   * Fetch token accounts for a wallet
   */
  async fetchTokenAccounts(publicKey: PublicKey): Promise<RawTokenAccount[]> {
    try {
      const response = await this.connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });
      return response.value;
    } catch (error) {
      console.error('Error fetching token accounts:', error);
      throw new Error('Failed to fetch token accounts');
    }
  }

  /**
   * Process raw token accounts into TokenBalance objects
   */
  processTokenAccounts(
    rawAccounts: RawTokenAccount[],
    tokens: TokenInfo[]
  ): TokenBalance[] {
    const validTokens: TokenBalance[] = [];

    for (const tokenAccountInfo of rawAccounts) {
      const accountData = tokenAccountInfo.account.data.parsed.info;
      const mintAddress = accountData.mint;
      const tokenBalance = accountData.tokenAmount.uiAmount;
      
      // Skip tokens with zero balance
      if (tokenBalance === 0) continue;

      const tokenInfo = tokens.find((t) => t.address === mintAddress);
      
      if (tokenInfo) {
        validTokens.push({
          tokenSymbol: tokenInfo.symbol,
          tokenBalance: parseFloat(tokenBalance.toFixed(5)),
          tokenLogoURI: "",
          tokenMint: mintAddress
        });
      } else {
        // For unknown tokens, use truncated mint address
        validTokens.push({
          tokenSymbol: `${mintAddress.slice(0, 6)}...`,
          tokenBalance: parseFloat(tokenBalance.toFixed(5)),
          tokenLogoURI: "",
          tokenMint: mintAddress
        });
      }
    }

    return validTokens;
  }

  /**
   * Calculate USD values for balances
   */
  calculateUsdValues(
    solBalance: number,
    tokenBalances: TokenBalance[],
    tokenPrices: TokenPrices
  ): { solUsdValue: number; tokenUsdValue: number; totalUsdValue: number } {
    // Calculate SOL value in USD
    const solUsdValue = solBalance * (tokenPrices.SOL || 0);
    
    // Calculate token values in USD
    const tokenUsdValue = tokenBalances.reduce((acc, token) => {
      const price = tokenPrices[token.tokenSymbol as keyof TokenPrices] || 0;
      return acc + (token.tokenBalance * price);
    }, 0);

    const totalUsdValue = solUsdValue + tokenUsdValue;

    return {
      solUsdValue,
      tokenUsdValue,
      totalUsdValue: parseFloat(totalUsdValue.toFixed(2))
    };
  }

  /**
   * Fetch and calculate all balances for a wallet
   */
  async fetchAllBalances(
    publicKey: PublicKey,
    tokens: TokenInfo[],
    tokenPrices: TokenPrices
  ): Promise<BalanceCalculation> {
    if (tokens.length === 0) {
      throw new Error('Token list not available');
    }

    try {
      // Fetch balances in parallel
      const [solBalance, rawTokenAccounts] = await Promise.all([
        this.fetchSolBalance(publicKey),
        this.fetchTokenAccounts(publicKey)
      ]);

      console.log(`Found ${rawTokenAccounts.length} token accounts`);

      // Process token accounts
      const tokenBalances = this.processTokenAccounts(rawTokenAccounts, tokens);
      console.log(`Valid token balances: ${tokenBalances.length}`);

      // Calculate USD values
      const { totalUsdValue } = this.calculateUsdValues(
        solBalance,
        tokenBalances,
        tokenPrices
      );

      // Log individual calculations for debugging
      this.logBalanceDetails(solBalance, tokenBalances, tokenPrices, totalUsdValue);

      return {
        solBalance: parseFloat(solBalance.toFixed(5)),
        tokenBalances,
        totalBalance: totalUsdValue
      };
    } catch (error) {
      console.error('Error in fetchAllBalances:', error);
      throw error;
    }
  }

  /**
   * Log balance details for debugging
   */
  private logBalanceDetails(
    solBalance: number,
    tokenBalances: TokenBalance[],
    tokenPrices: TokenPrices,
    totalUsdValue: number
  ): void {
    console.log('=== Balance Calculation Details ===');
    console.log(`SOL Balance: ${solBalance}`);
    console.log(`SOL Price: $${tokenPrices.SOL}`);
    console.log(`SOL USD Value: $${(solBalance * (tokenPrices.SOL || 0)).toFixed(2)}`);
    
    tokenBalances.forEach(token => {
      const price = tokenPrices[token.tokenSymbol as keyof TokenPrices] || 0;
      const usdValue = token.tokenBalance * price;
      console.log(`${token.tokenSymbol}: ${token.tokenBalance} × $${price} = $${usdValue.toFixed(2)}`);
    });
    
    console.log(`Total Portfolio Value: $${totalUsdValue}`);
    console.log('=====================================');
  }

  /**
   * Create a balance service instance with default configuration
   */
  static createDefault(): BalanceService {
    return new BalanceService();
  }
}

// Hook factory for creating balance service
export function createBalanceService(rpcUrl?: string): BalanceService {
  return new BalanceService(rpcUrl);
}