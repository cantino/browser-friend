import React, { useEffect, useRef, useState } from "react"
// import * as t from 'io-ts'
import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"
import { sendToBackground } from "@plasmohq/messaging"
import ReactMarkdown from 'react-markdown'

import type { ChatMessage, RequestBody, ResponseBody } from "~background/messages/openai"
import { gptTruncate } from "~helpers/openaiChatApiHelpers";
import { encode as gptEncode } from "gptoken";

function nextTick(param: () => void) {
  setTimeout(() => {
    param();
  }, 0);
}

async function getCurrentTabUrl() {
  return new Promise<string>((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      resolve(tab.url);
    });
  });
}

// Reminder: Copy the following into the prompt when changed!
type RequestDOMStructureOverview = "RequestDOMStructureOverview"; // Receive the DOM from the current page
type RequestPageText = "RequestPageText" // Request the visible text of the current page
type Click = { cssSelector: string }; // To click on links, buttons, checkboxes, etc
type Fill = { cssSelector: string, text: string } // To fill in form fields
type Navigate = { url: string } // To navigate to a URL
type Search = { query: string }; // To search Google for a given query
type Calculate = { jsFormula: string } // To eval arbitrary JS in a sandbox, and return the result to the assistant (the user does not see it).
type Respond = { textToDisplay: string } // To display a response to the user
type AssistantResponse = {
  plan: string[];
  nextAction: {
    type: "RequestDOMStructureOverview" | "RequestPageText" | "Click" | "Fill" | "Navigate" | "Search" | "Calculate" | "Respond";
    params: RequestDOMStructureOverview | RequestPageText | Click | Fill | Navigate | Search | Calculate | Respond;
  }
};

function addReminders(messages: ChatMessage[]) {
  return messages;
  // return messages.map((message, index) => {
  //   if (index === messages.length - 1 && message.role === "user") {
  //     return { ...message, content: message.content + "\nPlease respond with only a AssistantResponse structure." };
  //   } else {
  //     return message;
  //   }
  // });
}

async function injectContext(messages: ChatMessage[]): Promise<ChatMessage[]> {
  let prompt = `
You are a helpful virtual assistant in a Chrome extension.

You're currently at the url: ${await getCurrentTabUrl()}

You have the following TypeScript types available to you:
type RequestDOMStructureOverview = "RequestDOMStructureOverview"; // Receive the DOM from the current page
type RequestPageText = "RequestPageText" // Request the visible text of the current page
type Click = { cssSelector: string }; // To click on links, buttons, checkboxes, etc
type Fill = { cssSelector: string, text: string } // To fill in form fields
type Navigate = { url: string } // To navigate to a URL
type Search = { query: string }; // To search Google for a given query
type Calculate = { jsFormula: string } // To eval arbitrary JS in a sandbox, and return the result to the assistant (the user does not see it).
type Respond = { textToDisplay: string } // To display a response to the user
type AssistantResponse = {
  plan: string[];
  nextAction: {
    type: "RequestDOMStructureOverview" | "RequestPageText" | "Click" | "Fill" | "Navigate" | "Search" | "Calculate" | "Respond";
    params: RequestDOMStructureOverview | RequestPageText | Click | Fill | Navigate | Search | Calculate | Respond;
  }
};

After every user message, respond with a single AssistantResponse structure. For example, here are some User messages and their first AssistantResponse:
"What time is it in France?" => { "plan": ["Determine current user time", "Compute current time in France", "Inform the user"], "nextAction": { "type": "Calculate", "params": { "jsFormula": "new Date().toUTCString();" } } }
"Who is Sam Altman?" => { "plan": ["Search for Sam Altman", "Select best link", "Visit link", "Request page text", "Summarize and inform the user"], "nextAction": { "type": "Search", "params": { "query": "Sam Altman" } } }

Remember, ALL ASSISTANT RESPONSES SHOULD BE IN THE FORM OF A SINGLE AssistantResponse OBJECT AS JSON.`.trim();

  let secondPrompt = `
{
  "plan": ["Greet the user and wait for instructions", "Make a new plan"],
  "nextAction": {
    "type": "Respond",
    "params": { "textToDisplay": "Hello! How can I help you?" }
  }
}`.trim();

  return [{ role: "system", content: prompt }, { role: "assistant", content: secondPrompt}, ...gptTruncate(addReminders(messages), gptEncode(`${prompt} ${secondPrompt}`).length + 100)];
}

function renderMessage(msg: ChatMessage) {
  if (msg.role === "system") {
    try {
      return <div
        style={{
          padding: "6px 12px",
          borderRadius: "12px",
          backgroundColor: "#f0f0f0",
          display: "inline-block",
        }}
      >
        <i>{`= ${JSON.parse(msg.content).result}`}</i>
      </div>;
    } catch (e) {
      return <div>{`(${msg.content})`}</div>
    }
  } else if (msg.role === "assistant") {
    let response = assistantResponseFromString(msg.content);
    switch (response && response.nextAction.type) {
      case "Respond":
        return <ReactMarkdown skipHtml={true}>{`**Bot**: ${(response && response.nextAction.params as Respond).textToDisplay}`}</ReactMarkdown>;
      default:
        return <div>{`Bot action: ${msg.content}`}</div>;
    }
  } else {
    return <ReactMarkdown skipHtml={true}>{`**User**: ${msg.content}`}</ReactMarkdown>
  }
}

const assistantResponseFromString = (responseString: string): false | AssistantResponse => {
  if (responseString.startsWith("{")) {
    try {
      return JSON.parse(responseString) as AssistantResponse;
    } catch (e) {
      return false;
    }
  } else {
    return false;
  }
};

function IndexPopup() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const [openaiKey] = useStorage<string>("openai-key");
  const [message, setMessage] = useState("");
  const [storage] = useState(() => {
    return new Storage({
      area: "local"
    });
  });
  const [chatLog, setChatLog] = useStorage<Array<ChatMessage>>({ key: "chat-log", instance: storage }, []);

  // Scroll to the bottom of that chat window whenever the chatLog updates.
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatLog]);

  const handleAssistantResponse = async (response: AssistantResponse, callback: (msg: ChatMessage) => void) => {
    // If nextAction is a Calculate, we need to send a message to the background script to eval the JS.
    if (response.nextAction.type === "Calculate") {
      await handleCalculate(response.nextAction.params as Calculate, iframeRef, callback);
      // } else if (response.nextAction.type === "Respond") {
    }
  }

  async function handleCalculate(params: Calculate, iframeRef: React.MutableRefObject<HTMLIFrameElement>, callback: (msg: ChatMessage) => void) {
    let listener = (event) => {
      if ("calculationResult" in event.data) {
        window.removeEventListener("message", listener);
        callback({ role: "system", content: JSON.stringify({ result: event.data.calculationResult }) });
      } else {
        alert(`Invalid message from iframe: ${event.data}`);
      }
    };
    window.addEventListener("message", listener);
    iframeRef.current.contentWindow.postMessage(params.jsFormula, "*")
  }

  async function sendToBot(chatLog: ChatMessage[]) {
    const resp = await sendToBackground<RequestBody, ResponseBody>({
      name: "openai",
      body: {
        messages: await injectContext(chatLog),
      }
    });

    let assistantResponse = assistantResponseFromString(resp.message);
    if (assistantResponse !== false) {
      await setChatLog([...chatLog, { role: "assistant", content: resp.message }]);
      let callback = async (msg: ChatMessage) => {
        await setChatLog([...chatLog, { role: "assistant", content: resp.message }, msg]);
        await sendToBot([...chatLog, { role: "assistant", content: resp.message }, msg]);
      };
      nextTick(() => handleAssistantResponse(assistantResponse && assistantResponse, callback));
    } else {
      await setChatLog([...chatLog, { role: "system", content: "Assistant provided an invalid AssistantResponse object." }]);
    }
  }

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
    if (message.trim() === "") return;
    setMessage("");
    await setChatLog([...chatLog, { role: "user", content: message }, { role: "assistant", content: '🤔' }]);
    nextTick(() => sendToBot([...chatLog, { role: "user", content: message }]));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: 16, minWidth: 400, minHeight: 400 }}>
      <h2 style={{ marginBottom: 16 }}>Browser Friend</h2>
      <div
        ref={chatWindowRef}
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
          <div key={`${JSON.stringify(msg)}-${idx}`} style={{ marginBottom: "14px", position: "relative" }}>
            {renderMessage(msg)}
            {!(msg.role === "assistant" && msg.content === '🤔') && (
              <span
                onClick={async () => {
                  const newChatLog = [...chatLog];
                  newChatLog.splice(idx, 1);
                  await setChatLog(newChatLog);
                }}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: "bold",
                  padding: "2px 5px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(0, 0, 0, 0.1)",
                  color: "#fff",
                  paddingTop: "0px",
                }}
              >
              x
            </span>
            )}
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
      <iframe src="sandboxes/calculate.html" ref={iframeRef} style={{ display: "none" }} />
    </div>
  );
}

export default IndexPopup
