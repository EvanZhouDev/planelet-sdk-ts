/// <reference types="bun" />

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { createPlugin, defineAction } from "planelet-sdk-ts";

const MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"] as const;

const modelParameter = {
  id: "model",
  label: "Model",
  type: "select" as const,
  default: "gemini-2.0-flash",
  options: MODELS.map((m) => ({ label: m, value: m })),
};

const plugin = createPlugin({
  id: "gemini-ai",
  label: "Gemini AI",
  icon: "sparkles",
  description: "Google Gemini text generation via the Vercel AI SDK.",
  actions: [
    defineAction({
      id: "generate-text",
      label: "Generate Text",
      description: "Generate text from a prompt using Google Gemini.",
      parameters: [
        {
          id: "prompt",
          label: "Prompt",
          type: "text",
          required: true,
        },
        {
          id: "systemMessage",
          label: "System Message",
          type: "text",
          required: false,
        },
        modelParameter,
      ],
      execute: async ({ parameters }) => {
        const model = parameters.model ?? "gemini-2.0-flash";
        const prompt = parameters.prompt;

        if (typeof prompt !== "string" || prompt.trim() === "") {
          return { success: false, error: "prompt is required" };
        }

        const system =
          typeof parameters.systemMessage === "string" &&
          parameters.systemMessage.trim() !== ""
            ? parameters.systemMessage.trim()
            : undefined;

        const { text, usage } = await generateText({
          model: google(model as string),
          prompt: prompt.trim(),
          ...(system ? { system } : {}),
        });

        return {
          success: true,
          data: { text, model, usage },
        };
      },
    }),
    defineAction({
      id: "summarize",
      label: "Summarize",
      description: "Summarize text using Google Gemini.",
      parameters: [
        {
          id: "text",
          label: "Text",
          type: "text",
          required: true,
        },
        modelParameter,
      ],
      execute: async ({ parameters }) => {
        const model = parameters.model ?? "gemini-2.0-flash";
        const text = parameters.text;

        if (typeof text !== "string" || text.trim() === "") {
          return { success: false, error: "text is required" };
        }

        const { text: summary, usage } = await generateText({
          model: google(model as string),
          system: "You are a concise summarizer. Provide a clear, brief summary of the given text.",
          prompt: text.trim(),
        });

        return {
          success: true,
          data: { summary, model, usage },
        };
      },
    }),
  ],
  triggers: [],
});

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  port,
  fetch: plugin.fetch,
});

console.log(`Gemini AI Planelet listening on http://127.0.0.1:${port}`);
