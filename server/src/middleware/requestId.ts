import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface RequestWithId extends Request {
  id?: string;
}

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction) {
  const incomingId = req.headers['x-request-id'];
  const reqId = (typeof incomingId === 'string' && incomingId.trim().length > 0)
    ? incomingId.trim()
    : `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
}
