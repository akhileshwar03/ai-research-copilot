import MainLayout from "@/components/layout/main-layout";
import Sidebar from "@/components/sidebar/sidebar";
import ChatWindow from "@/components/chat/chat-window";

export default function Home() {
  return (
    <MainLayout sidebar={<Sidebar />}>
      <ChatWindow />
    </MainLayout>
  );
}