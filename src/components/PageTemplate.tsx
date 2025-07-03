import Header from "@/components/header";
import Menu from "@/components/menu";
import { ReactNode } from "react";

interface PageTemplateProps {
  children: ReactNode;
}

const PageTemplate = ({ children }: PageTemplateProps) => {
  return (
    <div className="relative lg:px-[70px] h-screen flex flex-col">
      <div className="absolute top-4 left-[15vw] w-[400px] h-[300px] opacity-30 lg:block hidden">
        <div className="absolute top-4 left-[15vw] w-[300px] h-[300px] rounded-full bg-primary blur-[90px]"></div>
      </div>
      <Header />
      <div className="absolute top-0 left-3 h-screen items-center lg:flex hidden">
        <Menu />
      </div>
      <div className="mt-8 flex-grow">
        {children}
      </div>
    </div>
    //     <div className="absolute top-4 left-[15vw] w-[300px] h-[300px] rounded-full bg-primary blur-[90px]"></div>
    //   </div>
    //   <Header />
    //   <div className="flex-1 flex relative mb-8">
    //       <div className="w-[80px] flex-shrink-0 absolute left-0 top-0 translate-y-1/2 ">
    //         <Menu />
    //       </div>
    //     <div className="flex-1 mt-14">
    //       {children}
    //     </div>
    //   </div>
    // </div>
  );
};

export default PageTemplate;
