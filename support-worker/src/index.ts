// Сервер-посредник чата поддержки «Сезам eSIM» (Cloudflare Worker).
// Хранит ключи API на сервере, вызывает Claude или OpenAI и передаёт диалоги сотруднику в Telegram.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { HANDOFF_TOOL, PAGE_CONTEXT, SYSTEM_BASE } from "./prompt";

export interface Env {
  AI_PROVIDER: "anthropic" | "openai";
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

type ChatMessage = { role: "user" | "assistant"; content: string };
type Handoff = { reason: string; summary: string; customer_contact: string; customer_language: string };

const MAX_MESSAGES = 30;
const MAX_CHARS = 2000;
const MAX_TOOL_ROUNDS = 3;

const FALLBACK_REPLY: Record<string, string> = {
  ru: "Не получилось ответить прямо сейчас. Напишите, пожалуйста, нам в Telegram — сотрудник поможет.",
  en: "I couldn't answer right now. Please message us on Telegram — a team member will help.",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!cors["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, cors);
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/chat") return json({ error: "not_found" }, 404, cors);

    if (env.RATE_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return json({ error: "rate_limited" }, 429, cors);
    }

    let body: { messages?: unknown; page?: unknown; lang?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad_json" }, 400, cors);
    }
    const messages = sanitize(body.messages);
    if (!messages) return json({ error: "bad_messages" }, 400, cors);
    const page = typeof body.page === "string" && body.page in PAGE_CONTEXT ? body.page : "main";
    const lang = body.lang === "en" ? "en" : "ru";

    const handoffs: Handoff[] = [];
    const doHandoff = async (h: Handoff) => {
      handoffs.push(h);
      return sendToTelegram(env, h, messages, page);
    };

    try {
      const reply = env.AI_PROVIDER === "openai"
        ? await askOpenAI(env, messages, page, doHandoff)
        : await askClaude(env, messages, page, doHandoff);
      return json({ reply: reply || FALLBACK_REPLY[lang], handoff: handoffs.length > 0 }, 200, cors);
    } catch (err) {
      console.error("chat_failed", err);
      return json({ reply: FALLBACK_REPLY[lang], handoff: false, error: "upstream_failed" }, 200, cors);
    }
  },
};

/* ── Claude ─────────────────────────────────────────────── */
async function askClaude(env: Env, history: ChatMessage[], page: string, handoff: (h: Handoff) => Promise<string>) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const tools: Anthropic.Beta.BetaTool[] = [{ ...HANDOFF_TOOL, strict: true }];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      // при отказе по соображениям безопасности сервер сам повторит запрос на подходящей модели
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" }, // чат: быстрые короткие ответы
      system: [
        { type: "text", text: SYSTEM_BASE, cache_control: { type: "ephemeral" } },
        { type: "text", text: PAGE_CONTEXT[page] },
      ],
      tools,
      messages,
    });

    if (response.stop_reason === "refusal") return "";
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    }

    // ответ модели передаём обратно целиком (вместе с блоками размышлений), затем результаты инструментов
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const input = tu.input as Partial<Handoff>;
      const ok = tu.name === HANDOFF_TOOL.name && isHandoff(input);
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: ok ? await handoff(input as Handoff) : "Ошибка: неизвестный инструмент или неполные данные.",
        is_error: !ok,
      });
    }
    messages.push({ role: "user", content: results });
  }
  return "";
}

/* ── OpenAI ─────────────────────────────────────────────── */
async function askOpenAI(env: Env, history: ChatMessage[], page: string, handoff: (h: Handoff) => Promise<string>) {
  if (!env.OPENAI_MODEL) throw new Error("OPENAI_MODEL не задан в wrangler.toml");
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: `${SYSTEM_BASE}\n\n${PAGE_CONTEXT[page]}` },
    ...history.map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.ChatCompletionMessageParam),
  ];
  const tools: OpenAI.Chat.ChatCompletionTool[] = [{
    type: "function",
    function: { name: HANDOFF_TOOL.name, description: HANDOFF_TOOL.description, parameters: HANDOFF_TOOL.input_schema, strict: true },
  }];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({ model: env.OPENAI_MODEL, messages, tools });
    const msg = completion.choices[0]?.message;
    if (!msg) return "";
    const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
    if (calls.length === 0) return (msg.content ?? "").trim();

    messages.push(msg);
    for (const call of calls) {
      let input: Partial<Handoff> = {};
      try { input = JSON.parse(call.function.arguments); } catch { /* invalid JSON → ошибка ниже */ }
      const ok = call.function.name === HANDOFF_TOOL.name && isHandoff(input);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: ok ? await handoff(input as Handoff) : "Ошибка: неизвестный инструмент или неполные данные.",
      });
    }
  }
  return "";
}

/* ── Telegram ───────────────────────────────────────────── */
async function sendToTelegram(env: Env, h: Handoff, history: ChatMessage[], page: string): Promise<string> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn("handoff_without_telegram", h);
    return "Передача сотруднику не настроена. Попроси клиента написать в Telegram поддержки.";
  }
  const transcript = history.slice(-12).map((m) => `${m.role === "user" ? "👤 Клиент" : "🤖 Ассистент"}: ${m.content}`).join("\n\n");
  const text = [
    `🆘 Нужен сотрудник · ${h.reason}${page === "partners" ? " · бизнес" : ""}`,
    `Контакт: ${h.customer_contact} · язык: ${h.customer_language}`,
    `Суть: ${h.summary}`,
    "",
    "Переписка:",
    transcript,
  ].join("\n").slice(0, 4000);

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    console.error("telegram_failed", res.status, await res.text());
    return "Не удалось передать сотруднику. Попроси клиента написать в Telegram поддержки.";
  }
  return "Передано сотруднику. Он свяжется с клиентом по указанному контакту.";
}

/* ── helpers ────────────────────────────────────────────── */
function sanitize(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (content) out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift(); // история должна начинаться с клиента
  return out.length && out[out.length - 1].role === "user" ? out : null;
}

function isHandoff(x: Partial<Handoff>): x is Handoff {
  return ["reason", "summary", "customer_contact", "customer_language"].every(
    (k) => typeof x[k as keyof Handoff] === "string" && (x[k as keyof Handoff] as string).trim() !== "",
  );
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}
