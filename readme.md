# Event Notification Scheduler Service

## Overview

This project implements a robust and scalable scheduler service designed to handle event notifications for a high volume of users (e.g., 10,000 daily users). It allows users to schedule messages to be sent at a future time, track their status in real-time, and simulates sending these messages to recipients. The architecture is built with scalability, resilience, and real-time updates in mind, leveraging modern web technologies and a message queue system.

## Features

### Functional Requirements

- **Create an Event**: Users can specify message content, a recipient email, and the exact date/time for the message to be sent.
- **List Scheduled Events**: Users can view a list of all upcoming and past events, with the ability to filter by status.
- **Event Execution**: A dedicated backend worker processes events at their scheduled time.
- **Retry Failed Events**: If message sending fails (simulated with a 10% random chance), the system automatically retries up to 3 times with exponential backoff.
- **Live Status Updates (WebSockets)**: The frontend displays real-time updates on event statuses (e.g., SCHEDULED, PROCESSING, SENT, RETRIED, FAILED) using WebSocket connections.

## API Endpoints

### POST /api/events
Schedule a new event.

**Request Body:**
```json
{
  "message": "string",
  "recipientEmail": "string",
  "send_at": "ISO 8601 datetime string"
}
```

**Response:** 201 Created with the scheduled event details.

### GET /api/events
Retrieve a list of scheduled events.

**Query Parameter (Optional):** `status` (e.g., SCHEDULED, SENT, FAILED, RETRIED, PROCESSING)

**Response:** 200 OK with an array of event objects.

## Tech Stack

- **Backend**: Node.js (Express.js, TypeScript)
- **Frontend**: React (TypeScript, Vite, Tailwind CSS)
- **Database**: PostgreSQL (with Prisma ORM)
- **Queueing System**: Redis (as message broker) with BullMQ (for job scheduling and processing)
- **Real-time Communication**: WebSockets (ws library)
- **API Documentation**: Swagger/OpenAPI (via swagger-jsdoc and swagger-ui-express)

## Architecture

The system follows a decoupled, asynchronous architecture to ensure high availability and scalability:

### Components

1. **React Frontend**: Provides a user interface to schedule events and displays their live status updates.

2. **Node.js Backend (API Server)**:
   - Receives HTTP requests from the frontend (e.g., to schedule an event)
   - Persists event data to PostgreSQL via Prisma
   - Crucially, it adds events as jobs to a Redis-backed queue (BullMQ) with a specified delay. It does not directly send messages
   - Broadcasts real-time event updates to connected frontend clients via WebSockets

3. **Redis Server**: Acts as a high-performance message broker for BullMQ. It stores job data and manages job queues.

4. **Node.js Worker**:
   - A separate, dedicated process that constantly listens to the BullMQ queue
   - Picks up jobs (events) when their scheduled time arrives
   - Simulates the message sending process
   - Implements the retry logic for failed sends, updating event status and retry counts in PostgreSQL
   - Triggers WebSocket broadcasts through the EventService to update the frontend

5. **PostgreSQL Database**: The primary data store for all event records, their statuses, and retry counts. Prisma ORM provides an elegant and type-safe way to interact with the database.

### Architecture Benefits

This architecture ensures:

- **Decoupling**: The API server is freed from the time-consuming task of sending messages, responding quickly to user requests.
- **Asynchronous Processing**: Message sending happens in the background, improving user experience.
- **Scalability**: Both the API servers and workers can be scaled horizontally (by adding more instances) to handle increased load, with Redis efficiently distributing jobs.
- **Resilience**: Jobs are persisted in Redis, so if a worker crashes, the job is not lost and can be picked up by another worker. Failed sends are retried automatically.
- **Real-time Experience**: WebSockets provide instant feedback on event status changes.

## Scalability for 10,000 Daily Users

This architecture is well-suited for handling high traffic like 10,000 daily users due to several design choices:

- **Load Balancing (Conceptual)**: The stateless nature of the Node.js API server allows it to be easily deployed behind a load balancer. This distributes incoming requests across multiple backend instances, preventing any single server from becoming a bottleneck.

- **Asynchronous Event Processing with Queueing**: Instead of directly processing events, the API server offloads the task to a message queue (Redis/BullMQ). This means the API can handle a high volume of incoming scheduling requests very quickly, as it only needs to write to Redis, which is extremely fast.

- **Dedicated Workers**: The message sending and retry logic are handled by separate worker processes. You can spin up multiple worker instances to increase throughput for event processing, scaling independently of the API.

- **Connection Pooling (Prisma)**: Prisma automatically manages database connection pooling, ensuring efficient and optimized use of database resources from multiple backend instances.

- **Real-time Updates (WebSockets)**: WebSockets reduce the need for constant polling from the frontend, significantly reducing unnecessary HTTP traffic and server load, especially with many concurrent users.

## Local Setup Guide

Follow these steps to get the project running on your local machine.

### Prerequisites

- Node.js (v18 or higher recommended) & npm
- PostgreSQL (v14 or higher recommended)
- Redis (v6 or higher recommended). Docker is the easiest way to run Redis.

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd scheduler-service
```

### 2. Backend Setup

Navigate into the backend directory (assuming your backend code is in a backend folder, if not, adjust paths accordingly).

```bash
# If your backend code is directly in the root, skip this `cd`
# cd backend
```

#### Install Dependencies

```bash
npm install
```

#### Configure Environment Variables

Create a `.env` file in the root of your backend project (e.g., `scheduler-service/.env`) and add the following, replacing placeholders with your actual PostgreSQL credentials:

```env
# .env
DATABASE_URL="postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/scheduler_db?schema=public"
REDIS_HOST="localhost"
REDIS_PORT=6379
PORT=3000
```

#### Start PostgreSQL

Ensure your PostgreSQL server is running. Create a database named `scheduler_db` (or whatever you configure in `DATABASE_URL`).

Example using psql:

```sql
CREATE DATABASE scheduler_db;
```

#### Start Redis

The easiest way to run Redis locally is using Docker:

```bash
docker run --name my-redis -p 6379:6379 -d redis/redis-stack-server:latest
```

If you don't have Docker, you can install Redis directly for your OS (refer to Redis official documentation).

#### Run Prisma Migrations

This will create the necessary tables in your `scheduler_db` database.

```bash
npx prisma migrate dev --name init
```

Follow the prompts (type `y` and Enter).

#### Start the Backend API Server

Open your first terminal window and run:

```bash
npm run dev
```

You should see output indicating the server is running on port 3000.

#### Start the Event Worker

Open your second terminal window (keep the first one running) and run:

```bash
npm run worker:dev
```

You should see output indicating the worker has started and is listening for jobs.

### 3. Frontend Setup

Navigate into your React project directory (assuming it's a separate folder, e.g., `frontend`).

```bash
# cd frontend
```

#### Install Dependencies

```bash
npm install
```

#### Start the Frontend Development Server

Open your third terminal window and run:

```bash
npm run dev
```

This will start your React application, typically on `http://localhost:5173` (Vite's default).

### 4. Accessing the Application

- **Frontend UI**: Open your browser and navigate to `http://localhost:5173` (or the port Vite indicates).
- **API Documentation (Swagger UI)**: While your backend server is running, you can access the interactive API documentation at `http://localhost:3000/api-docs`.

## API Documentation (Swagger UI)

The backend provides interactive API documentation using Swagger UI. Once the backend server is running (`npm run dev`), open your web browser and go to:

```
http://localhost:3000/api-docs
```

Here you can explore the available endpoints (`/api/events`), their expected request bodies, and example responses. You can also directly test the API calls from this interface.

## Future Enhancements (Bonus Features)

- **Authentication**: Implement user login/registration to allow users to schedule and view only their own events.
- **Event Categories/Priorities**: Add fields to categorize events or assign different processing priorities.
- **Notification Channels**: Extend `simulateSendMessage` to integrate with actual email services (e.g., SendGrid, Nodemailer), SMS gateways, or other notification platforms.
- **Dashboard**: A more comprehensive dashboard for administrators to monitor queue health, failed jobs, and system metrics.
- **Error Reporting**: Integrate with an error tracking service (e.g., Sentry, Bugsnag).
- **Horizontal Scaling for Redis**: For extremely high loads, consider Redis Cluster or managed Redis services.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request