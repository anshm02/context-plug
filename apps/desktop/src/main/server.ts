import express, { Request, Response } from "express";
import cors from "cors";
import type { ContextResponse, HealthResponse } from "@context-plug/shared";

const PORT = 3124;

export function createServer(): express.Application {
  const app = express();

  // CORS configuration - allowing all origins for MVP
  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    const response: HealthResponse = {
      status: "ok",
      timestamp: Date.now(),
    };
    res.json(response);
  });

  // Context endpoint - returns mock data for MVP
  app.get("/context", (_req: Request, res: Response) => {
    const response: ContextResponse = {
      success: true,
      data: "Secret Project Alpha specs: This is classified information retrieved from your local Desktop Hub. The bridge is working!",
      source: "Desktop-File-System",
    };
    res.json(response);
  });

  return app;
}

export function startServer(
  onReady?: (port: number) => void
): ReturnType<express.Application["listen"]> {
  const app = createServer();

  const server = app.listen(PORT, () => {
    console.log(`[Context Bridge] Server running on http://localhost:${PORT}`);
    onReady?.(PORT);
  });

  return server;
}

export { PORT };

