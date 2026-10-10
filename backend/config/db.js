const mongoose = require("mongoose");

async function connectDB() {
  try {
    mongoose.connection.on("connected", () => {
      console.log("MongoDB connection established.");
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB connection temporarily disconnected.");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("MongoDB reconnected.");
    });

    mongoose.connection.on("error", (error) => {
      console.error("MongoDB connection error:", error.message);
    });

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
      retryWrites: true,
    });

    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("Database connection failed:", error.message);
    throw error;
  }
}

module.exports = connectDB;
