const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { createShutdownHandler } = require("../src/server");

let mongoServer;

describe("Healthcheck & Graceful Shutdown", () => {
  afterEach(() => {
    app.locals.isShuttingDown = false;
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe("When database is disconnected", () => {
    beforeAll(async () => {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    });

    test("GET /healthz still returns 200 JSON (liveness probe)", async () => {
      const res = await request(app).get("/healthz");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body).toEqual({ status: "ok" });
    });

    test("GET /health returns 503 JSON degraded without HTML 500 fallback", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.status).toBe("degraded");
      expect(res.body.checks).toEqual({ database: "disconnected" });
      expect(typeof res.body.uptime).toBe("number");
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe("When database is connected", () => {
    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      await mongoose.connect(mongoServer.getUri());
    });

    test("GET /health returns 200 ok with database connected", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.checks).toEqual({ database: "connected" });
      expect(typeof res.body.uptime).toBe("number");
      expect(res.body.timestamp).toBeDefined();
    });

    test("GET /healthz and /health return 503 shutting_down during drain", async () => {
      app.locals.isShuttingDown = true;

      const [resLive, resReady] = await Promise.all([
        request(app).get("/healthz"),
        request(app).get("/health"),
      ]);

      expect(resLive.status).toBe(503);
      expect(resLive.body).toEqual({ status: "shutting_down" });

      expect(resReady.status).toBe(503);
      expect(resReady.body.status).toBe("shutting_down");
    });
  });

  describe("Graceful shutdown handler", () => {
    test("closes idle connections, drains HTTP server, closes DB and exits 0", async () => {
      const mockServer = {
        close: jest.fn((cb) => cb()),
        closeIdleConnections: jest.fn(),
      };
      const closeDatabase = jest.fn().mockResolvedValue(undefined);
      const onShuttingDown = jest.fn();
      const exit = jest.fn();

      const handler = createShutdownHandler({
        getServer: () => mockServer,
        closeDatabase,
        onShuttingDown,
        timeoutMs: 1000,
        exit,
      });

      await handler("SIGTERM");
      // Duplicate signal should be ignored by idempotency guard
      await handler("SIGINT");

      expect(onShuttingDown).toHaveBeenCalledTimes(1);
      expect(mockServer.close).toHaveBeenCalledTimes(1);
      expect(mockServer.closeIdleConnections).toHaveBeenCalledTimes(1);
      expect(closeDatabase).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(0);
    });

    test("forces exit(1) when server.close exceeds shutdown timeout", async () => {
      jest.useFakeTimers();
      try {
        const hangingServer = {
          close: jest.fn(),
          closeIdleConnections: jest.fn(),
        };
        const exit = jest.fn();

        const handler = createShutdownHandler({
          getServer: () => hangingServer,
          closeDatabase: jest.fn().mockResolvedValue(undefined),
          timeoutMs: 500,
          exit,
        });

        handler("SIGTERM");
        expect(exit).not.toHaveBeenCalled();

        jest.advanceTimersByTime(500);
        expect(exit).toHaveBeenCalledWith(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
