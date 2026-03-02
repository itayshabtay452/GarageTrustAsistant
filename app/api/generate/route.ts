import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildMessages } from "../_lib/prompts";
import { isRateLimited } from "../_lib/rateLimit";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function getClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0].trim();
  }

  return null;
}

async function parseJsonBodyOrReturn(
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  try {
    return await request.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "גוף הבקשה חייב להיות JSON תקין");
  }
}

function buildConversationMessagesOrReturn(body: Record<string, unknown>):
  | {
      conversationMessages: Array<{
        role: "user" | "assistant";
        content: string;
      }>;
    }
  | NextResponse {
  const { message, messages } = body as {
    message?: unknown;
    messages?: unknown;
  };

  // בנה messages array - בדוק אם messages קיים ותקין
  let conversationMessages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  if (messages && Array.isArray(messages) && messages.length > 0) {
    // Validate each message in the array
    try {
      conversationMessages = (messages as unknown[]).map((msg: unknown) => {
        if (
          typeof msg !== "object" ||
          msg === null ||
          !("role" in msg) ||
          !("content" in msg)
        ) {
          throw new Error("Invalid message format");
        }

        const msgObj = msg as { role?: unknown; content?: unknown };
        if (
          typeof msgObj.role !== "string" ||
          (msgObj.role !== "user" && msgObj.role !== "assistant")
        ) {
          throw new Error("Role must be 'user' or 'assistant'");
        }

        if (typeof msgObj.content !== "string") {
          throw new Error("Content must be a string");
        }

        const trimmedContent = msgObj.content.trim();
        if (trimmedContent.length < 1 || trimmedContent.length > 4000) {
          throw new Error(
            "Each message content must be 1-4000 characters after trim",
          );
        }

        return {
          role: msgObj.role as "user" | "assistant",
          content: trimmedContent,
        };
      });

      // בדוק שיש לפחות הודעת user אחת
      if (!conversationMessages.some((msg) => msg.role === "user")) {
        throw new Error("Must have at least one user message");
      }
    } catch (validationError) {
      return errorResponse(
        400,
        "BAD_REQUEST",
        `Invalid messages format: ${validationError instanceof Error ? validationError.message : "unknown error"}`,
      );
    }
  } else if (message && typeof message === "string") {
    // Fallback: בנה מ-message יחיד
    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 3) {
      return errorResponse(
        400,
        "BAD_REQUEST",
        "ההודעה חייבת להיות לפחות 3 תווים",
      );
    }

    if (trimmedMessage.length > 4000) {
      return errorResponse(
        400,
        "BAD_REQUEST",
        "ההודעה לא יכולה להיות יותר מ-4000 תווים",
      );
    }

    conversationMessages = [{ role: "user", content: trimmedMessage }];
  } else {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "Must provide either 'message' (string) or 'messages' (array)",
    );
  }

  return { conversationMessages };
}

async function callOpenAiOrReturn(
  openai: OpenAI,
  conversationMessages: Array<{ role: "user" | "assistant"; content: string }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jsonSchema: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | NextResponse> {
  try {
    return await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: buildMessages(conversationMessages),
      temperature: 0.7,
      response_format: {
        type: "json_schema",
        json_schema: jsonSchema,
      },
    });
  } catch (openaiError) {
    console.error("[LOG] OpenAI API error:", openaiError);
    return errorResponse(
      502,
      "UPSTREAM_ERROR",
      "שירות ה-AI זמנית לא זמין. נסה שוב עוד מעט.",
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractResponseTextOrReturn(completion: any): string | NextResponse {
  const responseText = completion.choices[0]?.message?.content || "";
  if (!responseText) {
    console.error("[LOG] OpenAI returned empty response");
    return errorResponse(502, "UPSTREAM_ERROR", "התגובה מ-AI הייתה ריקה");
  }

  return responseText;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseModelJsonOrReturn(responseText: string): any | NextResponse {
  try {
    return JSON.parse(responseText);
  } catch (parseError) {
    console.error("[LOG] JSON parse error:", parseError);
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
  }
}

function validateParsedDataOrReturn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsedData: any,
  normalizedNextQuestion: string,
): NextResponse | null {
  // Validate required fields
  if (
    !parsedData.urgency_level ||
    !parsedData.reply_options ||
    !Array.isArray(parsedData.reply_options) ||
    parsedData.reply_options.length !== 3 ||
    typeof parsedData.should_ask_followup !== "boolean" ||
    typeof parsedData.next_question !== "string" ||
    typeof parsedData.should_end_call !== "boolean" ||
    !parsedData.summary ||
    typeof parsedData.summary !== "object" ||
    typeof parsedData.summary.recommended_call_response !== "string" ||
    !Array.isArray(parsedData.summary.key_points) ||
    !Array.isArray(parsedData.summary.do_not_say)
  ) {
    console.error("[LOG] Missing required fields in response");
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
  }

  const hasInvalidReplyOption = parsedData.reply_options.some(
    (option: unknown) =>
      typeof option !== "string" || option.trim().length === 0,
  );
  if (hasInvalidReplyOption) {
    console.error("[LOG] Invalid reply_options in response");
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
  }

  if (parsedData.should_ask_followup && normalizedNextQuestion.length === 0) {
    console.error("[LOG] Invalid followup: missing next_question");
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
  }
  if (!parsedData.should_ask_followup && normalizedNextQuestion !== "") {
    console.error("[LOG] Invalid followup: next_question must be empty");
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
  }
  if (parsedData.should_ask_followup && parsedData.should_end_call) {
    console.error("[LOG] Invalid state: followup and end_call both true");
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
  }
  const invalidSummaryItems =
    parsedData.summary.key_points.some(
      (point: unknown) =>
        typeof point !== "string" || point.trim().length === 0,
    ) ||
    parsedData.summary.do_not_say.some(
      (item: unknown) => typeof item !== "string" || item.trim().length === 0,
    );
  if (invalidSummaryItems) {
    console.error("[LOG] Invalid summary array items");
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
  }

  if (!parsedData.should_end_call) {
    const summaryMustBeEmpty =
      parsedData.summary.recommended_call_response === "" &&
      parsedData.summary.key_points.length === 0 &&
      parsedData.summary.do_not_say.length === 0;
    if (!summaryMustBeEmpty) {
      console.error(
        "[LOG] Invalid summary: must be empty when should_end_call=false",
      );
      return errorResponse(
        422,
        "MODEL_OUTPUT_INVALID",
        "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
      );
    }
  }

  if (parsedData.should_end_call) {
    const summaryMustBeFull =
      parsedData.summary.recommended_call_response.trim().length > 0 &&
      parsedData.summary.key_points.length >= 2 &&
      parsedData.summary.key_points.length <= 6 &&
      parsedData.summary.do_not_say.length >= 2 &&
      parsedData.summary.do_not_say.length <= 6;
    if (!summaryMustBeFull) {
      console.error(
        "[LOG] Invalid summary: must be full when should_end_call=true",
      );
      return errorResponse(
        422,
        "MODEL_OUTPUT_INVALID",
        "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
      );
    }
  }

  // Check Hebrew in response fields
  const hebrewRegex = /[\u0590-\u05FF]/;
  const noHebrewInOptions = parsedData.reply_options.some(
    (option: unknown) => !hebrewRegex.test(option as string),
  );
  if (noHebrewInOptions) {
    console.error("[LOG] No Hebrew detected in reply_options");
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID",
      "שירות ה-AI החזיר תשובה לא תקינה (לא בעברית). נסה שוב.",
    );
  }
  if (
    parsedData.should_ask_followup &&
    !hebrewRegex.test(normalizedNextQuestion)
  ) {
    console.error("[LOG] No Hebrew detected in next_question");
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
  }
  if (
    parsedData.should_end_call &&
    !hebrewRegex.test(parsedData.summary.recommended_call_response)
  ) {
    console.error(
      "[LOG] No Hebrew detected in summary.recommended_call_response",
    );
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    // זיהוי IP: x-forwarded-for (ראשון), אחרת 'local'
    let ip = "local";
    const clientIp = getClientIp(request);
    if (clientIp) {
      ip = clientIp;
    }

    // בדיקת rate limit
    if (isRateLimited(ip)) {
      return errorResponse(
        429,
        "RATE_LIMITED",
        "בוצעו יותר מדי בקשות בזמן קצר. נסה שוב בעוד כמה דקות.",
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return errorResponse(
        500,
        "MISSING_API_KEY",
        "מפתח API של OpenAI לא הוגדר",
      );
    }

    const openai = new OpenAI({ apiKey });

    const bodyOrResponse = await parseJsonBodyOrReturn(request);
    if (bodyOrResponse instanceof NextResponse) return bodyOrResponse;
    const body = bodyOrResponse;
    const convOrResponse = buildConversationMessagesOrReturn(body);
    if (convOrResponse instanceof NextResponse) return convOrResponse;
    const { conversationMessages } = convOrResponse;

    // Define JSON Schema for structured output
    const jsonSchema = {
      name: "garage_call_helper",
      strict: true,
      schema: {
        type: "object",
        properties: {
          urgency_level: {
            type: "string",
            enum: ["נמוך", "בינוני", "גבוה"],
          },
          reply_options: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 3,
          },
          should_ask_followup: { type: "boolean" },
          next_question: { type: "string" },
          should_end_call: { type: "boolean" },
          summary: {
            type: "object",
            properties: {
              recommended_call_response: { type: "string" },
              key_points: {
                type: "array",
                items: { type: "string" },
              },
              do_not_say: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["recommended_call_response", "key_points", "do_not_say"],
            additionalProperties: false,
          },
        },
        required: [
          "urgency_level",
          "reply_options",
          "should_ask_followup",
          "next_question",
          "should_end_call",
          "summary",
        ],
        additionalProperties: false,
      },
    };

    const completionOrResponse = await callOpenAiOrReturn(
      openai,
      conversationMessages,
      jsonSchema,
    );
    if (completionOrResponse instanceof NextResponse)
      return completionOrResponse;
    const completion = completionOrResponse;
    const responseTextOrResponse = extractResponseTextOrReturn(completion);
    if (responseTextOrResponse instanceof NextResponse)
      return responseTextOrResponse;
    const responseText = responseTextOrResponse;

    const parsedOrResponse = parseModelJsonOrReturn(responseText);
    if (parsedOrResponse instanceof NextResponse) return parsedOrResponse;
    const parsedData = parsedOrResponse;
    const normalizedNextQuestion = parsedData.next_question.trim();
    const validationResponse = validateParsedDataOrReturn(
      parsedData,
      normalizedNextQuestion,
    );
    if (validationResponse) return validationResponse;

    // Return success response in new structured format
    return NextResponse.json(
      {
        ok: true,
        data: {
          urgency_level: parsedData.urgency_level,
          reply_options: parsedData.reply_options,
          should_ask_followup: parsedData.should_ask_followup,
          next_question: normalizedNextQuestion,
          should_end_call: parsedData.should_end_call,
          summary: parsedData.summary,
        },
      },
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  } catch (error) {
    console.error("[LOG] Unexpected error in /api/generate:", error);
    return errorResponse(500, "INTERNAL_SERVER_ERROR", "שגיאה פנימית בשרת");
  }
}
