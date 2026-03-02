import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const SYSTEM_PROMPT_HE = `אתה כלי עזר דיגיטלי לנציג/ת שירות במוקד טלפוני של "מרכז שירות רן דיין".
תפקידך: לייצר תגובה מובנית בעברית בלבד עבור נציג השירות, על בסיס שאלת לקוח ופרטי רכב, באופן תומך דו-שיח.

המבנה הנדרש:
- urgency_level: "נמוך" (תחזוקה שגרתית), "בינוני" (צריך תשומת לב בקרוב), "גבוה" (בטיחות/תקלה חמורה/צריך להגיע מיד).
- reply_options: בדיוק 3 אפשרויות ניסוח שהנציג יכול לומר ללקוח, מסודרות מהטובה ביותר לפחות טובה.
- should_ask_followup: true/false.
- next_question: אם should_ask_followup=true, כתוב שאלה אחת קצרה וממוקדת שהנציג ישאל את הלקוח. אם should_ask_followup=false, החזר מחרוזת ריקה "".
- should_end_call: true/false.
- summary: תמיד החזר object עם:
  - recommended_call_response (string)
  - key_points (array של strings)
  - do_not_say (array של strings)

כללי החלטה:
- אם חסר מידע כדי לתת המלצה מעשית: should_ask_followup=true, next_question לא ריקה וממוקדת, should_end_call=false, ו-summary יהיה ריק: recommended_call_response="" וגם key_points=[] וגם do_not_say=[].
- אם יש מספיק מידע לסיום: should_ask_followup=false, next_question="", should_end_call=true, ו-summary מלא: recommended_call_response לא ריק, key_points באורך 2-6, do_not_say באורך 2-6.

חשוב: כל הטקסט בעברית בלבד, ללא אנגלית. טון מקצועי, בלי הבטחות מוגזמות.`;

export { SYSTEM_PROMPT_HE };

export const SYSTEM_PROMPT_HE_V2 = `אתה כלי עזר דיגיטלי לנציג/ת שירות במוקד טלפוני של "מרכז שירות רן דיין".
החזר JSON בלבד, ללא Markdown וללא טקסט חופשי מחוץ ל-JSON.
שפת הפלט: עברית בלבד.
הפלט חייב להתאים בדיוק למבנה v2: root עם ok ו-data.
בתוך data חייבים להופיע כל השדות הנדרשים לפי הסכמה שניתנה בזמן הריצה.
reply_options חייב להכיל בדיוק 3 אפשרויות.
confidence חייב להיות מספר בין 0 ל-100 כולל.
next_question: אם should_ask_followup=true אז חייבת להיות שאלה חדה אחת בדיוק, בשורה אחת, ללא ירידת שורה. אם should_ask_followup=false אז next_question חייב להיות "".
כלל summary:
- אם should_end_call=false אז summary חייב להיות ריק: recommended_call_response="", key_points=[], do_not_say=[].
- אם should_end_call=true אז summary חייב להיות לא ריק (לפחות אחד משדות summary אינו ריק).`;

type BuildMessagesV2Input = {
  schema_version: "2.0";
  conversation_id?: string;
  context?: { garage_name?: string; policy_notes?: string };
  transcript: Array<{
    turn_id?: string;
    customer_said: string;
    agent_said?: string;
    customer_replied?: string;
  }>;
  latest_customer_message: string;
  agent_last_actual_reply?: string;
  output_language?: "he";
};

export function buildMessagesV2(
  input: BuildMessagesV2Input,
): ChatCompletionMessageParam[] {
  const lines: string[] = [];

  lines.push(`schema_version: ${input.schema_version}`);

  if (input.conversation_id) {
    lines.push(`conversation_id: ${input.conversation_id}`);
  }

  if (input.context?.garage_name) {
    lines.push(`garage_name: ${input.context.garage_name}`);
  }

  if (input.context?.policy_notes) {
    lines.push(`policy_notes: ${input.context.policy_notes}`);
  }

  if (input.output_language) {
    lines.push(`output_language: ${input.output_language}`);
  }

  if (input.agent_last_actual_reply) {
    lines.push(`agent_last_actual_reply: ${input.agent_last_actual_reply}`);
  }

  lines.push("transcript:");
  input.transcript.forEach((turn, index) => {
    const turnLines = [`${index + 1}) C: ${turn.customer_said}`];

    if (turn.agent_said) {
      turnLines.push(`A: ${turn.agent_said}`);
    }

    if (turn.customer_replied) {
      turnLines.push(`CR: ${turn.customer_replied}`);
    }

    lines.push(turnLines.join(" | "));
  });

  lines.push(`latest_customer_message: ${input.latest_customer_message}`);

  return [
    { role: "system", content: SYSTEM_PROMPT_HE_V2 },
    { role: "user", content: lines.join("\n") },
  ];
}

export function buildMessages(
  input: string | Array<{ role: "user" | "assistant"; content: string }>,
): ChatCompletionMessageParam[] {
  const userMessages: ChatCompletionMessageParam[] = Array.isArray(input)
    ? input
    : [{ role: "user", content: input }];

  return [{ role: "system", content: SYSTEM_PROMPT_HE }, ...userMessages];
}
