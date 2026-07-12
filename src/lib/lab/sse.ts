export async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];

  const consumeLine = (rawLine: string): string | undefined => {
    const line = rawLine.replace(/\r$/, "");
    if (line === "") {
      if (data.length === 0) return undefined;
      const payload = data.join("\n");
      data = [];
      return payload;
    }
    if (line.startsWith(":")) return undefined;
    if (line === "data") data.push("");
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    return undefined;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const payload = consumeLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      if (payload !== undefined) yield payload;
    }
  }

  buffer += decoder.decode();
  if (buffer !== "") {
    const payload = consumeLine(buffer);
    if (payload !== undefined) yield payload;
  }
  if (data.length > 0) yield data.join("\n");
}
