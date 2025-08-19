const mongoose = require("mongoose");

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log("MongoDB is already connected");
    return;
  }

  try {
    // Default to local MongoDB if no connection string provided
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/camp_inventory";

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    isConnected = true;
    console.log("MongoDB connected successfully");

    // Handle connection events
    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err);
      isConnected = false;
    });

    mongoose.connection.on("disconnected", () => {
      console.log("MongoDB disconnected");
      isConnected = false;
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    console.log(
      "Inventory system will run in demo mode without database persistence",
    );
    isConnected = false;
  }
};

module.exports = { connectDB, mongoose };
