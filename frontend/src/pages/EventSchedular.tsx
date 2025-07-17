import React, { useState, useEffect, type FormEvent } from "react";
import axios from "axios";
import { format } from "date-fns"; // For date formatting and parsing
import { parseISO } from "date-fns/fp";


// Define the base URL for your backend API (HTTP for REST calls)
const API_BASE_URL = "http://localhost:3000/api";
// Define the WebSocket URL for your backend (ws for WebSocket connection)
const WS_URL = "ws://localhost:3000";

// Define the type for an Event object received from the backend
interface Event {
  id: string;
  message: string;
  recipientEmail: string;
  sendAt: string; // ISO string from backend
  status: "SCHEDULED" | "SENT" | "FAILED" | "RETRIED" | "PROCESSING";
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

// Main EventSchedular component
const EventSchedular: React.FC = () => {
  // State for the new event form
  const [message, setMessage] = useState<string>("");
  const [recipientEmail, setRecipientEmail] = useState<string>("");
  const [sendAt, setSendAt] = useState<string>(""); // Date and time input string

  // State for displaying events
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // State for filtering events by status
  const [filterStatus, setFilterStatus] = useState<string>("");

  // WebSocket instance
  const [_ws, setWs] = useState<WebSocket | null>(null);

  // Function to fetch events from the backend (initial load and filter changes)
  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filterStatus
        ? `${API_BASE_URL}/events?status=${filterStatus}`
        : `${API_BASE_URL}/events`;
      const response = await axios.get<any>(url);
      setEvents(response.data.events);
    } catch (err) {
      console.error("Error fetching events:", err);
      setError("Failed to fetch events. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Effect for WebSocket connection and initial data fetch
  useEffect(() => {
    // 1. Initial fetch of events
    fetchEvents();

    // 2. Establish WebSocket connection
    const websocket = new WebSocket(WS_URL);

    websocket.onopen = () => {
      console.log("WebSocket connection established.");
      // You might want to send an initial message or authenticate here if needed
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "EVENT_UPDATE" && data.payload) {
        const updatedEvent: Event = {
          ...data.payload,
          // Ensure dates are parsed correctly if they come as ISO strings
          sendAt: data.payload.sendAt,
          createdAt: data.payload.createdAt,
          updatedAt: data.payload.updatedAt,
        };

        // Update the events list based on the incoming update
        setEvents((prevEvents) => {
          const existingIndex = prevEvents.findIndex(
            (e) => e.id === updatedEvent.id
          );
          if (existingIndex > -1) {
            // If event exists, update it
            const newEvents = [...prevEvents];
            newEvents[existingIndex] = updatedEvent;
            return newEvents;
          } else {
            // If event is new (e.g., just scheduled), add it
            return [...prevEvents, updatedEvent];
          }
        });
      }
    };

    websocket.onclose = () => {
      console.log("WebSocket connection closed.");
      // Implement a reconnect logic here if persistent connection is critical
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setError(
        "WebSocket connection error. Live updates may not be available."
      );
    };

    setWs(websocket);

    // Cleanup function: close WebSocket connection when component unmounts
    return () => {
      websocket.close();
    };
  }, []); // Empty dependency array means this effect runs once on mount and cleans up on unmount

  // Effect for filtering events (re-fetches via REST API when filter changes)
  useEffect(() => {
    fetchEvents();
  }, [filterStatus]);

  // Handle form submission for scheduling a new event
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    // Basic client-side validation
    if (!message || !recipientEmail || !sendAt) {
      setError("All fields are required.");
      setLoading(false);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    try {
      // Convert local datetime string to ISO 8601 UTC string for the backend
      const sendAtISO = new Date(sendAt).toISOString();

      await axios.post(`${API_BASE_URL}/events`, {
        message,
        recipientEmail,
        send_at: sendAtISO,
      });
      setSuccessMessage("Event scheduled successfully!");
      setMessage("");
      setRecipientEmail("");
      setSendAt(""); // Clear the date/time input
      // No need to call fetchEvents() here, as WebSocket will push the update
    } catch (err: any) {
      console.error("Error scheduling event:", err);
      // Check if the error response has a specific message from the backend
      if (err.response && err.response.data && err.response.data.message) {
        setError(err.response.data.message);
      } else {
        setError("Failed to schedule event. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get status color for display
  const getStatusColor = (status: Event["status"]) => {
    switch (status) {
      case "SCHEDULED":
        return "text-blue-500";
      case "SENT":
        return "text-green-500";
      case "FAILED":
        return "text-red-500";
      case "RETRIED":
        return "text-yellow-600";
      case "PROCESSING":
        return "text-purple-500";
      default:
        return "text-gray-500";
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-1 font-inter">
      <div className="w-full max-w-4xl bg-white p-8 rounded-lg shadow-xl">
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-8">
          Event Scheduler Service
        </h1>

        {/* Schedule Event Form */}
        <div className="mb-12 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <h2 className="text-2xl font-semibold text-gray-700 mb-6">
            Schedule New Event
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Message Content
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-y"
                placeholder="Enter your message here..."
                required
              ></textarea>
            </div>
            <div>
              <label
                htmlFor="recipientEmail"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Recipient Email
              </label>
              <input
                type="email"
                id="recipientEmail"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="e.g., user@example.com"
                required
              />
            </div>
            <div>
              <label
                htmlFor="sendAt"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Send At (Date & Time)
              </label>
              <input
                type="datetime-local"
                id="sendAt"
                value={sendAt}
                onChange={(e) => setSendAt(e.target.value)}
                className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              />
            </div>
            {error && (
              <div
                className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md text-sm"
                role="alert"
              >
                {error}
              </div>
            )}
            {successMessage && (
              <div
                className="p-3 bg-green-100 border border-green-400 text-green-700 rounded-md text-sm"
                role="alert"
              >
                {successMessage}
              </div>
            )}
            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
              disabled={loading}
            >
              {loading ? "Scheduling..." : "Schedule Event"}
            </button>
          </form>
        </div>

        {/* List Scheduled Events */}
        <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-700 mb-6">
            Scheduled Events
          </h2>

          <div className="mb-4 flex items-center space-x-4">
            <label
              htmlFor="statusFilter"
              className="text-sm font-medium text-gray-700"
            >
              Filter by Status:
            </label>
            <select
              id="statusFilter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="">All</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
              <option value="RETRIED">Retried</option>
              <option value="PROCESSING">Processing</option>
            </select>
            {/* Refresh button is still useful for re-fetching if WS disconnects or for explicit refresh */}
            <button
              onClick={fetchEvents}
              className="ml-auto py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition duration-150 ease-in-out"
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          {loading && (
            <p className="text-center text-gray-600">Loading events...</p>
          )}
          {error && !loading && (
            <div
              className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md text-sm mb-4"
              role="alert"
            >
              {error}
            </div>
          )}

          {events.length === 0 && !loading && !error && (
            <p className="text-center text-gray-500">No events found.</p>
          )}

          {events.length > 0 && (
            <div className="overflow-x-auto rounded-lg shadow border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Message
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Recipient
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Send At
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Retries
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {events
                    .filter((event) =>
                      filterStatus ? event.status === filterStatus : true
                    ) // Apply client-side filter for WS updates
                    .map((event) => (
                      <tr key={event.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {event.message.length > 50
                            ? `${event.message.substring(0, 50)}...`
                            : event.message}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {event.recipientEmail}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(
                            parseISO(event.sendAt),
                            "MMM dd, yyyy HH:mm:ss"
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                              event.status
                            )} bg-opacity-10`}
                          >
                            {event.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {event.retryCount}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventSchedular;
