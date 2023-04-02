import type {PlasmoMessaging} from "@plasmohq/messaging"
import {Storage} from "@plasmohq/storage"
import {Configuration, OpenAIApi} from "openai";
import fetchAdapter from "@vespaiach/axios-fetch-adapter";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type OpenaiRequestBody = {
  messages: ChatMessage[]
}

export type OpenaiResponseBody = {
  message?: string;
  error?: string;
}

const handler: PlasmoMessaging.MessageHandler<OpenaiRequestBody, OpenaiResponseBody> = async (req, res) => {
  const storage = new Storage()
  const apiKey = await storage.get("openai-key");
  const apiModel = await storage.get("openai-model") || "gpt-4";
  const openai = new OpenAIApi(new Configuration({apiKey}));

  console.log(JSON.stringify(req.body.messages, null, 2));

  try {
    const completion = await openai.createChatCompletion({
      model: apiModel,
      messages: req.body.messages,
    }, { adapter: fetchAdapter });

    let message = completion.data.choices[0].message.content.trim();

    console.log(message);

    res.send({
      message
    })
  } catch (e) {
    console.error(e);
    res.send({
      error: e.message
    })
  }
}

export default handler