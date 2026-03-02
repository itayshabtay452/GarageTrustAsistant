export function successResponse(data: unknown) {
  return { ok: true, data };
}

export function badRequestResponse() {
  return {
    ok: false,
    error: {
      code: "BAD_REQUEST",
      message: "בקשה לא תקינה: חסר טקסט או שהטקסט קצר/ארוך מדי.",
    },
  };
}

export function rateLimitedResponse() {
  return {
    ok: false,
    error: {
      code: "RATE_LIMITED",
      message: "בוצעו יותר מדי בקשות בזמן קצר. נסה שוב בעוד כמה דקות.",
    },
  };
}

export function serverMisconfigResponse() {
  return {
    ok: false,
    error: {
      code: "SERVER_MISCONFIG",
      message: "המערכת לא מוגדרת כראוי. פנה למנהל המערכת.",
    },
  };
}

export function upstreamErrorResponse() {
  return {
    ok: false,
    error: {
      code: "UPSTREAM_ERROR",
      message: "שירות ה-AI זמנית לא זמין. נסה שוב עוד מעט.",
    },
  };
}
