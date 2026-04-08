import { type Request, type Response, type NextFunction } from "express";
import { logger } from "../utils/logger";
import { type ErrorResponse } from "../types";

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: Record<string, any>;

  constructor(message: string, statusCode: number, code: string, details?: Record<string, any>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = "AppError";
  }
}

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  // next: NextFunction,
): void => {
  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "An unexpected error occurred";
  let details: Record<string, any> | undefined;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error.name === "ValidationError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = error.message;
  } else if (error.name === "UnauthorizedError") {
    statusCode = 401;
    code = "UNAUTHORIZED";
    message = "Authentication required";
  }

  // Log error
  logger.error("Request error", {
    error: {
      message: error.message,
      stack: error.stack,
      code,
      statusCode,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
    },
  });

  const errorResponse: ErrorResponse = {
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId: req.headers["x-request-id"] as string,
    },
  };

  res.status(statusCode).json(errorResponse);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
