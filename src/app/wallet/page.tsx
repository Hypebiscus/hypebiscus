'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useState } from 'react'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import PageTemplate from '@/components/PageTemplate'

const Wallet = () => {
  const { publicKey, connected } = useWallet()
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)

  const getBalance = async (publicKey: PublicKey) => {
    try {
      setLoading(true)
      const connection = new Connection('https://api.devnet.solana.com')
      const balance = await connection.getBalance(publicKey)
      setBalance(balance / LAMPORTS_PER_SOL)
    } catch (error) {
      console.error('Error fetching balance:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (publicKey) {
      getBalance(publicKey)
    }
  }, [publicKey])

  const renderContent = () => {
    if (!connected) {
      return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
          <h2 className="text-2xl font-bold mb-4">Wallet Not Connected</h2>
          <p className="text-gray-400 mb-6">Please connect your wallet to view details</p>
        </div>
      )
    }

    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-secondary/30 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">Wallet Details</h2>
          <div className="grid gap-4">
            <div className="flex justify-between py-2 border-b border-gray-700">
              <span className="text-gray-400">Address</span>
              <span className="font-mono">{publicKey?.toString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-700">
              <span className="text-gray-400">Balance</span>
              <span>{loading ? 'Loading...' : `${balance.toFixed(4)} SOL`}</span>
            </div>
          </div>
          <Button 
            className="mt-6" 
            onClick={() => publicKey && getBalance(publicKey)}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh Balance'}
          </Button>
        </div>
      </div>
    )
  }

  return <PageTemplate>{renderContent()}</PageTemplate>
}

export default Wallet