import { Request, Response, NextFunction } from "express";
import { AppError, errorHandler, asyncHandler } from "../../middleware/errorHandler";

const mockReq = (overrides: Partial<Request> = {}): Request =>
  ({
    method: "GET",
    url: "/test",
    headers: {},
    body: {},
    ...overrides,
  }) as unknown as Request;

const mockRes = (): { res: Response; status: jest.Mock; json: jest.Mock } => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json, setHeader: jest.fn() } as unknown as Response;
  return { res, status, json };
};

const mockNext: NextFunction = jest.fn();

describe("AppError", () => {
  it("constructs with correct properties", () => {
    const err = new AppError("Not found", 404, "NOT_FOUND", { id: "123" });
    expect(err.message).toBe("Not found");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.details).toEqual({ id: "123" });
    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });

  it("constructs without details", () => {
    const err = new AppError("Bad request", 400, "BAD_REQUEST");
    expect(err.details).toBeUndefined();
  });
});

describe("errorHandler middleware", () => {
  it("handles AppError with correct status and body", () => {
    const { res, status, json } = mockRes();
    const err = new AppError("Intent not found", 404, "INTENT_NOT_FOUND");

    errorHandler(err, mockReq(), res, mockNext);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "INTENT_NOT_FOUND",
          message: "Intent not found",
        }),
      }),
    );
  });

  it("handles ValidationError with 400", () => {
    const { res, status } = mockRes();
    const err = Object.assign(new Error("Invalid input"), {
      name: "ValidationError",
    });

    errorHandler(err, mockReq(), res, mockNext);

    expect(status).toHaveBeenCalledWith(400);
  });

  it("handles UnauthorizedError with 401", () => {
    const { res, status, json } = mockRes();
    const err = Object.assign(new Error("Unauthorized"), {
      name: "UnauthorizedError",
    });

    errorHandler(err, mockReq(), res, mockNext);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "UNAUTHORIZED" }),
      }),
    );
  });

  it("handles unknown errors with 500", () => {
    const { res, status, json } = mockRes();
    const err = new Error("Something exploded");

    errorHandler(err, mockReq(), res, mockNext);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      }),
    );
  });

  it("includes requestId from header when present", () => {
    const { res, json } = mockRes();
    const err = new AppError("Oops", 500, "ERR");
    const req = mockReq({ headers: { "x-request-id": "req-abc-123" } });

    errorHandler(err, req, res, mockNext);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ requestId: "req-abc-123" }),
      }),
    );
  });

  it("response body always has a timestamp", () => {
    const { res, json } = mockRes();
    errorHandler(new Error("boom"), mockReq(), res, mockNext);

    const body = json.mock.calls[0][0];
    expect(body.error.timestamp).toBeDefined();
    expect(new Date(body.error.timestamp).getTime()).not.toBeNaN();
  });
});

describe("asyncHandler", () => {
  it("calls next with error when async fn throws", async () => {
    const next = jest.fn();
    const err = new Error("async failure");
    const handler = asyncHandler(async () => {
      throw err;
    });

    await handler(mockReq(), mockRes().res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it("does not call next when async fn resolves", async () => {
    const next = jest.fn();
    const handler = asyncHandler(async () => {});

    await handler(mockReq(), mockRes().res, next);

    expect(next).not.toHaveBeenCalled();
  });
});
