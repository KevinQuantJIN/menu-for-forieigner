export function createLineSplitter() {
  let buf = "";
  return {
    push(chunk: string): string[] {
      buf += chunk;
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      return parts.map((l) => l.trim()).filter((l) => l !== "");
    },
    flush(): string[] {
      const line = buf.trim();
      buf = "";
      return line ? [line] : [];
    },
  };
}

export function parseModelLine(line: string): unknown | null {
  const cleaned = line.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
