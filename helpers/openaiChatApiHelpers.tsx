import { encode as gptEncode } from "gptoken";

import type { ChatMessage } from "~background/messages/openai"

// Translated by GPT4 from https://platform.openai.com/docs/guides/chat/introduction, assumes model gpt-3.5-turbo.
function numTokensChatGPT(messages: Array<ChatMessage>): number {
  let numTokens = 0;
  for (const message of messages) {
    numTokens += 4;
    for (const value of Object.values(message)) {
      numTokens += gptEncode(value).length;
      if ('name' in message) {
        numTokens -= 1;
      }
    }
  }
  numTokens += 2;
  return numTokens;
}

// Return the last N messages while numTokensChatGPT is less than 4096 minus a fudge factor.
export function gptTruncate(messages: ChatMessage[], margin: number = 600): ChatMessage[] {
  let numTokens = 0;
  let i = messages.length - 1;
  while (i >= 0) {
    let tokens = numTokensChatGPT([messages[i]]);
    if (numTokens + tokens > 4096 - margin) {
      break;
    }
    i--;
  }
  return messages.slice(i + 1);
}