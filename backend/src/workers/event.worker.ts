// Import Worker and Job classes from BullMQ.
// Worker is used to process jobs from a queue.
// Job represents a single job in the queue.
import { Worker, Job } from "bullmq";

// Import the EventService to interact with the database (update event status).
import { EventService } from "../services/event.service";

// Import the EventStatus enum from Prisma client for type safety.
import { EventStatus } from "../../generated/prisma/client";

// Import the Redis connection configuration.
import { redisConnection, connectDb, disconnectDb } from "../config"; // Removed prisma import as it's not directly used here

// Define the interface for the data expected in a 'sendEvent' job.
// This ensures type safety when accessing job data.
interface SendEventJobData {
  eventId: string;
  recipientEmail: string;
  message: string;
}

/**
 * Define the maximum number of retries allowed for a failed event.
 * This is the application-level retry count, distinct from BullMQ's internal attempts.
 */
const MAX_RETRIES = 3;
/**
 * Define the base delay for retries in milliseconds.
 * This will be used for exponential backoff (e.g., 1s, 2s, 4s).
 */
const RETRY_DELAY_MS = 1000;

/**
 * Function to simulate sending a message.
 * This function introduces a random 10% chance of failure to test the retry mechanism.
 * In a real application, this would involve calling an external email/SMS service.
 * @param recipientEmail - The email address to send the message to.
 * @param message - The content of the message.
 * @returns A Promise that resolves to true if sending was successful, false otherwise.
 */
async function simulateSendMessage(
  recipientEmail: string,
  message: string
): Promise<boolean> {
  // Simulate network delay
  await new Promise((resolve) =>
    setTimeout(resolve, Math.random() * 500 + 100)
  ); // 100-600ms delay

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

/**
 * Creates and starts the BullMQ Worker for processing 'eventQueue' jobs.
 * This worker will listen for 'sendEvent' jobs and execute the message sending logic.
 */
const eventWorker = new Worker<SendEventJobData>(
  "eventQueue", // The name of the queue this worker will process jobs from. Must match the queue name in config.
  async (job: Job<SendEventJobData>) => {
    // This is the main processing function for each job.
    const { eventId, recipientEmail, message } = job.data;
    console.log(
      `Worker: Processing job ${job.id} for event ${eventId} (Attempt ${
        job.attemptsMade + 1
      }).`
    );

    try {
      // 1. Update event status to PROCESSING (optional, but good for visibility)
      // This is done before the actual send attempt to reflect that the job is being handled.
      await EventService.updateEventStatus(eventId, EventStatus.PROCESSING);

      // 2. Simulate sending the message
      const sendSuccess = await simulateSendMessage(recipientEmail, message);

      if (sendSuccess) {
        // If message sent successfully:
        // Update the event status in the database to SENT.
        await EventService.updateEventStatus(eventId, EventStatus.SENT);
        console.log(
          `Worker: Event ${eventId} successfully sent and marked as SENT.`
        );
      } else {
        // If message sending failed:
        // Retrieve the current event from the database to get its retry count.
        const event = await EventService.getEventDetails(eventId);

        if (!event) {
          console.error(
            `Worker: Event ${eventId} not found in DB during retry logic. Marking job as failed.`
          );
          throw new Error(`Event ${eventId} not found.`); // Fail the job if event not found
        }

        const currentRetryCount = event.retryCount;

        if (currentRetryCount < MAX_RETRIES) {
          // If retries are available:
          const nextRetryCount = currentRetryCount + 1;
          // Calculate exponential backoff delay: 1s, 2s, 4s...
          const retryDelay = RETRY_DELAY_MS * Math.pow(2, currentRetryCount);

          console.warn(
            `Worker: Event ${eventId} failed. Retrying (Attempt ${nextRetryCount}/${MAX_RETRIES}) in ${
              retryDelay / 1000
            } seconds.`
          );

          // Update event status to RETRIED and increment retry count in DB.
          await EventService.updateEventStatus(
            eventId,
            EventStatus.RETRIED,
            nextRetryCount
          );

          // For worker-driven retries with BullMQ, you would typically use job.retry()
          // or job.moveToDelayed(). However, since we are managing the retryCount
          // in the database and the prompt implies the worker should handle retries
          // by updating status, we'll throw an error to signal failure to BullMQ
          // and let the status in DB be the source of truth for external systems
          // (or a separate retry mechanism not explicitly built into this worker).
          // If you wanted BullMQ to automatically retry, you'd set `attempts` and `backoff`
          // in `eventQueue.add` (in event.service.ts) and simply throw an error here.
          throw new Error(
            "Simulated send failure, marking for potential retry by external system or monitoring."
          );
        } else {
          // If no more retries left:
          // Update event status to FAILED in the database.
          await EventService.updateEventStatus(eventId, EventStatus.FAILED);
          console.error(
            `Worker: Event ${eventId} failed permanently after ${currentRetryCount} retries.`
          );
          // Throw an error to mark the job as failed in BullMQ.
          throw new Error(`Event ${eventId} failed after maximum retries.`);
        }
      }
    } catch (error) {
      console.error(
        `Worker: Error processing job ${job.id} for event ${eventId}:`,
        error
      );
      // Re-throw the error to ensure BullMQ marks the job as failed.
      throw error;
    }
  },
  {
    connection: redisConnection, // Use the Redis connection defined in config.
    // Concurrency: How many jobs can be processed simultaneously by this worker instance.
    // Adjust based on your server's capacity and the nature of your jobs.
    concurrency: 5,
  }
);

// --- Worker Event Listeners (for logging and monitoring) ---

eventWorker.on("completed", (job: Job<SendEventJobData>) => {
  console.log(
    `Worker: Job ${job.id} for event ${job.data.eventId} completed successfully.`
  );
});

// Corrected type for the 'failed' event listener
eventWorker.on(
  "failed",
  (job: Job<SendEventJobData> | undefined, err: Error) => {
    // Check if job is defined before accessing its properties
    if (job) {
      console.error(
        `Worker: Job ${job.id} for event ${job.data.eventId} failed with error: ${err.message}`
      );
    } else {
      console.error(
        `Worker: A job failed, but job object was undefined. Error: ${err.message}`
      );
    }
    // console.error(err.stack); // Uncomment for more detailed stack trace
  }
);

eventWorker.on("error", (err: Error) => {
  // Errors that are not caught by the job processor (e.g., Redis connection issues)
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

// Fix: Cast 'close' to 'any' to bypass strict type checking for this specific event name.
// While 'close' is a valid runtime event, BullMQ's WorkerListener type might not explicitly list it.
eventWorker.on("close" as any, () => {
  console.log("Worker: Event worker closed.");
});

// --- Worker Initialization and Graceful Shutdown ---

// Function to start the worker
const startWorker = async () => {
  try {
    await connectDb(); // Connect to the database for worker operations

    console.log("Event Worker started and listening for jobs...");
  } catch (error) {
    console.error("Failed to start event worker:", error);
    process.exit(1);
  }
};

// Call the function to start the worker
startWorker();

// Handle graceful shutdown for the worker process
process.on("SIGINT", async () => {
  console.log("Worker: SIGINT signal received. Closing worker...");
  await eventWorker.close(); // Close the BullMQ worker
  await disconnectDb(); // Disconnect from database
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Worker: SIGTERM signal received. Closing worker...");
  await eventWorker.close(); // Close the BullMQ worker
  await disconnectDb(); // Disconnect from database
  process.exit(0);
});
