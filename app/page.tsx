"use client";

import { useState } from "react";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type ApiSummary = {
  recommended_call_response: string;
  key_points: string[];
  do_not_say: string[];
};

type ApiResponseData = {
  urgency_level: "נמוך" | "בינוני" | "גבוה";
  reply_options: string[];
  should_ask_followup: boolean;
  next_question: string;
  should_end_call: boolean;
  summary: ApiSummary;
};

type ApiSuccessResponse = {
  ok: true;
  data: ApiResponseData;
};

type ApiErrorResponse = {
  ok: false;
  error?: {
    message?: string;
    code?: string;
  };
};

type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [latestReplyOptions, setLatestReplyOptions] = useState<string[]>([]);
  const [selectedReplyOption, setSelectedReplyOption] = useState<string | null>(
    null,
  );
  const [isCallEnded, setIsCallEnded] = useState(false);
  const [valueFeedback, setValueFeedback] = useState<"yes" | "no" | null>(null);
  const [updateCustomerSaid, setUpdateCustomerSaid] = useState("");
  const [updateIAnswered, setUpdateIAnswered] = useState("");
  const [updateCustomerReacted, setUpdateCustomerReacted] = useState("");
  const [isAwaitingAgentChoice, setIsAwaitingAgentChoice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = response?.ok ? response.data : null;
  const replyOptions = data?.reply_options ?? [];
  const askNow = data?.next_question?.trim() ?? "";
  const urgencyLevel = data?.urgency_level ?? null;
  const summary = data?.summary ?? null;
  const canEndCall = data?.should_end_call === true;

  const phase = !data
    ? "idle"
    : canEndCall
      ? "end_call"
      : askNow
        ? "followup"
        : replyOptions.length === 3
          ? "reply_options"
          : "in_progress";

  const confidencePct =
    phase === "end_call"
      ? 92
      : phase === "followup"
        ? 84
        : phase === "reply_options"
          ? 78
          : phase === "in_progress"
            ? 70
            : 0;

  const handleSelectReplyOption = (option: string) => {
    if (!isAwaitingAgentChoice || selectedReplyOption) {
      return;
    }

    setSelectedReplyOption(option);
    setConversationMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: option,
      },
    ]);
    setIsAwaitingAgentChoice(false);
  };

  const submitMessage = async (
    text: string,
    options: { clearInputText?: boolean } = {},
  ): Promise<boolean> => {
    const { clearInputText = true } = options;
    setLoading(true);
    setError(null);

    try {
      const trimmedInput = text.trim();
      if (!trimmedInput) {
        setError("השדה חובה למילוי.");
        setLoading(false);
        return false;
      }
      if (trimmedInput.length < 3) {
        setError("הטקסט חייב להכיל לפחות 3 תווים.");
        setLoading(false);
        return false;
      }

      if (isAwaitingAgentChoice) {
        setError("יש לבחור אחת מאפשרויות התגובה לפני שממשיכים.");
        setLoading(false);
        return false;
      }

      setResponse(null);

      const updatedConversation: ConversationMessage[] = [
        ...conversationMessages,
        { role: "user", content: trimmedInput },
      ];
      setConversationMessages(updatedConversation);

      // שלח את ה-request ל-API
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: updatedConversation }),
      });

      // קרא את ה-JSON תמיד
      let jsonData: {
        ok?: boolean;
        error?: { message?: string; code?: string };
        data?: {
          urgency_level?: string;
          reply_options?: string[];
          should_ask_followup?: boolean;
          next_question?: string;
          should_end_call?: boolean;
          summary?: {
            recommended_call_response?: string;
            key_points?: string[];
            do_not_say?: string[];
          };
        };
      };
      try {
        jsonData = await res.json();
      } catch {
        throw new Error("אירעה שגיאה. נסה שוב.");
      }

      // בדוק אם הבקשה נכשלה
      if (!res.ok || jsonData.ok === false) {
        const errorMessage = jsonData.error?.message || "אירעה שגיאה. נסה שוב.";
        throw new Error(errorMessage);
      }

      // בדוק שה-response הוא בפורמט נכון
      if (
        !jsonData.data?.urgency_level ||
        !Array.isArray(jsonData.data?.reply_options) ||
        jsonData.data.reply_options.length !== 3 ||
        typeof jsonData.data?.should_ask_followup !== "boolean" ||
        typeof jsonData.data?.next_question !== "string" ||
        typeof jsonData.data?.should_end_call !== "boolean" ||
        !jsonData.data?.summary
      ) {
        throw new Error("תגובה לא תקינה מהשרת. נסה שוב.");
      }

      if (
        jsonData.data.should_end_call &&
        (!jsonData.data.summary.recommended_call_response ||
          !Array.isArray(jsonData.data.summary.key_points) ||
          !Array.isArray(jsonData.data.summary.do_not_say))
      ) {
        throw new Error("תגובה לא תקינה מהשרת. נסה שוב.");
      }

      const data: ApiResponseData = {
        urgency_level: jsonData.data.urgency_level as
          | "נמוך"
          | "בינוני"
          | "גבוה",
        reply_options: jsonData.data.reply_options,
        should_ask_followup: jsonData.data.should_ask_followup,
        next_question: jsonData.data.next_question,
        should_end_call: jsonData.data.should_end_call,
        summary: {
          recommended_call_response:
            jsonData.data.summary.recommended_call_response || "",
          key_points: jsonData.data.summary.key_points || [],
          do_not_say: jsonData.data.summary.do_not_say || [],
        },
      };
      setResponse({ ok: true, data });
      if (data.should_end_call) {
        setLatestReplyOptions([]);
        setIsAwaitingAgentChoice(false);
      } else {
        setLatestReplyOptions(data.reply_options);
        setIsAwaitingAgentChoice(true);
      }
      setSelectedReplyOption(null);
      if (clearInputText) {
        setInputText("");
      }
      return true;
    } catch (err) {
      // ודא שתמיד נשמר string | null בלבד
      const errorMessage =
        err instanceof Error ? err.message : "אירעה שגיאה. נסה שוב.";
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitMessage(inputText, { clearInputText: true });
  };

  const handleSendUpdate = async () => {
    const trimmedCustomerSaid = updateCustomerSaid.trim();
    const trimmedIAnswered = updateIAnswered.trim();
    const trimmedCustomerReacted = updateCustomerReacted.trim();

    if (!trimmedCustomerSaid && !trimmedIAnswered && !trimmedCustomerReacted) {
      setError("מלא לפחות אחד מהשדות לפני שליחה.");
      return;
    }

    const mergedText = `CALL UPDATE\nCustomer said: ${trimmedCustomerSaid}\nI answered: ${trimmedIAnswered}\nCustomer reacted: ${trimmedCustomerReacted}`;
    const didSubmit = await submitMessage(mergedText, {
      clearInputText: false,
    });
    if (didSubmit) {
      setUpdateCustomerSaid("");
      setUpdateIAnswered("");
      setUpdateCustomerReacted("");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 text-gray-900">
              עוזר האמון של המוסך
            </h1>
            <p className="text-gray-600 mb-4">
              קבל תגובות מקצועיות לשאלות של לקוחות על הרכב שלהם
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="px-3 py-1 rounded-full bg-gray-100 border border-gray-300 text-gray-700">
                שלב: {phase}
              </span>
              <span className="px-3 py-1 rounded-full bg-indigo-100 border border-indigo-300 text-indigo-800">
                ביטחון: {confidencePct}%
              </span>
              <span
                title="POC: Frontend heuristic based on existing response fields"
                className="px-2 py-1 rounded-full bg-slate-100 border border-slate-300 text-slate-700"
                dir="rtl"
              >
                ⓘ
              </span>
              {urgencyLevel && (
                <span className="px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800">
                  דחיפות: {urgencyLevel}
                </span>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                מה הלקוח אמר / מה הנציג רוצה לשאול
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="לדוגמה: הלקוח מדווח על נורה דולקת ורעש חריג מהמנוע"
                rows={5}
                disabled={isCallEnded}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || isCallEnded}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading && (
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              <span>{loading ? "יוצר תשובה..." : "שלח"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setConversationMessages([]);
                setResponse(null);
                setLatestReplyOptions([]);
                setSelectedReplyOption(null);
                setIsCallEnded(false);
                setValueFeedback(null);
                setIsAwaitingAgentChoice(false);
                setError(null);
                setInputText("");
              }}
              className="w-full border border-gray-300 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              איפוס שיחה
            </button>
          </form>

          <section
            className="mt-8 p-6 bg-white rounded-lg border border-gray-200"
            dir="rtl"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              3-Field Update
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer said
                </label>
                <textarea
                  value={updateCustomerSaid}
                  onChange={(e) => setUpdateCustomerSaid(e.target.value)}
                  rows={3}
                  disabled={loading || isCallEnded}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  I answered
                </label>
                <textarea
                  value={updateIAnswered}
                  onChange={(e) => setUpdateIAnswered(e.target.value)}
                  rows={3}
                  disabled={loading || isCallEnded}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer reacted
                </label>
                <textarea
                  value={updateCustomerReacted}
                  onChange={(e) => setUpdateCustomerReacted(e.target.value)}
                  rows={3}
                  disabled={loading || isCallEnded}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                type="button"
                onClick={handleSendUpdate}
                disabled={loading || isCallEnded}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Send Update
              </button>
            </div>
          </section>

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">
                <strong>שגיאה:</strong> {error}
              </p>
            </div>
          )}

          {isAwaitingAgentChoice &&
            latestReplyOptions.length === 3 &&
            !isCallEnded && (
              <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  אפשרויות תגובה לנציג
                </h2>
                <div className="space-y-3">
                  {latestReplyOptions.map((option, index) => (
                    <button
                      key={`${option}-${index}`}
                      type="button"
                      onClick={() => handleSelectReplyOption(option)}
                      disabled={!!selectedReplyOption}
                      className="w-full text-right px-4 py-3 border border-blue-300 rounded-lg bg-white text-gray-800 leading-relaxed hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      {`${index + 1}. ${option}`}
                    </button>
                  ))}
                </div>
                {!selectedReplyOption && (
                  <p className="mt-3 text-sm text-blue-900">
                    יש לבחור אחת מהאפשרויות כדי להמשיך.
                  </p>
                )}
              </div>
            )}

          <section className="mt-8 space-y-4">
            <div className="p-6 bg-slate-50 rounded-lg border border-slate-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                פלט מובנה
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <div className="p-4 rounded-lg bg-white border border-slate-200">
                  <h3 className="text-base font-semibold text-gray-900 mb-2">
                    Ask Now
                  </h3>
                  <p className="text-gray-800 leading-relaxed">
                    {askNow || "אין שאלת המשך כרגע"}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-white border border-slate-200">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">
                    Possible Direction
                  </h3>
                  {replyOptions.length > 0 ? (
                    <div className="space-y-2">
                      {replyOptions.map((option, index) => (
                        <button
                          key={`${option}-${index}`}
                          type="button"
                          onClick={() => setInputText(option)}
                          disabled={isCallEnded}
                          className="w-full text-right px-4 py-3 border border-blue-300 rounded-lg bg-blue-50 text-gray-800 leading-relaxed hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-500"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">אין אפשרויות כרגע</p>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-white border border-slate-200">
                  <h3 className="text-base font-semibold text-gray-900 mb-2">
                    Internal Info
                  </h3>
                  <p className="text-sm text-gray-700 mb-2">
                    דחיפות: {urgencyLevel || "לא זמין"}
                  </p>
                  {summary ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          recommended_call_response
                        </p>
                        <p
                          className="text-gray-800 leading-relaxed"
                          style={{ whiteSpace: "pre-wrap" }}
                        >
                          {summary.recommended_call_response || "לא זמין"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          key_points
                        </p>
                        {summary.key_points.length > 0 ? (
                          <ul className="list-disc list-inside space-y-1 text-gray-800">
                            {summary.key_points.map((point, index) => (
                              <li key={index}>{point}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-500">לא זמין</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          do_not_say
                        </p>
                        {summary.do_not_say.length > 0 ? (
                          <ul className="list-disc list-inside space-y-1 text-gray-800">
                            {summary.do_not_say.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-500">לא זמין</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">אין מידע פנימי להצגה</p>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-white border border-slate-200">
                  <h3 className="text-base font-semibold text-gray-900 mb-2">
                    Confidence
                  </h3>
                  <p className="text-gray-800">{confidencePct}%</p>
                </div>
              </div>
            </div>

            {canEndCall && !isCallEnded && (
              <button
                type="button"
                onClick={() => setIsCallEnded(true)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                End Call
              </button>
            )}

            {isCallEnded && (
              <div className="space-y-4">
                <div className="p-6 bg-green-50 rounded-lg border border-green-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    CRM Summary
                  </h3>
                  {summary ? (
                    <div className="space-y-3 text-gray-800">
                      <div>
                        <p className="font-medium mb-1">תשובה מומלצת לשיחה</p>
                        <p style={{ whiteSpace: "pre-wrap" }}>
                          {summary.recommended_call_response || "לא זמין"}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium mb-1">נקודות מפתח</p>
                        {summary.key_points.length > 0 ? (
                          <ul className="list-disc list-inside space-y-1">
                            {summary.key_points.map((point, index) => (
                              <li key={index}>{point}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-500">לא זמין</p>
                        )}
                      </div>
                      <div>
                        <p className="font-medium mb-1">מה לא להגיד</p>
                        {summary.do_not_say.length > 0 ? (
                          <ul className="list-disc list-inside space-y-1">
                            {summary.do_not_say.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-500">לא זמין</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">אין סיכום CRM זמין</p>
                  )}
                </div>

                <div className="p-6 bg-white rounded-lg border border-gray-200">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">
                    Value Feedback
                  </h3>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setValueFeedback("yes")}
                      className={`px-4 py-2 rounded-lg border ${
                        valueFeedback === "yes"
                          ? "bg-green-100 border-green-400 text-green-800"
                          : "bg-white border-gray-300 text-gray-700"
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setValueFeedback("no")}
                      className={`px-4 py-2 rounded-lg border ${
                        valueFeedback === "no"
                          ? "bg-red-100 border-red-400 text-red-800"
                          : "bg-white border-gray-300 text-gray-700"
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="mt-8" dir="rtl">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              היסטוריית שיחה
            </h2>
            {conversationMessages.length === 0 ? (
              <div className="text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">
                עדיין אין הודעות בשיחה.
              </div>
            ) : (
              <div className="space-y-3">
                {conversationMessages.map((msg, index) => (
                  <div
                    key={`${msg.role}-${index}`}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] px-4 py-3 rounded-2xl border whitespace-pre-wrap leading-relaxed ${
                        msg.role === "user"
                          ? "bg-blue-100 border-blue-300 text-blue-900"
                          : "bg-gray-100 border-gray-300 text-gray-800"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
