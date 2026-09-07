export interface AiAnalysisResponse {
  reasoning: string;
  risks: string[];
  strengths: string[];
}

const FALLBACK_REASONING =
  "The AI explanation was unavailable, so this analysis is based on the rules-based technical, fundamental, and behavioral scores shown above.";

export function fallbackAiAnalysis(): AiAnalysisResponse {
  return {
    reasoning: FALLBACK_REASONING,
    risks: [],
    strengths: [],
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function escapeControlCharactersInStrings(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        result += char;
      } else if (char === "\\") {
        escaped = true;
        result += char;
      } else if (char === '"') {
        inString = false;
        result += char;
      } else if (char === "\n") {
        result += "\\n";
      } else if (char === "\r") {
        result += "\\r";
      } else if (char === "\t") {
        result += "\\t";
      } else {
        result += char;
      }
    } else {
      if (char === '"') inString = true;
      result += char;
    }
  }

  return result;
}

export function parseAiAnalysis(rawContent: string): AiAnalysisResponse | null {
  const trimmed = rawContent.trim();
  if (!trimmed) return null;

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const candidate = withoutFence.startsWith("{")
    ? withoutFence
    : extractJsonObject(withoutFence);
  if (!candidate) return null;

  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      // Some model responses contain literal paragraph breaks inside a JSON
      // string even when json_object mode was requested. Normalize only those
      // control characters before giving up.
      parsed = JSON.parse(escapeControlCharactersInStrings(candidate));
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const record = parsed as Record<string, unknown>;
    return {
      reasoning: typeof record.reasoning === "string" && record.reasoning.trim()
        ? record.reasoning
        : "Analysis complete.",
      risks: stringArray(record.risks),
      strengths: stringArray(record.strengths),
    };
  } catch {
    return null;
  }
}