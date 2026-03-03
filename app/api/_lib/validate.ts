export function validateMessage(message: string) {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length < 3 || trimmedMessage.length > 4000) {
    return false;
  }
  return true;
}

type V2Request = {
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

export function validateV2Request(
  body: any,
):
  | { ok: true; data: V2Request }
  | { ok: false; code: "BAD_REQUEST"; message: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "גוף הבקשה חייב להיות אובייקט",
    };
  }

  if (body.schema_version !== "2.0") {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "schema_version חייב להיות 2.0",
    };
  }

  if (
    typeof body.latest_customer_message !== "string" ||
    body.latest_customer_message.trim().length === 0
  ) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "latest_customer_message חייב להיות טקסט לא ריק",
    };
  }

  if (!Array.isArray(body.transcript)) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "transcript חייב להיות מערך",
    };
  }

  const normalizedTranscript: V2Request["transcript"] = [];
  for (const item of body.transcript) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "כל איבר ב-transcript חייב להיות אובייקט",
      };
    }

    if (
      typeof item.customer_said !== "string" ||
      item.customer_said.trim().length === 0
    ) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "customer_said חייב להיות טקסט לא ריק",
      };
    }

    if (item.agent_said !== undefined && typeof item.agent_said !== "string") {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "agent_said חייב להיות טקסט",
      };
    }

    if (
      item.customer_replied !== undefined &&
      typeof item.customer_replied !== "string"
    ) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "customer_replied חייב להיות טקסט",
      };
    }

    if (item.turn_id !== undefined && typeof item.turn_id !== "string") {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "turn_id חייב להיות טקסט",
      };
    }

    normalizedTranscript.push({
      customer_said: item.customer_said,
      ...(item.agent_said !== undefined ? { agent_said: item.agent_said } : {}),
      ...(item.customer_replied !== undefined
        ? { customer_replied: item.customer_replied }
        : {}),
      ...(item.turn_id !== undefined ? { turn_id: item.turn_id } : {}),
    });
  }

  if (
    body.conversation_id !== undefined &&
    typeof body.conversation_id !== "string"
  ) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "conversation_id חייב להיות טקסט",
    };
  }

  if (
    body.agent_last_actual_reply !== undefined &&
    typeof body.agent_last_actual_reply !== "string"
  ) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "agent_last_actual_reply חייב להיות טקסט",
    };
  }

  if (body.output_language !== undefined && body.output_language !== "he") {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "output_language חייב להיות he",
    };
  }

  if (body.context !== undefined) {
    if (
      typeof body.context !== "object" ||
      body.context === null ||
      Array.isArray(body.context)
    ) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "context חייב להיות אובייקט",
      };
    }

    if (
      body.context.garage_name !== undefined &&
      typeof body.context.garage_name !== "string"
    ) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "garage_name חייב להיות טקסט",
      };
    }

    if (
      body.context.policy_notes !== undefined &&
      typeof body.context.policy_notes !== "string"
    ) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "policy_notes חייב להיות טקסט",
      };
    }
  }

  const normalizedData: V2Request = {
    schema_version: "2.0",
    transcript: normalizedTranscript,
    latest_customer_message: body.latest_customer_message,
    ...(body.conversation_id !== undefined
      ? { conversation_id: body.conversation_id }
      : {}),
    ...(body.agent_last_actual_reply !== undefined
      ? { agent_last_actual_reply: body.agent_last_actual_reply }
      : {}),
    ...(body.output_language !== undefined
      ? { output_language: body.output_language }
      : {}),
    ...(body.context !== undefined
      ? {
          context: {
            ...(body.context.garage_name !== undefined
              ? { garage_name: body.context.garage_name }
              : {}),
            ...(body.context.policy_notes !== undefined
              ? { policy_notes: body.context.policy_notes }
              : {}),
          },
        }
      : {}),
  };

  return { ok: true, data: normalizedData };
}
