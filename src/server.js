const app = require("./app");
const env = require("./config/env");
const { connectDB, closeDB } = require("./config/db");

let server;

const startServer = async () => {
  // Kết nối database nếu không phải test
  if (env.NODE_ENV !== "test") {
    await connectDB();
  }

  server = app.listen(env.PORT, () => {
    console.log(`🚀 VN.ITJobs Server đang chạy tại http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  // Graceful shutdown
  const handleExit = async (signal) => {
    console.log(`\nNhận tín hiệu ${signal}. Đang tắt server an toàn...`);
    if (server) {
      server.close(async () => {
        console.log("Server HTTP đã đóng.");
        await closeDB();
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => handleExit("SIGINT"));
  process.on("SIGTERM", () => handleExit("SIGTERM"));
};

startServer();
