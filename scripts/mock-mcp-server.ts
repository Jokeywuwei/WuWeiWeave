const decoder = new TextDecoder();
let buffer = "";
const reader = Bun.stdin.stream().getReader();

while (true) {
  const chunk = await reader.read();
  if (chunk.done) {
    break;
  }

  buffer += decoder.decode(chunk.value, { stream: true });
  while (buffer.includes("\n")) {
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line.length > 0) {
      handleLine(line);
    }
  }
}

if (buffer.trim().length > 0) {
  handleLine(buffer.trim());
}

function handleLine(line: string): void {
  const request = JSON.parse(line) as {
    id?: string;
    method?: string;
    params?: {
      name?: string;
      arguments?: Record<string, unknown>;
    };
  };

  if (request.method === "tools/list") {
    writeResponse(request.id, {
      tools: [
        {
          name: "echo",
          description: "Echo arguments for tests",
          inputSchema: {
            type: "object",
            properties: {
              value: { type: "string" }
            }
          }
        }
      ]
    });
    return;
  }

  if (request.method === "resources/list") {
    writeResponse(request.id, {
      resources: [
        {
          uri: "mock://resource",
          name: "Mock Resource",
          mimeType: "text/plain"
        }
      ]
    });
    return;
  }

  if (request.method === "prompts/list") {
    writeResponse(request.id, {
      prompts: [
        {
          name: "mock-prompt",
          description: "Prompt exposed by the mock MCP server"
        }
      ]
    });
    return;
  }

  if (request.method !== "tools/call") {
    writeError(request.id, -32601, "Only tools/call is implemented by the mock server");
    return;
  }

  writeResponse(request.id, {
    content: [
      {
        type: "text",
        text: `mock:${request.params?.name}:${JSON.stringify(request.params?.arguments ?? {})}`
      }
    ]
  });
}

function writeResponse(id: string | undefined, result: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      result
    })
  );
}

function writeError(id: string | undefined, code: number, message: string): void {
  console.log(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message
      }
    })
  );
}

export {};
