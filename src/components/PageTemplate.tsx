import Header from "@/components/header";
import Menu from "@/components/menu";
import { ReactNode } from "react";

interface PageTemplateProps {
  children: ReactNode;
}

const PageTemplate = ({ children }: PageTemplateProps) => {
  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="absolute top-4 left-[15vw] w-[400px] h-[300px] opacity-30 pointer-events-none">
        <div className="absolute top-4 left-[15vw] w-[300px] h-[300px] rounded-full bg-primary blur-[90px]"></div>
      </div>
      <Header />
      <div className="flex-1 flex relative mb-8">
          <div className="w-[80px] flex-shrink-0 max-h-full">
            <Menu />
          </div>
        <div className="flex-1 mt-14">
          {children}
        </div>
      </div>
    </div>
  );
};

export default PageTemplate; 