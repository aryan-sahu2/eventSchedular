import { Router } from "express";
import { EventController } from "../controllers/event.controller";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Events
 *   description: API for managing scheduled events and notifications.
 */

/**
 * @swagger
 * /events:
 *   post:
 *     summary: Schedule a new event message.
 *     tags: [Events]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - recipientEmail
 *               - send_at
 *             properties:
 *               message:
 *                 type: string
 *                 description: The content of the message to be sent.
 *                 example: "Hello from the scheduler service!"
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *                 description: The email address to which the message should be sent.
 *                 example: "user@example.com"
 *               send_at:
 *                 type: string
 *                 format: date-time
 *                 description: The ISO 8601 formatted datetime string when the message should be sent.
 *                 example: "2025-07-20T10:00:00Z"
 *     responses:
 *       201:
 *         description: Event scheduled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Event scheduled successfully!"
 *                 event:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                     message:
 *                       type: string
 *                       example: "Hello from the scheduler service!"
 *                     recipientEmail:
 *                       type: string
 *                       example: "user@example.com"
 *                     sendAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-07-20T10:00:00Z"
 *                     status:
 *                       type: string
 *                       enum: [SCHEDULED, SENT, FAILED, RETRIED, PROCESSING]
 *                       example: "SCHEDULED"
 *       400:
 *         description: Invalid input.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Message content is required and must be a string."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to schedule event."
 */
router.post("/events", EventController.scheduleEvent);

/**
 * @swagger
 * /events:
 *   get:
 *     summary: Retrieve a list of all scheduled events.
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SCHEDULED, SENT, FAILED, RETRIED, PROCESSING]
 *         description: Filter events by their current status.
 *         example: SCHEDULED
 *     responses:
 *       200:
 *         description: A list of events successfully retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Events retrieved successfully!"
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                       message:
 *                         type: string
 *                         example: "Hello from the scheduler service!"
 *                       recipientEmail:
 *                         type: string
 *                         example: "user@example.com"
 *                       sendAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-07-20T10:00:00Z"
 *                       status:
 *                         type: string
 *                         enum: [SCHEDULED, SENT, FAILED, RETRIED, PROCESSING]
 *                         example: "SCHEDULED"
 *                       retryCount:
 *                         type: integer
 *                         example: 0
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-07-19T08:00:00Z"
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-07-19T08:00:00Z"
 *       400:
 *         description: Invalid status query parameter.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid status provided. Allowed values are: SCHEDULED, SENT, FAILED, RETRIED, PROCESSING"
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to retrieve events."
 */
router.get("/events", EventController.listEvents);

export default router;
