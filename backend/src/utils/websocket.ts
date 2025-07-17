// utils/websocket.ts
import { WebSocket } from 'ws';
import Redis from 'ioredis';

// This will be set by the server.ts file
let connectedClients: Set<WebSocket> | null = null;
let redisPublisher: Redis | null = null;
let redisSubscriber: Redis | null = null;

// Function to initialize Redis connections for WebSocket broadcasting
export function initializeWebSocketRedis(redisConfig: any): void {
  redisPublisher = new Redis(redisConfig);
  redisSubscriber = new Redis(redisConfig);
  
  // Subscribe to the WebSocket broadcast channel
  redisSubscriber.subscribe('websocket:broadcast');
  
  // Listen for broadcast messages from Redis
  redisSubscriber.on('message', (channel, message) => {
    if (channel === 'websocket:broadcast' && connectedClients) {
      const eventData = JSON.parse(message);
      broadcastToClients(eventData);
    }
  });
}

// Function to set the clients Set from server.ts
export function setWebSocketClients(clients: Set<WebSocket>): void {
  connectedClients = clients;
}

// Function to add a client to the connected clients set
export function addWebSocketClient(ws: WebSocket): void {
  if (connectedClients) {
    connectedClients.add(ws);
    
    // Remove client when connection closes
    ws.on('close', () => {
      connectedClients?.delete(ws);
    });
  }
}

// Internal function to broadcast to actual WebSocket clients
function broadcastToClients(eventData: any): void {
  if (!connectedClients) {
    console.error('WebSocket clients not initialized');
    return;
  }

  const message = JSON.stringify({
    type: 'eventUpdate',
    data: eventData
  });

  // Send to all connected clients
  connectedClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  
  console.log(`Broadcasted event update to ${connectedClients.size} clients from websocket.ts`);
}

// Function to broadcast event updates - works from any process
export function broadcastEventUpdate(eventData: any): void {
  if (redisPublisher) {
    // If we have a Redis publisher, send via Redis (for worker processes)
    redisPublisher.publish('websocket:broadcast', JSON.stringify(eventData));
    console.log('Published event update to Redis for broadcasting');
  } else {
    // If no Redis publisher, broadcast directly (for server process)
    broadcastToClients(eventData);
  }
}

// Function to close Redis connections
export function closeWebSocketRedis(): void {
  if (redisPublisher) {
    redisPublisher.disconnect();
  }
  if (redisSubscriber) {
    redisSubscriber.disconnect();
  }
}