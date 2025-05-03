import PageTemplate from "@/components/PageTemplate";
import News from "@/components/dashboard-components/News";
import ChatBox from "@/components/dashboard-components/ChatBox";

export default function Home() {
  return (
    <PageTemplate>
      <div className="flex">
        <div className="flex-1">
          <ChatBox />
        </div>
        <div className="min-w-[300px] max-w-sm flex-shrink-0 mr-[70px]">
          <News />
        </div>
      </div>
    </PageTemplate>
  );
}
