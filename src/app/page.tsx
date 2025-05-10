"use client";

import { useState } from "react";
import PageTemplate from "@/components/PageTemplate";
import News from "@/components/dashboard-components/News";
import ChatBox from "@/components/dashboard-components/ChatBox";
import { Button } from "@/components/ui/button";
import { Newspaper, X } from "lucide-react";

export default function Home() {
  const [showNewsOnMobile, setShowNewsOnMobile] = useState(false);

  return (
    <PageTemplate>
      <div className="relative h-full flex flex-col">
        <div className="flex justify-end mb-4 lg:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewsOnMobile(!showNewsOnMobile)}
            className="flex items-center gap-2"
          >
            {showNewsOnMobile ? <X size={16} /> : <Newspaper size={16} />}
            {showNewsOnMobile ? "Close News" : "Open News"}
          </Button>
        </div>

        <div className="w-full lg:h-full lg:flex justify-between  gap-4 relative flex-grow overflow-hidden">
          <div 
            className={`w-full h-full transition-all duration-300 ease-in-out ${
              showNewsOnMobile ? "opacity-0 translate-x-[-100%] absolute" : "opacity-100 translate-x-0"
            }`}
          >
            <ChatBox />
          </div>
          <div 
            className={`transition-all duration-300 ease-in-out ${
              showNewsOnMobile 
                ? "w-full opacity-100 translate-x-0" 
                : "min-w-[300px] max-w-sm lg:block opacity-0 translate-x-[100%] lg:opacity-100 lg:translate-x-0"
            }`}
          >
            <News />
          </div>
        </div>
      </div>
    </PageTemplate>
  );
}
