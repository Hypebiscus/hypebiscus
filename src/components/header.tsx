'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import WalletMultiButton with ssr disabled
const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
)

const Header = () => {
  // State to handle component mounting to avoid hydration issues
  const [mounted, setMounted] = useState(false)

  // Update mounted state after component mounts
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="flex justify-between items-center pt-10 px-[70px]">
      <h1 className="text-2xl font-bold">Hypebiscus</h1>
      {mounted && (
        <WalletMultiButton
          style={{
            backgroundColor: "var(--primary)",
            padding: "4px 16px",
            borderRadius: "12px",
            fontSize: "14px",
            fontFamily: "var(--font-sans)",
          }}
        />
      )}
    </div>
  );
};

export default Header;
