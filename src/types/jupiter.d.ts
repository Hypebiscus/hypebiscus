// src/types/jupiter.d.ts
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
}

export interface SwapError {
  error: string;
  message?: string;
  code?: string | number;
}

export interface QuoteResponseMeta {
  quoteResponse?: unknown;
  [key: string]: unknown;
}

export interface FormProps {
  initialInputMint?: string;
  initialOutputMint?: string;
  initialAmount?: string;
  fixedInputMint?: boolean;
  fixedOutputMint?: boolean;
  fixedAmount?: boolean;
}

export interface IInit {
  displayMode: "modal" | "integrated" | "widget";
  integratedTargetId?: string;
  endpoint?: string;
  platformFeeAndAccounts?: {
    feeBps: number;
    feeAccounts: Map<string, string>;
  };
  formProps?: FormProps;
  enableWalletPassthrough?: boolean;
  onSuccess?: (params: { txid: string; swapResult: SwapResult }) => void;
  onSwapError?: (params: { error?: unknown; quoteResponseMeta: unknown }) => void;
  onFormUpdate?: (params: { hasSwapError: boolean; [key: string]: unknown }) => void;
  onScreenUpdate?: (params: { screen: string; [key: string]: unknown }) => void;
  autoConnect?: boolean;
  defaultExplorer?: "Solscan" | "Solana Explorer" | "SolanaFM" | "XRAY";
  strictTokenList?: boolean;
  maxAccounts?: number;
}

export interface Jupiter {
  init: (params: IInit) => void;
  resume: () => void;
  close: () => void;
  syncProps: (props: Partial<IInit>) => void;
}

declare global {
  interface Window {
    Jupiter?: Jupiter;
  }
}