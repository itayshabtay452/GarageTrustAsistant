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

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [response, setResponse] = useState<ApiResponseData | null>(null);
  const [latestReplyOptions, setLatestReplyOptions] = useState<string[]>([]);
  const [agentChoiceTranscript, setAgentChoiceTranscript] = useState<string[]>(
    [],
  );
  const [selectedReplyOption, setSelectedReplyOption] = useState<string | null>(
    null,
  );
  const [isAwaitingAgentChoice, setIsAwaitingAgentChoice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCallEnded = response?.should_end_call === true;

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
    setAgentChoiceTranscript((prev) => [...prev, option]);
    setIsAwaitingAgentChoice(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const trimmedInput = inputText.trim();
      if (!trimmedInput) {
        setError("השדה חובה למילוי.");
        setLoading(false);
        return;
      }
      if (trimmedInput.length < 3) {
        setError("הטקסט חייב להכיל לפחות 3 תווים.");
        setLoading(false);
        return;
      }

      if (isAwaitingAgentChoice) {
        setError("יש לבחור אחת מאפשרויות התגובה לפני שממשיכים.");
        setLoading(false);
        return;
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
      setResponse(data);
      if (data.should_end_call) {
        setLatestReplyOptions([]);
        setIsAwaitingAgentChoice(false);
      } else {
        setLatestReplyOptions(data.reply_options);
        setIsAwaitingAgentChoice(true);
      }
      setSelectedReplyOption(null);
      setInputText("");
    } catch (err) {
      // ודא שתמיד נשמר string | null בלבד
      const errorMessage =
        err instanceof Error ? err.message : "אירעה שגיאה. נסה שוב.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold mb-2 text-gray-900">
            עוזר האמון של המוסך
          </h1>
          <p className="text-gray-600 mb-8">
            קבל תגובות מקצועיות לשאלות של לקוחות על הרכב שלהם
          </p>

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
                setAgentChoiceTranscript([]);
                setSelectedReplyOption(null);
                setIsAwaitingAgentChoice(false);
                setError(null);
                setInputText("");
              }}
              className="w-full border border-gray-300 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              איפוס שיחה
            </button>
          </form>

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

          {response && (
            <div className="mt-8 space-y-6">
              {/* דחיפות */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">
                  דחיפות:
                </span>
                <span
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
                    response.urgency_level === "גבוה"
                      ? "bg-red-100 text-red-800 border border-red-300"
                      : response.urgency_level === "בינוני"
                        ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                        : "bg-green-100 text-green-800 border border-green-300"
                  }`}
                >
                  {response.urgency_level}
                </span>
              </div>

              {response.should_end_call && (
                <>
                  {/* תשובה מומלצת לשיחה */}
                  <div className="p-6 bg-blue-50 rounded-lg border border-blue-200">
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">
                      תשובה מומלצת לשיחה
                    </h2>
                    <div
                      className="px-4 py-3 border border-blue-300 rounded-lg bg-white text-gray-800 leading-relaxed"
                      style={{ whiteSpace: "pre-wrap" }}
                    >
                      {response.summary.recommended_call_response}
                    </div>
                  </div>

                  {/* נקודות מפתח */}
                  <div className="p-6 bg-green-50 rounded-lg border border-green-200">
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">
                      נקודות מפתח
                    </h2>
                    <ul className="list-disc list-inside space-y-2 text-gray-800">
                      {response.summary.key_points.map((point, index) => (
                        <li key={index} className="leading-relaxed">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* מה לא להגיד */}
                  <div className="p-6 bg-red-50 rounded-lg border border-red-200">
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">
                      מה לא להגיד
                    </h2>
                    <ul className="list-disc list-inside space-y-2 text-gray-800">
                      {response.summary.do_not_say.map((item, index) => (
                        <li key={index} className="leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {response.should_ask_followup &&
                response.next_question.trim() && (
                  <div className="p-6 bg-amber-50 rounded-lg border border-amber-200">
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">
                      שאלת המשך מומלצת
                    </h2>
                    <p className="text-gray-800 leading-relaxed">
                      {response.next_question}
                    </p>
                  </div>
                )}
            </div>
          )}

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
