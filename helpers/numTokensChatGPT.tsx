import { encode as gptEncode } from "gptoken";

import type { ChatMessage } from "~background/messages/openai"

// Translated by GPT4 from https://platform.openai.com/docs/guides/chat/introduction, assumes model gpt-3.5-turbo.
export function numTokensChatGPT(messages: Array<ChatMessage>): number {
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