"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const News = () => {
  return (
    <div>
      <Card className="relative overflow-hidden">
        {/* Radial blur effect in top right corner */}
        <div className="absolute -top-4 -right-4 w-[300px] h-[200px] opacity-30 pointer-events-none">
          <div className="absolute -top-4 -right-4 w-[200px] h-[200px] rounded-full bg-primary blur-[60px]"></div>
        </div>

        <CardHeader>
          <CardTitle>News</CardTitle>
        </CardHeader>
        <CardDescription>
          <p>Read latest news about Bitcoin</p>
        </CardDescription>
        <CardContent className="flex flex-col gap-4">
          <p className="flex items-start text-white text-sm">
            <span className="text-primary bg-secondary rounded-sm p-2 w-5 h-5 flex items-center justify-center mr-3">
              1
            </span>
            Grayscale BTC Trust Transfers $911M Worth of BTC
            <span className="ml-2 text-sub-text text-nowrap">1 hour ago</span>
          </p>
          <p className="flex items-start text-white text-sm">
            <span className="text-primary bg-secondary rounded-sm p-2 w-5 h-5 flex items-center justify-center mr-3">
              2
            </span>
            El Salvador Committed to Buying Bitcoin Despite IMF Deal, Minister
            Says
            <span className="ml-2 text-sub-text text-nowrap">1 hour ago</span>
          </p>
          <p className="flex items-start text-white text-sm">
            <span className="text-primary bg-secondary rounded-sm p-2 w-5 h-5 flex items-center justify-center mr-3">
              3
            </span>
            Bitcoin Seoul 2025 to Host Global Industry Leaders for Asia&apos;s
            Largest Bitcoin-Focused Conference
            <span className="ml-2 text-sub-text text-nowrap">1 hour ago</span>
          </p>
          <p className="flex items-start text-white text-sm">
            <span className="text-primary bg-secondary rounded-sm p-2 w-5 h-5 flex items-center justify-center mr-3">
              4
            </span>
            Bitcoin ETFs Hit Eighth Day of Successive Gains With $173 Million
            Inflow
            <span className="ml-2 text-sub-text text-nowrap">1 hour ago</span>
          </p>
          <p className="flex items-start text-white text-sm">
            <span className="text-primary bg-secondary rounded-sm p-2 w-5 h-5 flex items-center justify-center mr-3">
              5
            </span>
            Bitcoin Price Watch: Consolidation Tightens—Is a Surge to $98K Next?
            <span className="ml-2 text-sub-text text-nowrap">1 hour ago</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default News;
