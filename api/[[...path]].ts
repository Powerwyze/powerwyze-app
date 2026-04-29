import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import { registerRoutes } from "../server/routes";

const app = express();
app.set("trust proxy", 1);

app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));

const httpServer = createServer(app);
let ready: Promise<void> | null = null;

async function init() {
  if (!ready) {
    ready = registerRoutes(httpServer, app).then(() => {
      app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        res.status(status).json({ message: err.message || "Internal Server Error" });
      });
    }) as unknown as Promise<void>;
  }
  await ready;
}

export default async function handler(req: any, res: any) {
  try {
    await init();
    return app(req, res);
  } catch (err: any) {
    console.error("[handler] Fatal error:", err);
    res.status(500).json({ message: err?.message || "Server initialization failed", stack: err?.stack?.split("\n").slice(0, 5) });
  }
}
