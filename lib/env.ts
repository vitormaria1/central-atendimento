import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  PUBLIC_APP_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(16),
  AGENT_VANDERLEI_PIN: z.string().min(1),
  AGENT_GUSTAVO_PIN: z.string().min(1),
  UAZAPI_BASE_URL: z.string().url(),
  UAZAPI_INSTANCE_NAME: z.string().min(1),
  UAZAPI_TOKEN: z.string().min(1),
  UAZAPI_CHAT_FIND_PATH: z.string().optional(),
  UAZAPI_MESSAGE_FIND_PATH: z.string().optional(),
  UAZAPI_SEND_TEXT_PATH: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  FOCUS_BASE_URL: z.string().url().optional(),
  FOCUS_API_KEY: z.string().min(1).optional(),
  INTER_BASE_URL: z.string().url().optional(),
  INTER_CLIENT_ID: z.string().min(1).optional(),
  INTER_CLIENT_SECRET: z.string().min(1).optional(),
  INTER_CERTIFICATE_PATH: z.string().optional(),
  BILLING_NOTIFY_EMAIL_FROM: z.string().email().optional(),
  BILLING_NOTIFY_WHATSAPP_FROM: z.string().optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  GEMINI_FALLBACK_MODEL: z.string().min(1).optional(),
});

export function getEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
