// Import Worker and Job classes from BullMQ.
import { Worker, Job } from "bullmq";

// Import the EventService to interact with the database
import { EventService } from "../services/event.service";

// Import the EventStatus enum from Prisma client for type safety.
import { EventStatus } from "../../generated/prisma/client";

// Import the Redis connection configuration.
import { redisConnection, connectDb, disconnectDb } from "../config";

// Import WebSocket utilities
import { initializeWebSocketRedis, closeWebSocketRedis } from "../utils/websocket";

// Define the interface for the data expected in a 'sendEvent' job.
interface SendEventJobData {
  eventId: string;
  recipientEmail: string;
  message: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function simulateSendMessage(
  recipientEmail: string,
  message: string
): Promise<boolean> {
  // Simulate network delay
  await new Promise((resolve) =>
    setTimeout(resolve, Math.random() * 500 + 100)
  );

  // Simulate a 10% chance of failure
  const success = Math.random() > 0.1;

  if (success) {
    console.log(
      `[SIMULATED SEND] Successfully sent message to ${recipientEmail}: "${message.substring(
        0,
        50
      )}..."`
    );
  } else {
    console.warn(
      `[SIMULATED SEND] Failed to send message to ${recipientEmail}. Simulating network error.`
    );
  }
  return success;
}

const eventWorker = new Worker<SendEventJobData>(
  "eventQueue",
  async (job: Job<SendEventJobData>) => {
    const { eventId, recipientEmail, message } = job.data;
    console.log(
      `Worker: Processing job ${job.id} for event ${eventId} (Attempt ${
        job.attemptsMade + 1
      }).`
    );

    try {
      // Update event status to PROCESSING
      await EventService.updateEventStatus(eventId, EventStatus.PROCESSING);

      // Simulate sending the message
      const sendSuccess = await simulateSendMessage(recipientEmail, message);

      if (sendSuccess) {
        // Update the event status to SENT
        await EventService.updateEventStatus(eventId, EventStatus.SENT);
        console.log(
          `Worker: Event ${eventId} successfully sent and marked as SENT.`
        );
      } else {
        // Handle failure and retry logic
        const event = await EventService.getEventDetails(eventId);

        if (!event) {
          console.error(
            `Worker: Event ${eventId} not found in DB during retry logic.`
          );
          throw new Error(`Event ${eventId} not found.`);
        }

        const currentRetryCount = event.retryCount;

        if (currentRetryCount < MAX_RETRIES) {
          const nextRetryCount = currentRetryCount + 1;
          const retryDelay = RETRY_DELAY_MS * Math.pow(2, currentRetryCount);

          console.warn(
            `Worker: Event ${eventId} failed. Retrying (Attempt ${nextRetryCount}/${MAX_RETRIES}) in ${
              retryDelay / 1000
            } seconds.`
          );

          await EventService.updateEventStatus(
            eventId,
            EventStatus.RETRIED,
            nextRetryCount
          );

          throw new Error(
            "Simulated send failure, marking for potential retry."
          );
        } else {
          await EventService.updateEventStatus(eventId, EventStatus.FAILED);
          console.error(
            `Worker: Event ${eventId} failed permanently after ${currentRetryCount} retries.`
          );
          throw new Error(`Event ${eventId} failed after maximum retries.`);
        }
      }
    } catch (error) {
      console.error(
        `Worker: Error processing job ${job.id} for event ${eventId}:`,
        error
      );
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

// Worker Event Listeners
eventWorker.on("completed", (job: Job<SendEventJobData>) => {
  console.log(
    `Worker: Job ${job.id} for event ${job.data.eventId} completed successfully.`
  );
});

eventWorker.on(
  "failed",
  (job: Job<SendEventJobData> | undefined, err: Error) => {
    if (job) {
      console.error(
        `Worker: Job ${job.id} for event ${job.data.eventId} failed with error: ${err.message}`
      );
    } else {
      console.error(
        `Worker: A job failed, but job object was undefined. Error: ${err.message}`
      );
    }
  }
);

eventWorker.on("error", (err: Error) => {
  console.error("Worker: An unexpected error occurred:", err);
});

eventWorker.on("active", (job: Job<SendEventJobData>) => {
  console.log(
    `Worker: Job ${job.id} for event ${job.data.eventId} is now active.`
  );
});

eventWorker.on("stalled", (jobId: string) => {
  console.warn(`Worker: Job ${jobId} has stalled.`);
});

eventWorker.on("close" as any, () => {
  console.log("Worker: Event worker closed.");
});

// Function to start the worker
const startWorker = async () => {
  try {
    await connectDb();
    
    // Initialize Redis for WebSocket broadcasting in the worker process
    initializeWebSocketRedis(redisConnection);
    
    console.log("Event Worker started and listening for jobs...");
  } catch (error) {
    console.error("Failed to start event worker:", error);
    process.exit(1);
  }
};

// Start the worker
startWorker();

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("Worker: SIGINT signal received. Closing worker...");
  await eventWorker.close();
  await disconnectDb();
  closeWebSocketRedis(); // Close Redis connections
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Worker: SIGTERM signal received. Closing worker...");
  await eventWorker.close();
  await disconnectDb();
  closeWebSocketRedis(); // Close Redis connections
  process.exit(0);
});