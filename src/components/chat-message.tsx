"use client";

import React from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === "user";

  // Format message content with line breaks
  const formattedContent = message.content.split("\n").map((line, i) => (
    <React.Fragment key={i}>
      {line}
      {i < message.content.split("\n").length - 1 && <br />}
    </React.Fragment>
  ));

  return (
    <div className={`flex ${isUser ? "justify-end [&:not(:first-child)]:mt-8" : "justify-start"}`}>
      <div
        className={`max-w-full  ${
          isUser
            ? "bg-white/10 border border-border text-white text-right rounded-full py-2 px-4"
            : "pt-8"
        }`}
      >
        <div className="text-sm">{formattedContent}</div>
      </div>
    </div>
  );
};

export default ChatMessage; 