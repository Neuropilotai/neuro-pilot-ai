const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const port = 3011;

// Basic route
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Super Agent Monitor - Working!</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            background: #1a1a2e; 
            color: white; 
            padding: 50px; 
            text-align: center;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 20px;
        }
        h1 { color: #64b5f6; margin-bottom: 20px; }
        .status { 
            background: #10b981; 
            color: white; 
            padding: 10px 20px; 
            border-radius: 25px; 
            display: inline-block;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Super Agent Monitor</h1>
        <div class="status">✅ Server Running Successfully!</div>
        <p>The agent monitoring system is operational.</p>
        <p>Port: ${port}</p>
        <p>Time: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
    `);
});

// Socket.io connection
io.on("connection", (socket) => {
  console.log("👤 Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("👤 Client disconnected:", socket.id);
  });
});

// Start server
server.listen(port, (err) => {
  if (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
  console.log("🚀 Simple Monitor started successfully!");
  console.log(`📱 Access at: http://localhost:${port}`);
  console.log(`🌐 Server listening on port ${port}`);
});

server.on("error", (err) => {
  console.error("❌ Server error:", err);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
