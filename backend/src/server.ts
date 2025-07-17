import express, { Application, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { WebSocketServer, WebSocket } from "ws"; // Import WebSocket modules
import { createServer } from "http"; // Import createServer for HTTP server

// Import configuration and database/queue connection functions
import { connectDb, disconnectDb, closeQueue } from "./config";

// Import event routes
import eventRoutes from "./routes/event.routes";
import { addWebSocketClient } from "./utils/websocket";

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

// WebSocket connection handler
wss.on("connection", (ws) => {
  addWebSocketClient(ws);
  console.log("WebSocket client connected. Total clients:", clients.size);

  ws.on("close", () => {
    clients.delete(ws); // Remove client on close
    console.log("WebSocket client disconnected. Total clients:", clients.size);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

/**
 * Broadcasts an event update to all connected WebSocket clients.
 * This function will be imported and called by the EventService
 * whenever an event's status changes in the database.
 * @param eventData - The updated event object to broadcast.
 */
export const broadcastEventUpdate = (eventData: any) => {
  const message = JSON.stringify({ type: "EVENT_UPDATE", payload: eventData });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
  console.log(
    `Broadcasted update for event ID: ${eventData.id}, Status: ${eventData.status}`
  );
};

// --- Middleware Setup ---

// Enable CORS for all origins. In a production environment, you might want to restrict this.
app.use(cors());

// Parse incoming JSON requests. This is essential for handling POST requests with JSON bodies.
app.use(express.json());

// --- Swagger/OpenAPI Documentation Setup ---

// Swagger definition options
const swaggerOptions = {
  definition: {
    openapi: "3.0.0", // Specify the OpenAPI version
    info: {
      title: "Scheduler Service API", // Title of your API
      version: "1.0.0", // Version of your API
      description:
        "API documentation for the Event Notification Scheduler Service", // Description
    },
    servers: [
      {
        url: `http://localhost:${PORT}`, // Base URL for your API
        description: "Development server",
      },
    ],
  },
  // Paths to files containing OpenAPI annotations (JSDoc comments)
  apis: ["./src/routes/*.ts"], // Look for annotations in all .ts files within the routes directory
};

// Initialize swagger-jsdoc to generate the OpenAPI specification
const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Serve Swagger UI at /api-docs endpoint
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- API Routes ---

// Mount the event routes under the '/api' prefix.
// This means all routes defined in event.routes.ts will be prefixed with /api (e.g., /api/events).
app.use("/api", eventRoutes);

// --- Error Handling Middleware ---

// This middleware catches any errors passed from route handlers or other middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Global Error Handler:", err.stack); // Log the error stack for debugging
  // Send a generic 500 Internal Server Error response for unhandled errors
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
      // Use 'server.listen' instead of 'app.listen'
      console.log(`Server is running on port ${PORT}`);
      console.log(`API Docs available at http://localhost:${PORT}/api-docs`);
      console.log(`WebSocket server running on ws://localhost:${PORT}`);
    });

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("SIGINT signal received: Closing connections...");
      await disconnectDb(); // Disconnect from database
      await closeQueue(); // Close BullMQ queue
      wss.close(() => console.log("WebSocket server closed.")); // Close WebSocket server
      server.close(() => console.log("HTTP server closed.")); // Close HTTP server
      process.exit(0); // Exit the process
    });

    process.on("SIGTERM", async () => {
      console.log("SIGTERM signal received: Closing connections...");
      await disconnectDb(); // Disconnect from database
      await closeQueue(); // Close BullMQ queue
      wss.close(() => console.log("WebSocket server closed.")); // Close WebSocket server
      server.close(() => console.log("HTTP server closed.")); // Close HTTP server
      process.exit(0); // Exit the process
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1); // Exit with error code if server fails to start
  }
};

// Call the function to start the server
startServer();
