import "dotenv/config";

// Catch any module-level initialization error and surface it
let appModule: any = null;
let initError: any = null;

async function loadApp() {
  if (appModule) return appModule;
  if (initError) throw initError;
  
  try {
    const express = (await import("express")).default;
    const { createServer } = await import("node:http");
    const { registerRoutes } = await import("../server/routes");
    
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json({ verify: (req: any, _res: any, buf: any) => { req.rawBody = buf; } }));
    app.use(express.urlencoded({ extended: false }));
    
    const httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    
    app.use((err: any, _req: any, res: any, _next: any) => {
      const status = err.status || err.statusCode || 500;
      res.status(status).json({ message: err.message || "Internal Server Error" });
    });
    
    appModule = app;
    return app;
  } catch (e) {
    initError = e;
    throw e;
  }
}

export default async function handler(req: any, res: any) {
  try {
    const app = await loadApp();
    return app(req, res);
  } catch (err: any) {
    console.error("[handler] Fatal error:", err);
    res.status(500).json({ 
      message: err?.message || "Server initialization failed", 
      type: err?.constructor?.name,
      stack: err?.stack?.split("\n").slice(0, 8)
    });
  }
}
