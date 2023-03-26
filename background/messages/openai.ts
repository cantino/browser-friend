import type {PlasmoMessaging} from "@plasmohq/messaging"
import {Storage} from "@plasmohq/storage"
import {Configuration, OpenAIApi} from "openai";
import fetchAdapter from "@vespaiach/axios-fetch-adapter";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type RequestBody = {
  messages: ChatMessage[]
}

export type ResponseBody = {
  message: string
}

const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = async (req, res) => {
  const storage = new Storage()
  const apiKey = await storage.get("openai-key");
  const openai = new OpenAIApi(new Configuration({apiKey}));
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: req.body.messages,
  }, { adapter: fetchAdapter });

  // "choices": [{
  //   "index": 0,
  //   "message": {
  //     "role": "assistant",
  //     "content": "\n\nHello there, how may I assist you today?",
  //   },
  //   "finish_reason": "stop"
  // }],

  let message = completion.data.choices[0].message.content;

  res.send({
    message
  })
}

export default handler