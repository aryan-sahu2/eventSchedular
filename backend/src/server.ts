import express, { Application, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

// Import configuration and database/queue connection functions
import { connectDb, disconnectDb, closeQueue, redisConnection } from "./config";

// Import event routes
import eventRoutes from "./routes/event.routes";
// Import WebSocket utilities
import { 
  setWebSocketClients, 
  initializeWebSocketRedis, 
  closeWebSocketRedis 
} from "./utils/websocket";

// Load environment variables from .env file
dotenv.config();

// Define the port for the server, defaulting to 3000 if not specified in .env
const PORT = process.env.PORT || 3000;

// Create an Express application instance
const app: Application = express();

// Create an HTTP server from the Express app (required for WebSocket integration)
const server = createServer(app);

// --- WebSocket Server Setup ---
// Initialize a WebSocket server instance.
// It will share the same port as the HTTP server.
const wss = new WebSocketServer({ server });

// Store active WebSocket clients
const clients: Set<WebSocket> = new Set();

// Initialize Redis for WebSocket broadcasting
initializeWebSocketRedis(redisConnection);

// Set the clients Set in the websocket utils
setWebSocketClients(clients);

// WebSocket connection handler
wss.on("connection", (ws) => {
  console.log("New WebSocket client connected");

  clients.add(ws);

  // Send initial connection message
  ws.send(
    JSON.stringify({
      type: "connected",
      message: "Connected to event scheduler WebSocket",
    })
  );

  // Handle incoming messages (if needed)
  ws.on("message", (message: string) => {
    console.log("Received message:", message);
  });
  
  console.log("WebSocket client connected. Total clients:", clients.size);

  ws.on("close", () => {
    clients.delete(ws);
    console.log("WebSocket client disconnected. Total clients:", clients.size);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// --- Middleware Setup ---

// Enable CORS for all origins. In a production environment, you might want to restrict this.
app.use(cors());

// Parse incoming JSON requests. This is essential for handling POST requests with JSON bodies.
app.use(express.json());

// --- Swagger/OpenAPI Documentation Setup ---

// Swagger definition options
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Scheduler Service API",
      version: "1.0.0",
      description:
        "API documentation for the Event Notification Scheduler Service",
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: "Development server",
      },
    ],
  },
  apis: ["./src/routes/*.ts"],
};

// Initialize swagger-jsdoc to generate the OpenAPI specification
const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Serve Swagger UI at /api-docs endpoint
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- API Routes ---

// Mount the event routes under the '/api' prefix.
app.use("/api", eventRoutes);

// --- Error Handling Middleware ---

// This middleware catches any errors passed from route handlers or other middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Global Error Handler:", err.stack);
  res
    .status(500)
    .json({ message: "Something went wrong!", error: err.message });
});

// --- Server Initialization ---

// Function to start the server
const startServer = async () => {
  try {
    // Connect to the database before starting the server
    await connectDb();

    // Start listening for incoming requests on the specified port
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`API Docs available at http://localhost:${PORT}/api-docs`);
      console.log(`WebSocket server running on ws://localhost:${PORT}`);
    });

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("SIGINT signal received: Closing connections...");
      await disconnectDb();
      await closeQueue();
      closeWebSocketRedis(); // Close Redis connections
      wss.close(() => console.log("WebSocket server closed."));
      server.close(() => console.log("HTTP server closed."));
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("SIGTERM signal received: Closing connections...");
      await disconnectDb();
      await closeQueue();
      closeWebSocketRedis(); // Close Redis connections
      wss.close(() => console.log("WebSocket server closed."));
      server.close(() => console.log("HTTP server closed."));
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Call the function to start the server
startServer();