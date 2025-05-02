import Header from "@/components/header";
import Menu from "@/components/menu";
import News from "@/components/dashboard-components/News";
import ChatBox from "@/components/dashboard-components/ChatBox";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="absolute top-4 left-[15vw] w-[400px] h-[300px] opacity-30 pointer-events-none">
        <div className="absolute top-4 left-[15vw] w-[300px] h-[300px] rounded-full bg-primary blur-[90px]"></div>
      </div>
      <Header />
      <div className="flex-1 flex relative">
        <div className="w-[80px] flex-shrink-0 max-h-full">
          <Menu />
        </div>
        <div className="flex-1 mt-14">
          <ChatBox />
        </div>
        <div className="min-w-[300px] max-w-sm flex-shrink-0 mt-14 mr-[70px]">
          <News />
        </div>
      </div>
    </div>
  );
}
