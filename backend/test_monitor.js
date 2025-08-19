const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

console.log("Testing simple server...");

const app = express();
const server = createServer(app);
const io = new Server(server);

app.get("/", (req, res) => {
  res.send("<h1>Test Server Working!</h1>");
});

const port = 3009;

server.listen(port, () => {
  console.log(`✅ Test server running on http://localhost:${port}`);
});

// Keep server running
process.on("SIGINT", () => {
  console.log("\n🛑 Server stopping...");
  server.close(() => {
    console.log("Server stopped");
    process.exit(0);
  });
});
