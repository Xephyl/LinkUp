// apps/backend/src/config/services.ts
// Layer 3: Service Config - Grouped settings for each service

import { env } from "./env";
import type { SignOptions } from "jsonwebtoken";

export const serviceConfig = {
  // Database Service
  database: {
    uri: env.MONGODB_URI,
    poolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    bufferMaxEntries: 0,
    bufferCommands: false,
  },

  // JWT Service
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    issuer: "chatapp",
    audience: "chatapp-users",
  },

  // Email Service
  email: {
    resendApiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
  },
};
