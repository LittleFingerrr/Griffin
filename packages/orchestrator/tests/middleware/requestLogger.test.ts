import { Request, Response, NextFunction } from "express";
import { requestLogger } from "../../src/middleware/requestLogger";

const mockReq = (overrides: Partial<Request> = {}): Request =>
  ({
    method: "GET",
    url: "/api/v1/test",
    headers: {},
    ip: "127.0.0.1",
    get: jest.fn().mockReturnValue("test-agent"),
    ...overrides,
  } as unknown as Request);

const mockRes = () => {
  const setHeader = jest.fn();
  const end = jest.fn();
  const res = {
    setHeader,
    end,
    statusCode: 200,
  } as unknown as Response;
  return { res, setHeader, end };
};

describe("requestLogger middleware", () => {
  it("attaches x-request-id to request headers", () => {
    const req = mockReq();
    const { res } = mockRes();
    const next: NextFunction = jest.fn();

    requestLogger(req, res, next);

    expect(req.headers["x-request-id"]).toBeDefined();
    expect(typeof req.headers["x-request-id"]).toBe("string");
  });

  it("sets x-request-id response header", () => {
    const req = mockReq();
    const { res, setHeader } = mockRes();
    const next: NextFunction = jest.fn();

    requestLogger(req, res, next);

    expect(setHeader).toHaveBeenCalledWith(
      "x-request-id",
      expect.any(String),
    );
  });

  it("calls next()", () => {
    const next = jest.fn();
    requestLogger(mockReq(), mockRes().res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("assigns a unique request ID per request", () => {
    const req1 = mockReq();
    const req2 = mockReq();
    const next: NextFunction = jest.fn();

    requestLogger(req1, mockRes().res, next);
    requestLogger(req2, mockRes().res, next);

    expect(req1.headers["x-request-id"]).not.toBe(req2.headers["x-request-id"]);
  });

  it("overrides res.end to log completion", () => {
    const req = mockReq();
    const { res, end } = mockRes();
    const next: NextFunction = jest.fn();

    requestLogger(req, res, next);

    // res.end should have been replaced
    expect(res.end).not.toBe(end);
  });
});
