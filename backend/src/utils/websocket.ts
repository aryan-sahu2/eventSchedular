// src/utils/websocket.ts
import { WebSocket } from 'ws';

// Store connected WebSocket clients
const connectedClients = new Set<WebSocket>();

// Function to add a client to the connected clients set
export function addWebSocketClient(ws: WebSocket): void {
  connectedClients.add(ws);
  
  // Remove client when connection closes
  ws.on('close', () => {
    connectedClients.delete(ws);
  });
}

// Function to broadcast event updates to all connected clients
export function broadcastEventUpdate(eventData: any): void {
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
  
  console.log(`Broadcasted event update to ${connectedClients.size} clients`);
}