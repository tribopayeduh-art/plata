process.on("unhandledRejection", (reason: unknown) => {
  console.warn("[Process Warning] Unhandled Rejection:", (reason as Error)?.message || reason);
});

process.on("uncaughtException", (err: Error) => {
  console.warn("[Process Warning] Uncaught Exception:", err?.message || err);
});

import "./server/index.mjs";

