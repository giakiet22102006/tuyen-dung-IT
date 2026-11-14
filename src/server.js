const app = require("./app");
const env = require("./config/env");
const { connectDB, closeDB } = require("./config/db");

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Tạo handler graceful shutdown có idempotency guard và safety timeout.
 * - Đánh dấu app đang draining để /health & /healthz trả 503 (cắt traffic mới từ Load Balancer).
 * - Đóng các HTTP keep-alive idle connections để server.close() không bị treo vô hạn.
 * - Dùng timer .unref() để ép thoát trước khi Docker/K8s gửi SIGKILL sau grace period.
 */
const createShutdownHandler = ({
  getServer,
  closeDatabase = closeDB,
  onShuttingDown = () => {},
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
  exit = process.exit,
} = {}) => {
  let isShuttingDown = false;

  return async (signal) => {
    if (isShuttingDown) {
      console.log(`Đã nhận ${signal}, tiến trình shutdown đang chạy...`);
      return;
    }
    isShuttingDown = true;
    onShuttingDown();
    console.log(`\nNhận tín hiệu ${signal}. Đang tắt server an toàn...`);

    const forceTimer = setTimeout(() => {
      console.error(`❌ Quá thời gian graceful shutdown (${timeoutMs}ms). Ép thoát process!`);
      exit(1);
    }, timeoutMs);
    if (typeof forceTimer.unref === "function") {
      forceTimer.unref();
    }

    const server = typeof getServer === "function" ? getServer() : null;
    if (!server) {
      try {
        await closeDatabase();
        clearTimeout(forceTimer);
        exit(0);
      } catch (dbErr) {
        console.error("❌ Lỗi khi đóng kết nối MongoDB:", dbErr);
        clearTimeout(forceTimer);
        exit(1);
      }
      return;
    }

    server.close(async (closeErr) => {
      if (closeErr) {
        console.error("❌ Lỗi khi đóng HTTP server:", closeErr);
      } else {
        console.log("✅ Server HTTP đã đóng.");
      }

      try {
        await closeDatabase();
        clearTimeout(forceTimer);
        exit(closeErr ? 1 : 0);
      } catch (dbErr) {
        console.error("❌ Lỗi khi đóng kết nối MongoDB:", dbErr);
        clearTimeout(forceTimer);
        exit(1);
      }
    });

    // Đóng ngay các keep-alive socket đang rảnh (Node >= 18.2) để không chờ client timeout
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
  };
};

const startServer = async () => {
  if (env.NODE_ENV !== "test") {
    await connectDB();
  }

  let server;
  const handleExit = createShutdownHandler({
    getServer: () => server,
    onShuttingDown: () => {
      app.locals.isShuttingDown = true;
    },
  });

  server = app.listen(env.PORT, () => {
    console.log(`🚀 VN.ITJobs Server đang chạy tại http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  server.on("error", (err) => {
    console.error("❌ Lỗi HTTP server:", err);
    process.exit(1);
  });

  process.on("SIGINT", () => handleExit("SIGINT"));
  process.on("SIGTERM", () => handleExit("SIGTERM"));

  return server;
};

if (require.main === module) {
  startServer().catch((err) => {
    console.error("❌ Không thể khởi động server:", err);
    process.exit(1);
  });
}

module.exports = { startServer, createShutdownHandler, SHUTDOWN_TIMEOUT_MS };
