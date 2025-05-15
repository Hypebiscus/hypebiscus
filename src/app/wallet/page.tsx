"use client";

import { useBalanceContext } from "@/hooks/useBalanceContext";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import { BalanceProvider } from "@/context/BalanceProvider";
import { TokenPrices } from "@/lib/types";
import PageTemplate from "@/components/PageTemplate";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";
import { useState, useEffect } from "react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  ResponsiveContainer, 
  ReferenceLine,
  Area,
  AreaChart,
  Tooltip
} from "recharts";
import { useTokenData } from "@/hooks/useTokenData";
import { Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

interface BalanceCardProps {
  tokenSymbol: string;
  tokenBalance: number;
  tokenLogoURI: string;
  tokenPrice: number;
  priceChange?: number; // Optional price change percentage
}

// Mock data generator for the chart
const generateMockData = (startPrice: number, volatility: number, dataPoints: number) => {
  const data = [];
  let currentPrice = startPrice;
  
  // Create a more volatile, realistic price chart
  for (let i = 0; i < dataPoints; i++) {
    // Random walk with higher volatility and slight downward trend
    const change = (Math.random() - 0.48) * volatility * 2; 
    currentPrice = Math.max(currentPrice + change, 0.01); // Ensure minimum price
    
    data.push({
      time: i,
      price: parseFloat(currentPrice.toFixed(6)),
    });
  }
  
  // Ensure start and end values are different
  if (data.length > 2 && Math.abs(data[0].price - data[data.length-1].price) < volatility) {
    data[data.length-1].price = data[0].price * (1 + (Math.random() - 0.5) * 0.2);
  }
  
  return data;
};

// Chart time periods
const timePeriods = ['1H', '1D', '1W', '1M', '1Y', 'Max'];

// Custom tooltip component
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    
    return (
      <div className="bg-black/80 border border-primary p-2 rounded-md shadow-lg">
        <p className="font-bold text-white text-xs">${value.toFixed(2)}</p>
      </div>
    );
  }
  return null;
};

// BalanceChart component
interface BalanceChartProps {
  currentValue?: number;
  priceChange?: number;
  changeAmount?: number;
  title?: string;
}

const BalanceChart = ({ 
  currentValue = 0.19, 
  priceChange = -16.1, 
  changeAmount = -0.03,
  title = "Total Balance"
}: BalanceChartProps) => {
  const [activeTimePeriod, setActiveTimePeriod] = useState('1H');
  
  // Generate more data points for longer time periods
  const getDataPointsForPeriod = (period: string) => {
    switch(period) {
      case '1H': return 60;
      case '1D': return 24;
      case '1W': return 7;
      case '1M': return 30;
      case '1Y': return 365;
      case 'Max': return 500;
      default: return 24;
    }
  };
  
  // Generate mock data based on the selected time period
  const data = generateMockData(
    currentValue, 
    currentValue * 0.01, // 1% volatility
    getDataPointsForPeriod(activeTimePeriod)
  );
  
  // Find min and max values for display
  const minValue = Math.min(...data.map(d => d.price));
  const maxValue = Math.max(...data.map(d => d.price));
  
  const isPositive = priceChange >= 0;
  
  return (
    <div className="bg-gradient-to-r from-red-900/30 to-red-800/20 border border-red-900/30 rounded-2xl p-4 w-full">
      <div className="mb-4">
        <div className="text-sm text-gray-400">{title}</div>
        <div className="text-4xl font-bold text-white">${currentValue.toFixed(2)}</div>
        <div className={`text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {isPositive ? '+' : ''}{priceChange.toFixed(6)}% (${changeAmount.toFixed(2)})
        </div>
      </div>
      
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FF3358" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#FF3358" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" hide />
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Tooltip 
              content={<CustomTooltip />} 
              cursor={{ stroke: '#FF3358', strokeWidth: 1, strokeDasharray: '3 3' }}
              isAnimationActive={false}
            />
            <Area 
              type="monotone" 
              dataKey="price" 
              stroke="#FF3358" 
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorPrice)"
              activeDot={{ 
                r: 5, 
                stroke: '#fff', 
                strokeWidth: 1, 
                fill: '#FF3358' 
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="flex mt-4 justify-around">
        {timePeriods.map(period => (
          <button
            key={period}
            className={`px-2 py-1 rounded-full text-xs ${
              activeTimePeriod === period 
                ? 'bg-primary text-white' 
                : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => setActiveTimePeriod(period)}
          >
            {period}
          </button>
        ))}
      </div>
      
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <div>${minValue.toFixed(2)}</div>
        <div>${maxValue.toFixed(2)}</div>
      </div>
    </div>
  );
};

export const BalanceCard = ({
  tokenSymbol,
  tokenBalance,
  tokenLogoURI,
  tokenPrice,
  priceChange,
}: BalanceCardProps) => {
  const valueInUSD = tokenBalance * tokenPrice;

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <Image src={tokenLogoURI} alt={tokenSymbol} width={24} height={24} />
        <span className="text-sm font-semibold text-white">{tokenSymbol}</span>
      </div>
      {/* {priceChange !== undefined && (
        <span
          className={`text-xs ${
            priceChange >= 0 ? "text-green-500" : "text-red-500"
          }`}
        >
          {priceChange >= 0 ? "+" : ""}
          {priceChange.toFixed(2)}%
        </span>
      )} */}
      <div className="flex flex-col justify-end items-end text-lg font-semibold text-white">
        ${valueInUSD < 0.01 ? valueInUSD.toFixed(6) : valueInUSD.toFixed(2)}
        <p className="text-xs font-light text-gray-400">
          {tokenBalance.toFixed(5)}
        </p>
      </div>
    </div>
  );
};

// Helper function to find gecko data for a token
const findGeckoDataForToken = (
  tokenSymbol: string, 
  tokenMint: string | undefined, 
  geckoData: Record<string, any>,
  tokens: any[]
): any => {
  // If we have a mint address, try to find it directly
  if (tokenMint && geckoData[tokenMint.toLowerCase()]) {
    return geckoData[tokenMint.toLowerCase()];
  }
  
  // For SOL, look for the wrapper address
  if (tokenSymbol === 'SOL') {
    const solAddress = "So11111111111111111111111111111111111111112".toLowerCase();
    return geckoData[solAddress];
  }
  
  // If we don't have a direct mint match, try to match by symbol
  const exactSymbolMatch = Object.values(geckoData).find(
    (data: any) => data.symbol?.toUpperCase() === tokenSymbol.toUpperCase()
  );
  
  if (exactSymbolMatch) {
    return exactSymbolMatch;
  }
  
  return null;
};

// Enhanced balance card with GeckoTerminal data
const EnhancedBalanceCard = ({
  tokenSymbol,
  tokenBalance,
  tokenLogoURI,
  tokenPrice,
  priceChange,
  geckoData,
  tokenMint,
  tokens
}: BalanceCardProps & { 
  geckoData: Record<string, any>,
  tokenMint?: string,
  tokens: any[]
}) => {
  // Try to find gecko data for this token
  const tokenGeckoData = findGeckoDataForToken(tokenSymbol, tokenMint, geckoData, tokens);
  
  // Use Gecko price if available, otherwise fall back to local price
  const geckoPrice = tokenGeckoData?.price_usd;
  const finalPrice = geckoPrice !== null && geckoPrice !== undefined ? geckoPrice : tokenPrice;
  
  // Use Gecko 24h change if available, otherwise fall back to mock data
  const geckoPriceChange = tokenGeckoData?.price_24h_change;
  const finalPriceChange = geckoPriceChange !== null && geckoPriceChange !== undefined 
    ? geckoPriceChange 
    : priceChange;
  
  // Use Gecko image only - don't fall back to local assets
  const geckoImageUrl = tokenGeckoData?.image;
  const hasImage = geckoImageUrl && geckoImageUrl.length > 0;
  
  const valueInUSD = tokenBalance * finalPrice;
  
  const isPositiveChange = finalPriceChange && finalPriceChange >= 0;
  
  return (
    <div className="flex items-center justify-between w-full py-2">
      <div className="flex items-center gap-2">
        {hasImage ? (
          <Image 
            src={geckoImageUrl} 
            alt={tokenSymbol} 
            width={24} 
            height={24} 
            className="rounded-full"
            unoptimized={true}
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center">
            <span className="text-xs text-white">{tokenSymbol.charAt(0)}</span>
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-white">
            {tokenGeckoData?.name || tokenSymbol}
          </span>
          <span className="text-xs text-gray-400">{tokenSymbol}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {finalPriceChange !== undefined && (
          <span className={`text-xs ${isPositiveChange ? 'text-green-500' : 'text-red-500'}`}>
            {isPositiveChange ? '+' : ''}{typeof finalPriceChange === 'number' ? finalPriceChange.toFixed(2) : finalPriceChange}%
          </span>
        )}
        <div className="flex flex-col justify-end items-end text-lg font-semibold text-white">
          ${valueInUSD < 0.01 ? valueInUSD.toFixed(6) : valueInUSD.toFixed(2)}
          <p className="text-xs font-light text-gray-400">
            {tokenBalance.toFixed(5)}
          </p>
        </div>
      </div>
    </div>
  );
};

const WalletContent = () => {
  const { publicKey, connected } = useWallet();
  const {
    tokenPrices,
    solBalance,
    tokenBalances,
    loading,
    totalBalance,
    refetchBalances,
  } = useBalanceContext();
  const tokens = useTokenData(); // Get all token data
  const [tokenMintAddresses, setTokenMintAddresses] = useState<string[]>([]);
  const [geckoData, setGeckoData] = useState<Record<string, any>>({});
  const [isGeckoLoading, setIsGeckoLoading] = useState(false);

  // Mock price change data - in a real app, you would fetch this from an API
  const priceChanges = {
    SOL: -4.13,
    USDT: 0.006,
    ZEUS: -3.64,
    L3: -6.0,
    BONK: -10.07,
  };
  
  // For total balance trends (just for demonstration)
  const [prevTotalBalance] = useState(0.22); // This would be stored/fetched in a real app
  const totalBalanceChange = totalBalance && prevTotalBalance 
    ? ((totalBalance - prevTotalBalance) / prevTotalBalance) * 100 
    : -13.64; // Default value for demo
  const totalBalanceChangeAmount = totalBalance && prevTotalBalance 
    ? totalBalance - prevTotalBalance 
    : -0.03; // Default value for demo

  // Fetch mint addresses directly from the connected wallet
  useEffect(() => {
    if (!loading && connected && publicKey) {
      const fetchMintAddresses = async () => {
        try {
          // Define our connection to the Solana network
          const connection = new Connection(`https://solana-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`, 'confirmed');
          
          // Get token accounts for the public key
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { programId: TOKEN_PROGRAM_ID }
          );
          
          console.log('==== FETCHED TOKEN ACCOUNTS ====');
          console.log('Number of token accounts:', tokenAccounts.value.length);
          
          // Extract mint addresses
          const addresses: string[] = [];
          
          // Create a map of symbol to mint address for later use
          const symbolToMintMap: Record<string, string> = {};
          
          // Add SOL address
          const solAddress = "So11111111111111111111111111111111111111112"; // Native SOL wrapper address
          addresses.push(solAddress);
          symbolToMintMap["SOL"] = solAddress;
          
          // Add other token mint addresses
          tokenAccounts.value.forEach(account => {
            const parsedInfo = account.account.data.parsed.info;
            const mintAddress = parsedInfo.mint;
            const balance = parsedInfo.tokenAmount.uiAmount;
            
            // Only add tokens with non-zero balance
            if (balance > 0) {
              console.log(`Found token with mint address: ${mintAddress}, balance: ${balance}`);
              addresses.push(mintAddress);
              
              // Try to find the symbol for this mint address
              const tokenInfo = tokens.find(t => t.address === mintAddress);
              if (tokenInfo?.symbol) {
                symbolToMintMap[tokenInfo.symbol] = mintAddress;
              }
            }
          });
          
          console.log('Collected mint addresses:', addresses);
          console.log('Symbol to mint address mapping:', symbolToMintMap);
          
          setTokenMintAddresses(addresses);
        } catch (error) {
          console.error('Error fetching token accounts:', error);
        }
      };
      
      fetchMintAddresses();
    }
  }, [publicKey, connected, loading, tokens]);
  
  // Fetch token data from GeckoTerminal when we have mint addresses
  useEffect(() => {
    if (tokenMintAddresses.length > 0) {
      const fetchTokenData = async () => {
        try {
          console.log('==== GECKOTERMINAL API DATA ====');
          console.log('Token mint addresses for multi-fetch:', tokenMintAddresses);
          console.log('Number of addresses:', tokenMintAddresses.length);
          
          setIsGeckoLoading(true);
          const data = await fetchGeckoTerminalMultiData(tokenMintAddresses);
          
          if (data?.data) {
            // Create a mapping of mint address to token data
            const addressToData: Record<string, any> = {};
            
            data.data.forEach((token: any) => {
              const attributes = token.attributes || {};
              const address = attributes.address;
              
              if (address) {
                addressToData[address.toLowerCase()] = {
                  id: token.id,
                  symbol: attributes.symbol,
                  name: attributes.name,
                  image: attributes.image_url,
                  price_usd: attributes.price_usd || null,
                  price_24h_change: attributes.price_24h_change || null
                };
              }
            });
            
            console.log('Processed GeckoTerminal data by address:', addressToData);
            setGeckoData(addressToData);
          }
        } catch (error) {
          console.error('Error fetching GeckoTerminal data:', error);
        } finally {
          setIsGeckoLoading(false);
        }
      };
      
      fetchTokenData();
    }
  }, [tokenMintAddresses]);

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
        <h2 className="text-2xl font-bold mb-4">Wallet Not Connected</h2>
        <p className="text-gray-400 mb-6">
          Please connect your wallet to view details
        </p>
      </div>
    );
  }

  if (loading) {
    return <p className="text-center p-4">Loading balances...</p>;
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Your Portfolio</h2>
          <Button
            onClick={refetchBalances}
            variant="destructive"
            className="bg-primary rounded-2xl"
            disabled={loading}
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
        
        <BalanceChart 
          currentValue={totalBalance || 0.19} 
          priceChange={totalBalanceChange}
          changeAmount={totalBalanceChangeAmount}
        />
        
        <h3 className="text-xl font-semibold my-4">Assets</h3>
        <div className="flex flex-col space-y-4 mb-6 border border-border rounded-2xl p-6 bg-[#161616]">
          {solBalance !== null && tokenPrices && (
            <EnhancedBalanceCard
              tokenSymbol="SOL"
              tokenBalance={solBalance}
              tokenLogoURI=""
              tokenPrice={tokenPrices.SOL}
              priceChange={priceChanges.SOL}
              geckoData={geckoData}
              tokenMint="So11111111111111111111111111111111111111112"
              tokens={tokens}
            />
          )}
          {tokenBalances.map((token, index) => (
            <EnhancedBalanceCard
              key={index}
              tokenSymbol={token.tokenSymbol}
              tokenBalance={token.tokenBalance}
              tokenLogoURI=""
              tokenPrice={
                tokenPrices?.[token.tokenSymbol as keyof typeof tokenPrices] || 0
              }
              priceChange={
                priceChanges[token.tokenSymbol as keyof typeof priceChanges]
              }
              geckoData={geckoData}
              tokenMint={token.tokenMint}
              tokens={tokens}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Initial token prices - more realistic values for mainnet
const initialPrices: TokenPrices = {
  SOL: 174.12, // Updated SOL price
  USDC: 1,
  USDT: 1,
  ETH: 3450,
  ZEUS: 0.28,
  L3: 0.06,
  BONK: 0.000021,
};

// Helper to fetch token data from GeckoTerminal API
const fetchGeckoTerminalData = async (tokenSymbol: string) => {
  try {
    // Base URL for GeckoTerminal API
    const baseUrl = 'https://api.geckoterminal.com/api/v2';
    
    // For demo purposes, we'll search for the token
    const searchUrl = `${baseUrl}/search?query=${tokenSymbol}&page=1&limit=10`;
    
    console.log(`Fetching GeckoTerminal data for token: ${tokenSymbol}`);
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    console.log(`GeckoTerminal search results for ${tokenSymbol}:`, data);
    
    // If we find the token in the search results, try to get more details
    if (data?.data?.length > 0) {
      // Look for a match in the results
      const matchingToken = data.data.find((item: any) => 
        item.attributes?.symbol?.toUpperCase() === tokenSymbol.toUpperCase()
      );
      
      if (matchingToken) {
        console.log(`Found matching token for ${tokenSymbol}:`, matchingToken);
        
        // If it's a token, we can try to get price data from a network
        if (matchingToken.type === 'token') {
          const tokenId = matchingToken.id;
          const tokenDetailsUrl = `${baseUrl}/tokens/${tokenId}`;
          
          const tokenResponse = await fetch(tokenDetailsUrl);
          const tokenData = await tokenResponse.json();
          
          console.log(`${tokenSymbol} details:`, tokenData);
          
          // Compare with our wallet data
          console.log(`Comparison for ${tokenSymbol}:`);
          console.log(`- GeckoTerminal image: ${tokenData?.data?.attributes?.image_url}`);
          console.log(`- GeckoTerminal name: ${tokenData?.data?.attributes?.name}`);
          
          // Try to get recent trades/price
          if (tokenData?.data?.relationships?.top_pools?.data?.[0]?.id) {
            const poolId = tokenData.data.relationships.top_pools.data[0].id;
            const poolUrl = `${baseUrl}/pools/${poolId}/ohlcv?aggregate=1&before_timestamp=${Date.now()}&limit=100&currency=usd`;
            
            const poolResponse = await fetch(poolUrl);
            const poolData = await poolResponse.json();
            
            console.log(`${tokenSymbol} price data:`, poolData);
          }
        }
      }
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching from GeckoTerminal:', error);
    return null;
  }
};

// Helper to fetch token data from GeckoTerminal API using multi-fetch endpoint
const fetchGeckoTerminalMultiData = async (tokenAddresses: string[]) => {
  try {
    if (tokenAddresses.length === 0) {
      console.log('No token addresses provided for GeckoTerminal multi-fetch');
      return null;
    }

    // Base URL for GeckoTerminal API
    const baseUrl = 'https://api.geckoterminal.com/api/v2';
    
    // Use the multi-fetch endpoint with comma-separated addresses
    const addressesString = tokenAddresses.join(',');
    const multiUrl = `${baseUrl}/networks/solana/tokens/multi/${addressesString}`;
    
    console.log('Fetching multiple tokens from GeckoTerminal:', multiUrl);
    
    const response = await fetch(multiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      mode: 'cors', // For CORS compatibility
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('GeckoTerminal multi-fetch results:', data);
    
    // Process the results for easy use
    if (data && data.data) {
      console.log('Tokens found:', data.data.length);
      
      // Create a more usable format for token data
      const processedTokens = data.data.map((token: any) => {
        const attributes = token.attributes || {};
        return {
          id: token.id,
          symbol: attributes.symbol,
          name: attributes.name,
          address: attributes.address,
          image: attributes.image_url,
          price_usd: attributes.price_usd || null,
          price_24h_change: attributes.price_24h_change || null
        };
      });
      
      console.log('Processed token data:', processedTokens);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching from GeckoTerminal multi-fetch:', error);
    return null;
  }
};

const Wallet = () => {
  return (
    <PageTemplate>
      <BalanceProvider initialPrices={initialPrices}>
        <WalletContent />
      </BalanceProvider>
    </PageTemplate>
  );
};

export default Wallet;
