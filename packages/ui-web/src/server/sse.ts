import type { ChallengeState, DaemonManager, SolverSession } from "@wuweiweave/core";

const encoder = new TextEncoder();

export function createSseResponse<T>(producer: () => Promise<T>, intervalMs = 1500): Response {
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = async (): Promise<void> => {
        try {
          const payload = await producer();
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch (error) {
          const message = error instanceof Error ? error.message : "SSE producer failed";
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`));
        }
      };

      await send();
      timer = setInterval(() => {
        void send();
      }, intervalMs);
    },
    cancel() {
      if (timer) {
        clearInterval(timer);
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}

export function handleSseRequest(request: Request, daemon: DaemonManager): Response | undefined {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/api/runtime/events/stream") {
    return createSseResponse(async () => ({
      solvers: await daemon.runtime.listSolvers(),
      events: await daemon.runtime.listRuntimeEvents()
    }));
  }

  if (
    segments.length === 5 &&
    segments[0] === "api" &&
    segments[1] === "runtime" &&
    segments[2] === "solvers" &&
    segments[4] === "stream"
  ) {
    const solverId = segments[3];
    if (!solverId) {
      return undefined;
    }
    return createSseResponse(async (): Promise<{ solver: SolverSession; messages: unknown[] }> => ({
      solver: await daemon.runtime.getSolver(solverId),
      messages: await daemon.runtime.getMessages(solverId)
    }));
  }

  if (
    segments.length === 5 &&
    segments[0] === "api" &&
    segments[1] === "challenges" &&
    segments[3] === "timeline" &&
    segments[4] === "stream"
  ) {
    const challengeId = segments[2];
    if (!challengeId) {
      return undefined;
    }
    return createSseResponse(async (): Promise<Pick<ChallengeState, "id" | "timeline" | "planner">> => {
      const challenge = await daemon.challenges.getChallenge(challengeId);
      return {
        id: challenge.id,
        timeline: challenge.timeline,
        planner: challenge.planner
      };
    });
  }

  return undefined;
}
