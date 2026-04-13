export const GRIFFIN_API_URL = import.meta.env.VITE_GRIFFIN_API_URL || "http://localhost:3000";

export const HASHKEY_TESTNET = {
  id: 133,
  name: "HashKey Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hsk.xyz"] } },
} as const;

export const TOKENS = {
  tHSK:  { address: "0xb8F355f10569FD2A765296161d082Cc37c5843c2", symbol: "tHSK",  decimals: 18 },
  tUSDC: { address: "0xc4C2841367016C9e2652Fecc49bBA9229787bA82", symbol: "tUSDC", decimals: 6  },
};
