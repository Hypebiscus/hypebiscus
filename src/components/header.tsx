"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import {Wallet, House, Lightning, List} from "@phosphor-icons/react"
import Link from "next/link";
import Image from "next/image";


// Dynamically import WalletMultiButton with ssr disabled
const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const Header = () => {
  // State to handle component mounting to avoid hydration issues
  const [mounted, setMounted] = useState(false);

  // Update mounted state after component mounts
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex justify-between items-center pt-4">
      <Image src="/hypebiscus_logo.png" alt="Hypebiscus" width={70} height={70} unoptimized/>
      <div className="flex items-center gap-4">
        <NavigationMenu className="lg:hidden block">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger className="flex items-center gap-2"><List /></NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="flex flex-col gap-y-4 p-2">
                  <li>
                    <NavigationMenuLink asChild>
                      <Link href="/">
                        <House className="text-primary"/> Home
                      </Link>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <Link href="/wallet">
                        <Wallet className="text-primary"/> Wallet
                      </Link>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <Link href="/bridge">
                        <Lightning className="text-primary"/> Bridge
                      </Link>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
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
    </div>
  );
};

export default Header;
