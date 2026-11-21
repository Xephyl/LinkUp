// apps/backend/src/server.ts
import dotenv from "dotenv";
import path from "node:path";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

import { initSentry } from "./config/sentry";
initSentry();

import http from "node:http";
import { Server as SocketServer } from "socket.io";
import app from "./app";
import { connectDB } from "./config/database";
import { initSocketHandlers } from "./services/socket.service";
import { setIO } from "./config/socket";

const PORT = process.env.PORT || 4000;
const httpServer = http.createServer(app);

const allowedSocketOrigins = [
  process.env.CLIENT_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
].filter(Boolean) as string[];

// Mirror the same Vercel subdomain restriction applied in app.ts CORS config.
// Only preview deployments of YOUR project are allowed, not all of Vercel.
const clientHost = (process.env.CLIENT_URL || '').replace(/^https?:\/\//, '');
const vercelSubdomain = clientHost.endsWith('.vercel.app') ? `.${clientHost}` : null;

const io = new SocketServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        allowedSocketOrigins.includes(origin) ||
        origin.endsWith('.trycloudflare.com') ||
        (vercelSubdomain !== null && origin.endsWith(vercelSubdomain))
      ) {
        return callback(null, true);
      }
      console.warn(`🚫 Socket CORS blocked origin: ${origin}`);
      callback(new Error(`Socket CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  },
  pingTimeout: 60000,
  // Prevent large payload abuse — a client sending a 100MB socket message
  // would exhaust memory without this limit. Default is 1MB; making it
  // explicit ensures it survives any future Socket.IO version changes.
  maxHttpBufferSize: 1e6, // 1MB
});

setIO(io);

const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    initSocketHandlers(io);

    httpServer.listen(PORT, () => {
      console.log('🚀 Server started');
      console.log(`   • Port: ${PORT}`);
      console.log(`   • Environment: ${process.env.NODE_ENV}`);
      console.log(`   • Adapter: ${io.of('/').adapter.constructor.name}`);
      console.log('📡 Socket.IO ready');
      console.log('🌐 Allowed socket origins:', allowedSocketOrigins);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

let isShuttingDown = false;

const gracefulShutdown = async () => {
  if (isShuttingDown) {
    console.log("Shutdown already in progress, ignoring duplicate signal");
    return;
  }

  isShuttingDown = true;
  const forceExit = setTimeout(() => {
    console.error("Forceful shutdown after 10s timeout.");
    process.exit(1);
  }, 10000);
  forceExit.unref();

  const shutdown = async (): Promise<void> => {
    try {
      // Step 1 — stop accepting new socket connections and drain existing ones
      await io.close();
      console.log('🔌 Socket.IO closed.');

      // Step 2 — stop accepting new HTTP connections
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
      console.log('🌐 HTTP server closed.');
      console.log('✅ Server shut down cleanly.');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  };

  await shutdown();
  process.exit(0);
};

// Graceful shutdown with proper order and force timeout
process.once("SIGTERM", gracefulShutdown);

// Handle SIGINT (Ctrl+C) same as SIGTERM
process.once("SIGINT", gracefulShutdown);

startServer();
export { io };