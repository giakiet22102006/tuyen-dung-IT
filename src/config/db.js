const mongoose = require("mongoose");
const env = require("./env");

let cachedPromise = null;

// Tắt autoIndex trong production để tránh Mongoose quét toàn bộ index mỗi khi cold start
if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  mongoose.set("autoIndex", false);
}

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!cachedPromise) {
    const opts = {
      bufferCommands: false, // Tắt buffering trong serverless để không treo truy vấn
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,       // Tối ưu hóa connection pool cho Serverless
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
    };

    cachedPromise = mongoose
      .connect(env.MONGODB_URI, opts)
      .then((mongooseInstance) => {
        console.log(`✅ Kết nối MongoDB thành công: ${mongooseInstance.connection.host}`);
        return mongooseInstance.connection;
      })
      .catch((err) => {
        cachedPromise = null;
        console.error(`❌ Lỗi kết nối MongoDB: ${err.message}`);
        throw err;
      });
  }

  return cachedPromise;
};

const closeDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    await mongoose.connection.close();
  }
  cachedPromise = null;
  console.log("Đã đóng kết nối MongoDB.");
};

module.exports = { connectDB, closeDB };
