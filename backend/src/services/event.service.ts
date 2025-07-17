import { Event, EventStatus } from "../../generated/prisma/client";
import {
  EventModel,
  CreateEventData,
  UpdateEventData,
} from "../models/event.model";

// Import the eventQueue instance from our configuration.
// This queue will be used to dispatch event processing jobs to the worker.
import { eventQueue } from "../config";

// Import the broadcastEventUpdate function from the websocket utility.
// This function will be used to push real-time updates to connected WebSocket clients.
import { broadcastEventUpdate } from "../utils/websocket";

/**
 * EventService class to encapsulate the business logic for event management.
 * It acts as an intermediary between the controllers and the data access layer (EventModel),
 * and also interacts with the queueing system (BullMQ).
 * All methods are static, as requested, for direct class access.
 */
export class EventService {
  /**
   * Schedules a new event.
   * This involves creating the event record in the database and then
   * adding a delayed job to the message queue for processing at the scheduled time.
   * @param data - The data for the new event (message, recipient email, send time).
   * @returns A Promise that resolves to the newly created Event object from the database.
   * @throws Error if the event creation or queueing fails.
   */
  static async scheduleEvent(data: CreateEventData): Promise<Event> {
    try {
      // 1. Create the event in the database.
      // This ensures persistence and provides an ID for the event.
      const newEvent = await EventModel.createEvent(data);
      console.log(`Service: Event ${newEvent.id} created in DB.`);

      // 2. Add a job to the BullMQ queue.
      // The 'delay' option is crucial here: it tells BullMQ to process this job
      // only after the specified time difference (sendAt - now).
      // The job data includes the event ID and recipient email, which the worker will use.
      const delay = newEvent.sendAt.getTime() - Date.now();

      // Ensure delay is not negative (for events scheduled in the past, process immediately)
      const effectiveDelay = Math.max(0, delay);

      const job = await eventQueue.add(
        "sendEvent", // Name of the job type, used by the worker to identify tasks
        {
          eventId: newEvent.id,
          recipientEmail: newEvent.recipientEmail,
          message: newEvent.message,
        },
        {
          delay: effectiveDelay, // Delay in milliseconds
          attempts: 1, // BullMQ's built-in retry mechanism; we'll handle retries manually for more control
          removeOnComplete: true, // Remove job from queue when successfully processed
          removeOnFail: false, // Keep failed jobs in the queue for inspection (or set to true)
          jobId: newEvent.id, // Use event ID as job ID for easier tracking
        }
      );
      console.log(
        `Service: Job ${job.id} added to queue for event ${newEvent.id} with delay ${effectiveDelay}ms.`
      );

      // 3. Broadcast the initial scheduled event status to connected clients
      // This ensures the frontend immediately sees the new event.
      broadcastEventUpdate({
        id: newEvent.id,
        message: newEvent.message,
        recipientEmail: newEvent.recipientEmail,
        sendAt: newEvent.sendAt.toISOString(),
        status: newEvent.status,
        retryCount: newEvent.retryCount,
        createdAt: newEvent.createdAt.toISOString(),
        updatedAt: newEvent.updatedAt.toISOString(),
      });

      return newEvent;
    } catch (error) {
      console.error("Error scheduling event:", error);
      throw new Error("Failed to schedule event.");
    }
  }

  /**
   * Retrieves a list of events from the database.
   * Can optionally filter events by their status.
   * @param status - Optional. The status to filter events by (e.g., 'SCHEDULED', 'SENT').
   * @returns A Promise that resolves to an array of Event objects.
   * @throws Error if fetching events from the database fails.
   */
  static async listEvents(status?: EventStatus): Promise<Event[]> {
    try {
      const events = await EventModel.listEvents(status);
      console.log(
        `Service: Found ${events.length} events with status ${status || "any"}.`
      );
      return events;
    } catch (error) {
      console.error("Error listing events:", error);
      throw new Error("Failed to retrieve events.");
    }
  }

  /**
   * Retrieves a single event by its ID.
   * @param id - The unique identifier of the event.
   * @returns A Promise that resolves to the Event object if found, or null.
   * @throws Error if fetching the event from the database fails.
   */
  static async getEventDetails(id: string): Promise<Event | null> {
    try {
      const event = await EventModel.getEventById(id);
      if (event) {
        console.log(`Service: Retrieved event ${event.id}.`);
      } else {
        console.log(`Service: Event ${id} not found.`);
      }
      return event;
    } catch (error) {
      console.error(`Error getting event details for ID ${id}:`, error);
      throw new Error("Failed to retrieve event details.");
    }
  }

  /**
   * Updates the status and optionally the retry count of an event.
   * This method will primarily be used by the event worker to update event states
   * after processing or retrying. After updating the database, it broadcasts
   * the updated event to all connected WebSocket clients.
   * @param id - The unique identifier of the event to update.
   * @param status - The new status for the event.
   * @param retryCount - Optional. The new retry count for the event.
   * @returns A Promise that resolves to the updated Event object.
   * @throws Error if the event update fails.
   */
  static async updateEventStatus(
    id: string,
    status: EventStatus,
    retryCount?: number
  ): Promise<Event> {
    try {
      const updateData: UpdateEventData = { status };
      if (retryCount !== undefined) {
        updateData.retryCount = retryCount;
      }
      const updatedEvent = await EventModel.updateEvent(id, updateData);
      console.log(
        `Service: Event ${id} status updated to ${status}. Retry count: ${updatedEvent.retryCount}`
      );

      // Broadcast the updated event to all connected WebSocket clients
      broadcastEventUpdate({
        id: updatedEvent.id,
        message: updatedEvent.message,
        recipientEmail: updatedEvent.recipientEmail,
        sendAt: updatedEvent.sendAt.toISOString(),
        status: updatedEvent.status,
        retryCount: updatedEvent.retryCount,
        createdAt: updatedEvent.createdAt.toISOString(),
        updatedAt: updatedEvent.updatedAt.toISOString(),
      });

      return updatedEvent;
    } catch (error) {
      console.error(`Error updating status for event ${id}:`, error);
      throw new Error("Failed to update event status.");
    }
  }
}
