import { useState } from "react"
import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"
import { sendToBackground } from "@plasmohq/messaging"
import ReactMarkdown from 'react-markdown'

import type { ChatMessage, RequestBody, ResponseBody } from "~background/messages/openai"
import { numTokensChatGPT } from "~helpers/numTokensChatGPT";

// Return the last N messages while numTokensChatGPT is less than 4096 times a fudge factor.
function gptTruncate(messages: ChatMessage[]) {
  let numTokens = 0;
  let i = messages.length - 1;
  while (i >= 0) {
    let tokens = numTokensChatGPT([messages[i]]);
    if (numTokens + tokens > 4096 * 0.9) {
      break;
    }
    i--;
  }
  return messages.slice(i + 1);
}

function IndexPopup() {
  const [openaiKey] = useStorage<string>("openai-key");
  const [message, setMessage] = useState("");
  const [storage] = useState(() => {
    return new Storage({
      area: "local"
    });
  });
  const [chatLog, setChatLog] = useStorage<Array<ChatMessage>>({ key: "chat-log", instance: storage }, []);

  const sendMessage = async () => {
    let m = message;
    setMessage("");
    await setChatLog([...chatLog, { role: "user", content: m }, { role: "assistant", content: '🤔' }]);
    let messages = gptTruncate([...chatLog, { role: "user", content: m }]);
    const resp = await sendToBackground<RequestBody, ResponseBody>({
      name: "openai",
      body: {
        messages: messages,
      }
    });
    await setChatLog([...chatLog, { role: "user", content: m }, { role: "assistant", content: resp.message }]);
  };

  if (!openaiKey) {
    return (
      <div style={{ display: "flex", flexDirection: "column", padding: 16 }}>
        <h2>Browser Friend</h2>
        <p>
          You need to set your OpenAI API key. Right click and go to Options.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    await sendMessage();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: 16, minWidth: 400, minHeight: 400 }}>
      <h2 style={{ marginBottom: 16 }}>Browser Friend</h2>
      <div
        style={{
          flexGrow: 1,
          maxHeight: 280,
          overflowY: "auto",
          marginBottom: 16,
          border: "1px solid #ccc",
          padding: 8,
          borderRadius: 4,
        }}
      >
        {chatLog.map((msg, idx) => (
          <div key={idx} style={{ marginBottom: "14px" }}>
            <ReactMarkdown
              skipHtml={true}>{`**${msg.role === "user" ? "User" : "Bot"}**: ${msg.content}`}</ReactMarkdown>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column" }}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ marginBottom: 8, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: "#ccc" }}
        />
      </form>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 8,
        }}
      >
        <button onClick={() => setChatLog([])} style={{ padding: 8, borderRadius: 4, borderWidth: 1, borderColor: "#ccc" }}>
          Clear
        </button>
      </div>
    </div>
  );
}

export default IndexPopup
