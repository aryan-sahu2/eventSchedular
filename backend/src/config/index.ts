import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "../../generated/prisma/client";

// Import Queue from 'bullmq' for setting up our message queue.
import { Queue } from "bullmq";

// --- Prisma Client Initialization ---
// Create a new instance of PrismaClient.
// This client will be used throughout the application to interact with the PostgreSQL database.
// Prisma automatically handles connection pooling.
export const prisma = new PrismaClient();

// --- Redis/BullMQ Queue Initialization ---
// Retrieve Redis host and port from environment variables.
// It's crucial to provide default values or ensure these are set in your .env file.
const redisHost = process.env.REDIS_HOST || "localhost";
const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);

// Define the connection options for Redis.
// This object will be passed to the BullMQ Queue and Worker constructors.
export const redisConnection = {
  host: redisHost,
  port: redisPort,
};

// Create a new BullMQ Queue instance for scheduling events.
// The queue name 'eventQueue' is arbitrary but should be consistent between
// the producer (API) and the consumer (worker).
// The connection option tells BullMQ how to connect to your Redis server.
export const eventQueue = new Queue("eventQueue", {
  connection: redisConnection,
  // Default job options can be set here. For example, 'attempts' for retries
  // or 'backoff' strategies. However, we'll manage retries manually for more control.
  defaultJobOptions: {
    removeOnComplete: true, // Remove job from queue when completed successfully
    removeOnFail: false, // Keep failed jobs for inspection (or set to true if not needed)
  },
});

// Function to connect to the database (Prisma)
// This function is asynchronous because PrismaClient.$connect() returns a Promise.
// It's good practice to explicitly connect, although Prisma often connects on the first query.
export async function connectDb() {
  try {
    await prisma.$connect();
    console.log("Database connected successfully!");
  } catch (error) {
    console.error("Error connecting to database:", error);
    process.exit(1); // Exit the process if database connection fails
  }
}

// Function to disconnect from the database (Prisma)
// This should be called when the application is shutting down to gracefully close connections.
export async function disconnectDb() {
  try {
    await prisma.$disconnect();
    console.log("Database disconnected.");
  } catch (error) {
    console.error("Error disconnecting database:", error);
  }
}

// Function to close the BullMQ queue gracefully.
// This should be called when the application is shutting down to prevent
// jobs from being lost or stuck.
export async function closeQueue() {
  try {
    await eventQueue.close();
    console.log("Event queue closed successfully!");
  } catch (error) {
    console.error("Error closing event queue:", error);
  }
}
