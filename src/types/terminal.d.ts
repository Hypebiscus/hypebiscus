// src/types/terminal.d.ts

export interface SwapResult {
  txid: string;
  inputAddress: string;
  outputAddress: string;
  inputAmount: number;
  outputAmount: number;
  otherAmountThreshold: number;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  [key: string]: unknown;
}

export interface SwapError {
  error: string;
  message?: string;
  code?: string | number;
  [key: string]: unknown;
}

export interface QuoteResponseMeta {
  quoteResponse?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FormProps {
  initialInputMint?: string;
  initialOutputMint?: string;
  initialAmount?: string;
  fixedInputMint?: boolean;
  fixedOutputMint?: boolean;
  fixedAmount?: boolean;
  [key: string]: unknown;
}

export interface PlatformFeeAndAccounts {
  feeBps: number;
  feeAccounts: Map<string, string>;
}

export interface IInit {
  displayMode: "modal" | "integrated" | "widget";
  integratedTargetId?: string;
  endpoint?: string;
  platformFeeAndAccounts?: PlatformFeeAndAccounts;
  formProps?: FormProps;
  enableWalletPassthrough?: boolean;
  onSuccess?: (params: { 
    txid: string; 
    swapResult: SwapResult;
    [key: string]: unknown;
  }) => void;
  onSwapError?: (params: { 
    error?: unknown; 
    quoteResponseMeta: unknown;
    [key: string]: unknown;
  }) => void;
  onFormUpdate?: (params: { 
    hasSwapError: boolean; 
    [key: string]: unknown;
  }) => void;
  onScreenUpdate?: (params: { 
    screen: string; 
    [key: string]: unknown;
  }) => void;
  autoConnect?: boolean;
  defaultExplorer?: "Solscan" | "Solana Explorer" | "SolanaFM" | "XRAY";
  strictTokenList?: boolean;
  maxAccounts?: number;
  [key: string]: unknown;
}

export interface Jupiter {
  init: (params: IInit) => void;
  resume: () => void;
  close: () => void;
  syncProps: (props: Partial<IInit>) => void;
  [key: string]: unknown;
}

declare global {
  interface Window {
    Jupiter?: Jupiter;
  }
}