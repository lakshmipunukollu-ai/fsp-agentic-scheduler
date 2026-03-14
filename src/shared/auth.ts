/**
 * Shared JWT auth middleware — TypeScript/Express version
 * Used by FSP, ServiceCore backends
 */
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";

const SECRET = process.env.JWT_SECRET || "change-me";

export interface JwtPayload {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

export function createToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role }, SECRET, { expiresIn: "24h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) { res.status(401).json({ error: "Missing token" }); return; }
  try {
    (req as any).user = jwt.verify(token, SECRET) as JwtPayload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JwtPayload | undefined;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
