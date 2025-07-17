// src/controllers/event.controller.ts

// Import necessary types from Express for request, response, and next function.
import { Request, Response, NextFunction } from "express";

// Import the EventService to access its business logic methods.
import { EventService } from "../services/event.service";

// Import the EventStatus enum for type checking and filtering.
import { EventStatus } from "../../generated/prisma/client";

/**
 * EventController class to handle incoming HTTP requests related to events.
 * It validates request data, calls the appropriate service methods, and sends back
 * HTTP responses. All methods are static, as requested.
 */
export class EventController {
  /**
   * Handles the POST /events request to schedule a new event.
   * Expects 'message', 'recipientEmail', and 'send_at' in the request body.
   * @param req - The Express request object.
   * @param res - The Express response object.
   * @param next - The Express next middleware function for error handling.
   */
  static async scheduleEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { message, recipientEmail, send_at } = req.body;

      // Basic input validation
      if (!message || typeof message !== "string") {
        res
          .status(400)
          .json({
            message: "Message content is required and must be a string.",
          });
        return;
      }
      if (
        !recipientEmail ||
        typeof recipientEmail !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)
      ) {
        res.status(400).json({ message: "Valid recipient email is required." });
        return;
      }
      if (!send_at || typeof send_at !== "string") {
        res
          .status(400)
          .json({
            message:
              "Send time (send_at) is required and must be a string (ISO 8601 format).",
          });
        return;
      }

      const sendAtDate = new Date(send_at);

      // Validate if send_at is a valid date
      if (isNaN(sendAtDate.getTime())) {
        res
          .status(400)
          .json({
            message:
              "Invalid send_at format. Please use ISO 8601 (e.g., 2025-07-14T15:30:00Z).",
          });
        return;
      }

      // Call the EventService to schedule the event.
      const newEvent = await EventService.scheduleEvent({
        message,
        recipientEmail,
        sendAt: sendAtDate,
      });

      // Respond with the created event and a 201 Created status.
      res.status(201).json({
        message: "Event scheduled successfully!",
        event: {
          id: newEvent.id,
          message: newEvent.message,
          recipientEmail: newEvent.recipientEmail,
          sendAt: newEvent.sendAt.toISOString(), // Return in ISO format
          status: newEvent.status,
        },
      });
    } catch (error) {
      // Pass the error to the next middleware for centralized error handling.
      console.error("Controller: Error scheduling event:", error);
      next(error);
    }
  }

  /**
   * Handles the GET /events request to list scheduled events.
   * Can optionally accept a 'status' query parameter to filter events.
   * @param req - The Express request object.
   * @param res - The Express response object.
   * @param next - The Express next middleware function for error handling.
   */
  static async listEvents(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { status } = req.query; // Get status from query parameters

      let filterStatus: EventStatus | undefined;

      // Validate the status query parameter if provided.
      if (status) {
        const statusString = status.toString().toUpperCase();
        if (Object.values(EventStatus).includes(statusString as EventStatus)) {
          filterStatus = statusString as EventStatus;
        } else {
          res
            .status(400)
            .json({
              message: `Invalid status provided. Allowed values are: ${Object.values(
                EventStatus
              ).join(", ")}`,
            });
          return;
        }
      }

      // Call the EventService to retrieve the list of events.
      const events = await EventService.listEvents(filterStatus);

      // Respond with the list of events.
      res.status(200).json({
        message: "Events retrieved successfully!",
        events: events.map((event) => ({
          id: event.id,
          message: event.message,
          recipientEmail: event.recipientEmail,
          sendAt: event.sendAt.toISOString(), // Return in ISO format
          status: event.status,
          retryCount: event.retryCount,
          createdAt: event.createdAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      // Pass the error to the next middleware for centralized error handling.
      console.error("Controller: Error listing events:", error);
      next(error);
    }
  }
}
