"use client"

import { Button } from "@/components/ui/button"
import {Wallet, House, Lightning} from "@phosphor-icons/react"
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const Menu = () => {
  const pathname = usePathname()
  const menuItems = [
    {
      label: "Home",
      icon: House,
      path: "/",
    },
    {
      label: "Wallet",
      icon: Wallet,
      path: "/wallet",
    },
    {
      label: "Bridge",
      icon: Lightning,
      path: "/bridge",
    },
  ]

  return (
    <div className="h-full flex flex-col justify-center items-center">
      <div className="bg-[#161616] rounded-full w-[48px] h-[184px] border-border flex flex-col justify-center items-center">
        <div className="flex flex-col gap-2">
          {menuItems.map((item, index) => {
            const isActive = pathname === item.path
            const Icon = item.icon

            return (
              <Link href={item.path} key={index}>
                <Button variant={isActive ? "default" : "ghost"} className={`relative rounded-2xl w-[32px] h-[32px] ${isActive ? 'bg-primary text-white' : 'hover:bg-primary/20 hover:text-white'}`} title={item.label}>
                  <Icon />
                </Button>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Menu