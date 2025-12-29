/**
 * Response from the Desktop Context Bridge
 */
export interface ContextResponse {
  /** Whether the request was successful */
  success: boolean;
  /** The context data payload */
  data: string;
  /** Where the data originated from */
  source: string;
}

/**
 * Health check response from the Desktop server
 */
export interface HealthResponse {
  status: "ok" | "error";
  timestamp: number;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
}

