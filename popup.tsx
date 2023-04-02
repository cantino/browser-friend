import React, { useEffect, useRef, useState } from "react"
// import * as t from 'io-ts'
import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"
import { sendToBackground } from "@plasmohq/messaging"
import ReactMarkdown from 'react-markdown'

import type { ChatMessage, OpenaiRequestBody, OpenaiResponseBody } from "~background/messages/openai"
import { gptTruncate } from "~helpers/openaiChatApiHelpers";
import { encode as gptEncode } from "gptoken";
import { sendToContentScript } from "~node_modules/@plasmohq/messaging";
import type { ContentRequestBody, ContentResponseBody } from "~contents/pageRequestHandler";

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
type RequestDOM = { cssSelector: string }; // Receive a summarized DOM for a selector. Use 'body' to start if you don't already know the region. Do this before using RequestText!
type RequestText = { cssSelector: string }; // Request the visible text inside of a page region
type GetSelection = "GetSelection"; // Request the user's currently highlighted text
type Fill = { cssSelector: string, text: string } // To fill in form fields
type Calculate = { jsFormula: string } // To eval arbitrary JS in a sandbox, and return the result to the assistant (the user does not see it).
type Respond = { textToDisplay: string } // To display a response to the user
type AssistantResponse = {
  plan: string[];
  nextAction: {
    type: "RequestDOM" | "RequestText" | "GetSelection" | "Fill" | "Calculate" | "Respond";
    params: RequestDOM | RequestText | GetSelection | Fill | Calculate | Respond;
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
You are a helpful virtual assistant in a browser extension. You have some tools that you can use to help your user, and
your job is to combine these tools to accomplish the user's goal.

You're currently at the url (the user may refer to it as 'this' or 'the page' or similar): ${await getCurrentTabUrl()}

You have the following TypeScript types available to you:
type RequestDOM = { cssSelector: string }; // Receive a summarized DOM for a selector. Use 'body' to start if you don't already know the region. Do this before using Fill or RequestText!
type RequestText = { cssSelector: string }; // Request the visible text inside of a page region
type GetSelection = "GetSelection"; // Request the user's currently highlighted text
type Fill = { cssSelector: string, text: string } // To fill in form fields
type Calculate = { jsFormula: string } // To eval arbitrary JS in a sandbox, and return the result to the assistant (the user does not see it).
type Respond = { textToDisplay: string } // To display a response to the user
type AssistantResponse = {
  plan: string[];
  nextAction: {
    type: "RequestDOM" | "RequestText" | "GetSelection" | "Fill" | "Calculate" | "Respond";
    params: RequestDOM | RequestText | GetSelection | Fill | Calculate | Respond;
  }
};

If you believe a goal is impossible, or if you find yourself encountering and error or looping, then just tell the user that you can't do it.
Remember to use RequestDOM on the body before generating cssSelectors: don't just guess CSS selectors!

After every user message, respond with a single AssistantResponse structure. For example, here are some User messages and their first AssistantResponse:
"What time is it in France?" => { "plan": ["Determine current user time", "Compute current time in France", "Inform the user"], "nextAction": { "type": "Calculate", "params": { "jsFormula": "new Date().toUTCString();" } } }
"Please put a relevant poem in the comment box" => { "plan": ["Request DOM overview", "Request text from likely main content region", "Write poem and insert into likely comment box", "Request page text", "Summarize and inform the user"], "nextAction": { "type": "RequestDOM", "params": { "cssSelector": "body" } } }

ALL YOUR RESPONSES FROM NOW ON MUST BE IN THE FORM OF A SINGLE AssistantResponse OBJECT AS JSON.`.trim();

  let secondPrompt = `
{
  "plan": ["Greet the user and wait for instructions", "Make a new plan"],
  "nextAction": {
    "type": "Respond",
    "params": { "textToDisplay": "Hello! How can I help you?" }
  }
}`.trim();

  return [{ role: "user", content: prompt }, { role: "assistant", content: secondPrompt}, ...gptTruncate(addReminders(messages), gptEncode(`${prompt} ${secondPrompt}`).length + 100)];
}

const renderParams = (nextAction) => {
  switch (nextAction.type) {
    case "RequestDOM":
    case "RequestText":
      return (
        <div style={{ fontFamily: "monospace" }}>
          {JSON.stringify(nextAction.params, null, 2)}
        </div>
      );
    case "Fill":
      return (
        <div style={{ fontFamily: "monospace" }}>
          {JSON.stringify(nextAction.params, null, 2)}
        </div>
      );
    case "Calculate":
      return (
        <code style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
          {nextAction.params.jsFormula}
        </code>
      );
    case "Respond":
      return <span>{nextAction.params.textToDisplay}</span>;
    case "GetSelection":
      return <span></span>;
    default:
      return null;
  }
};

const renderPlan = (plan) => {
  return (
    <div style={{ display: "flex", flexWrap: "wrap" }}>
      {plan.map((step, index) => (
        <div
          key={index}
          style={{
            backgroundColor: index === 0 ? "#00A7F7" : "rgba(0, 167, 247, 0.3)",
            color: index === 0 ? "#fff" : "#000",
            borderRadius: 4,
            padding: "2px 4px",
            marginRight: 4,
            marginBottom: 4,
          }}
        >
          {step}
        </div>
      ))}
    </div>
  );
};

function renderMessage(msg: ChatMessage) {
  function truncate(parsed) {
    let string = parsed.error || parsed.result || parsed.text || Object.entries(parsed).find(([key, _]) => key !== 'cssSelector')?.[1] || parsed;
    string = JSON.stringify(string);
    let max = 500;
    if (string.length > max) {
      return string.slice(0, max/2) + ' [...] ' + string.slice(-max/2);
    } else {
      return string;
    }
  }

  if (msg.role === "system") {
    try {
      let parsed = JSON.parse(msg.content);
      return <div
        style={{
          padding: "6px 12px",
          borderRadius: "12px",
          backgroundColor: "#f0f0f0",
          display: "inline-block",
        }}
      >
        <i>{`= ${(truncate(parsed))}`}</i>
      </div>;
    } catch (e) {
      return <div>{`${e.message} (${msg.content})`}</div>
    }
  } else if (msg.role === "assistant") {
    if (msg.content === '🤔') return <div>🤔</div>;
    let response = assistantResponseFromString(msg.content);
    if (!response) {
      return `Invalid AssistantResponse: ${msg.content}`;
    }

    if (response.nextAction.type === "Respond") {
      return (
        <ReactMarkdown skipHtml={true}>{`**Bot**: ${(response && response.nextAction.params as Respond).textToDisplay}`}</ReactMarkdown>
      );
    } else {
      return (
        <div
          style={{
            padding: "6px 6px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "6px" }}>{response.nextAction.type}:</div>
          <div style={{ marginBottom: "6px" }}>{renderParams(response.nextAction)}</div>
          <div style={{ fontWeight: "bold", marginBottom: "6px" }}>Plan:</div>
          <div style={{  }}>{renderPlan(response.plan)}</div>
        </div>
      );
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
  const inputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 250);
  }, []);

  const handleAssistantResponse = async (response: AssistantResponse, callback: (msg: ChatMessage) => void) => {
    if (response.nextAction.type === "Calculate") {
      await handleCalculate(response.nextAction.params as Calculate, iframeRef, callback);
    } else if (response.nextAction.type === "RequestDOM") {
      await handleRequestDOM(response.nextAction.params as RequestDOM, callback);
    } else if (response.nextAction.type === "RequestText") {
      await handleRequestText(response.nextAction.params as RequestText, callback);
    } else if (response.nextAction.type === "Fill") {
      await handleFill(response.nextAction.params as Fill, callback);
    } else if (response.nextAction.type === "GetSelection") {
      await handleGetSelection(response.nextAction.params as GetSelection, callback);
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

  async function handleFill(params: Fill, callback: (msg: ChatMessage) => void) {
    const resp = await sendToContentScript<ContentRequestBody, ContentResponseBody>({
      name: "pageRequestHandler",
      body: {
        action: "fill",
        params: { cssSelector: params.cssSelector, text: params.text },
      }
    });

    if (resp.result) {
      callback({ role: "system", content: JSON.stringify({ cssSelector: params.cssSelector, fillResult: resp.result }) });
    } else {
      callback({ role: "system", content: JSON.stringify({ cssSelector: params.cssSelector, fillError: resp.error }) });
    }
  }

  async function handleGetSelection(params: GetSelection, callback: (msg: ChatMessage) => void) {
    const resp = await sendToContentScript<ContentRequestBody, ContentResponseBody>({
      name: "pageRequestHandler",
      body: {
        action: "getSelection",
        params: {},
      }
    });

    if (resp.result !== undefined && resp.result !== null) {
      callback({ role: "system", content: JSON.stringify({ userSelection: resp.result }) });
    } else {
      callback({ role: "system", content: JSON.stringify({ fillError: resp.error }) });
    }
  }

  async function handleRequestDOM(params: RequestDOM, callback: (msg: ChatMessage) => void) {
    const resp = await sendToContentScript<ContentRequestBody, ContentResponseBody>({
      name: "pageRequestHandler",
      body: {
        action: "getDOM",
        params: { cssSelector: params.cssSelector },
      }
    });

    if (resp.result) {
      callback({ role: "system", content: JSON.stringify({ cssSelector: params.cssSelector, dom: JSON.parse(resp.result) }) });
    } else {
      callback({ role: "system", content: JSON.stringify({ cssSelector: params.cssSelector, error: resp.error }) });
    }
  }

  async function handleRequestText(params: RequestText, callback: (msg: ChatMessage) => void) {
    const resp = await sendToContentScript<ContentRequestBody, ContentResponseBody>({
      name: "pageRequestHandler",
      body: {
        action: "getText",
        params: { cssSelector: params.cssSelector },
      }
    });

    if (resp.result) {
      callback({ role: "system", content: JSON.stringify({ cssSelector: params.cssSelector, text: resp.result }) });
    } else {
      callback({ role: "system", content: JSON.stringify({ cssSelector: params.cssSelector, error: resp.error }) });
    }
  }

  async function sendToBot(chatLog: ChatMessage[]) {
    const resp = await sendToBackground<OpenaiRequestBody, OpenaiResponseBody>({
      name: "openai",
      body: {
        messages: await injectContext(chatLog),
      }
    });

    if (resp.message) {
      let assistantResponse = assistantResponseFromString(resp.message);
      if (assistantResponse !== false) {
        await setChatLog([...chatLog, { role: "assistant", content: resp.message }]);
        let callback = async (msg: ChatMessage) => {
          await setChatLog([...chatLog, { role: "assistant", content: resp.message }, msg]);
          await sendToBot([...chatLog, { role: "assistant", content: resp.message }, msg]);
        };
        nextTick(() => handleAssistantResponse(assistantResponse && assistantResponse, callback));
      } else {
        await setChatLog([...chatLog, { role: "system", content: `Assistant provided an invalid AssistantResponse object: ${resp.message}` }]);
      }
    } else {
      await setChatLog([...chatLog, { role: "system", content: `OpenAI error: ${resp.error}` }]);
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
    <div style={{ display: "flex", flexDirection: "column", padding: 16, minWidth: 400, minHeight: 500 }}>
      <h2 style={{ marginBottom: 16 }}>Browser Friend</h2>
      <div
        ref={chatWindowRef}
        style={{
          flexGrow: 0.9,
          maxHeight: 350,
          minHeight: 200,
          overflowY: "auto",
          marginBottom: 16,
          border: "1px solid #ccc",
          padding: 8,
          borderRadius: 4,
        }}
      >
        {chatLog.map((msg, idx) => (
          <div key={`${JSON.stringify(msg)}-${idx}`} style={{ marginBottom: "14px", position: "relative" }}>
            <div style={{ width: "92%" }}>
              {renderMessage(msg)}
            </div>
            {!(msg.role === "assistant" && msg.content === '🤔') && (
              <div>
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
                <span
                  onClick={async () => {
                    const newChatLog = [...chatLog];
                    if (idx + 1 < newChatLog.length) newChatLog.splice(idx + 1, newChatLog.length - (idx + 1));
                    await setChatLog([...newChatLog, { role: "assistant", content: '🤔' }]);
                    nextTick(() => sendToBot(newChatLog));
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    right: "20px",
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
                  r
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column" }}>
        <input
          ref={inputRef}
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
