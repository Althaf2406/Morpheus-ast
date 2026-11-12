/**
 * sample-repo/user-service.ts
 *
 * Pre-loaded sample: User service with circular dependency back to api-gateway
 * and a high-complexity validation function.
 *
 * Issues embedded:
 *   - Circular dependency: UserService → ApiGateway (via audit log call)
 *   - validateUserInput: CC = 16 → Boss Room
 *   - processWebhook: no try/catch → uncaught exception path
 */

import { DatabaseClient } from "./database-client.js";

const db = new DatabaseClient();

export class UserService {
  async create(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const validated = validateUserInput(data);
    const result = await db.query("INSERT INTO users VALUES (?)", [validated]);
    return result as Record<string, unknown>;
  }

  async login(email: string, password: string): Promise<string> {
    try {
      const user = await db.query("SELECT * FROM users WHERE email=?", [email]);
      if (user == null) throw new Error("User not found");
      return `token-${Date.now()}`;
    } catch (err: unknown) {
      throw new Error("Login failed");
    }
  }

  async update(
    id: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const validated = validateUserInput(data);
    const result = await db.query("UPDATE users SET data=? WHERE id=?", [validated, id]);
    return result as Record<string, unknown>;
  }

  /** No try/catch — intentional uncaught exception path */
  async processWebhook(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const event = await db.query("INSERT INTO events VALUES (?)", [payload]);
    return event as Record<string, unknown>;
  }
}

/**
 * User input validator — intentionally high complexity (CC ≈ 16).
 * Triggers Boss Room in NECRO-COMPILER and Poltergeist Demon.
 */
export function validateUserInput(data: Record<string, unknown>): Record<string, unknown> {
  if (data == null) throw new Error("Data is null");

  if (typeof data["email"] !== "string") throw new Error("email must be string");
  if (data["email"].length === 0) throw new Error("email is empty");
  if (!data["email"].includes("@")) throw new Error("email is invalid");

  if (data["password"] !== undefined) {
    if (typeof data["password"] !== "string") throw new Error("password must be string");
    if ((data["password"] as string).length < 8) throw new Error("password too short");
    if (!(data["password"] as string).match(/[A-Z]/)) throw new Error("password needs uppercase");
    if (!(data["password"] as string).match(/[0-9]/)) throw new Error("password needs digit");
    if (!(data["password"] as string).match(/[^A-Za-z0-9]/)) throw new Error("password needs symbol");
  }

  if (data["age"] !== undefined) {
    if (typeof data["age"] !== "number") throw new Error("age must be number");
    if ((data["age"] as number) < 0) throw new Error("age cannot be negative");
    if ((data["age"] as number) > 150) throw new Error("age too large");
  }

  if (data["role"] !== undefined) {
    const validRoles = ["admin", "user", "moderator"];
    if (!validRoles.includes(data["role"] as string)) throw new Error("invalid role");
  }

  if (data["metadata"] !== undefined) {
    if (typeof data["metadata"] !== "object") throw new Error("metadata must be object");
    if (Array.isArray(data["metadata"])) throw new Error("metadata cannot be array");
  }

  return data;
}
