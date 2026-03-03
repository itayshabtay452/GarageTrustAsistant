import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildMessagesV2 } from "../_lib/prompts";
import { isRateLimited } from "../_lib/rateLimit";
import { validateV2Request } from "../_lib/validate";

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
    return errorResponse(400, "BAD_REQUEST", "גוף JSON לא תקין");
  }
}

async function callOpenAiOrReturn(
  openai: OpenAI,
  inputMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jsonSchema: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | NextResponse> {
  try {
    return await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: inputMessages,
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
    return errorResponse(
      422,
      "MODEL_OUTPUT_INVALID_V2",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
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
      "MODEL_OUTPUT_INVALID_V2",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );
  }
}

function validateParsedDataOrReturn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsedData: any,
): NextResponse | null {
  const modelInvalidResponse = () =>
    errorResponse(
      422,
      "MODEL_OUTPUT_INVALID_V2",
      "שירות ה-AI החזיר תשובה לא תקינה. נסה שוב.",
    );

  if (
    typeof parsedData !== "object" ||
    parsedData === null ||
    typeof parsedData.data !== "object" ||
    parsedData.data === null
  ) {
    console.error("[LOG] Missing v2 envelope fields in response");
    return modelInvalidResponse();
  }

  const data = parsedData.data;

  if (
    typeof data.urgency_level !== "string" ||
    data.urgency_level.length === 0
  ) {
    console.error("[LOG] Invalid urgency_level in response");
    return modelInvalidResponse();
  }

  if (!Array.isArray(data.reply_options) || data.reply_options.length !== 3) {
    console.error("[LOG] Invalid reply_options in response");
    return modelInvalidResponse();
  }

  const hasInvalidReplyOption = data.reply_options.some(
    (option: unknown) =>
      typeof option !== "string" || option.trim().length === 0,
  );
  if (hasInvalidReplyOption) {
    console.error("[LOG] Invalid reply_options in response");
    return modelInvalidResponse();
  }

  if (
    typeof data.confidence !== "number" ||
    data.confidence < 0 ||
    data.confidence > 100
  ) {
    console.error("[LOG] Invalid confidence in response");
    return modelInvalidResponse();
  }

  if (
    typeof data.should_ask_followup !== "boolean" ||
    typeof data.next_question !== "string" ||
    typeof data.should_end_call !== "boolean" ||
    typeof data.summary !== "object" ||
    data.summary === null ||
    typeof data.summary.recommended_call_response !== "string" ||
    !Array.isArray(data.summary.key_points) ||
    !Array.isArray(data.summary.do_not_say)
  ) {
    console.error("[LOG] Missing required v2 fields in response");
    return modelInvalidResponse();
  }

  if (!data.should_ask_followup && data.next_question !== "") {
    console.error("[LOG] Invalid followup: next_question must be empty");
    return modelInvalidResponse();
  }

  if (data.should_ask_followup) {
    const question = data.next_question;
    const questionMarksCount = (question.match(/\?/g) || []).length;
    if (
      question.length === 0 ||
      question.includes("\n") ||
      questionMarksCount !== 1 ||
      !question.endsWith("?")
    ) {
      console.error("[LOG] Invalid followup question format");
      return modelInvalidResponse();
    }
  }

  const invalidSummaryItems =
    data.summary.key_points.some(
      (point: unknown) =>
        typeof point !== "string" || point.trim().length === 0,
    ) ||
    data.summary.do_not_say.some(
      (item: unknown) => typeof item !== "string" || item.trim().length === 0,
    );
  if (invalidSummaryItems) {
    console.error("[LOG] Invalid summary array items");
    return modelInvalidResponse();
  }

  if (!data.should_end_call) {
    const summaryMustBeEmpty =
      data.summary.recommended_call_response === "" &&
      data.summary.key_points.length === 0 &&
      data.summary.do_not_say.length === 0;
    if (!summaryMustBeEmpty) {
      console.error(
        "[LOG] Invalid summary: must be empty when should_end_call=false",
      );
      return modelInvalidResponse();
    }
  }

  if (data.should_end_call) {
    const summaryHasContent =
      data.summary.recommended_call_response !== "" ||
      data.summary.key_points.length > 0 ||
      data.summary.do_not_say.length > 0;
    if (!summaryHasContent) {
      console.error("[LOG] Invalid summary: must not be empty");
      return modelInvalidResponse();
    }
  }

  return null;
}

function buildSuccessResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      data: {
        urgency_level: data.urgency_level,
        reply_options: data.reply_options,
        confidence: data.confidence,
        should_ask_followup: data.should_ask_followup,
        next_question: data.next_question,
        should_end_call: data.should_end_call,
        summary: data.summary,
      },
    },
    {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
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
    const validated = validateV2Request(body);
    if (!validated.ok) {
      return errorResponse(400, "BAD_REQUEST", validated.message);
    }
    const inputMessages = buildMessagesV2(validated.data);

    // Define JSON Schema for structured output
    const jsonSchema = {
      name: "garage_call_helper",
      strict: true,
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          data: {
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
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 100,
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
                required: [
                  "recommended_call_response",
                  "key_points",
                  "do_not_say",
                ],
                additionalProperties: false,
              },
            },
            required: [
              "urgency_level",
              "reply_options",
              "confidence",
              "should_ask_followup",
              "next_question",
              "should_end_call",
              "summary",
            ],
            additionalProperties: false,
          },
        },
        required: ["ok", "data"],
        additionalProperties: false,
      },
    };

    const completionOrResponse = await callOpenAiOrReturn(
      openai,
      inputMessages,
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
    const validationResponse = validateParsedDataOrReturn(parsedData);
    if (validationResponse) return validationResponse;

    return buildSuccessResponse(parsedData.data);
  } catch (error) {
    console.error("[LOG] Unexpected error in /api/generate:", error);
    return errorResponse(500, "INTERNAL_SERVER_ERROR", "שגיאה פנימית בשרת");
  }
}
