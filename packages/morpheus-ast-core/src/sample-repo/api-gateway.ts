/**
 * sample-repo/api-gateway.ts
 *
 * Pre-loaded serverless sample: API Gateway handler with intentional
 * code quality issues that the PBT suite and both apps can demonstrate.
 *
 * Issues embedded (for demo purposes):
 *   - HIGH complexity router (CC = 18) → triggers Boss Room / Poltergeist Demon
 *   - No try/catch on database call → uncaught exception path
 *   - Prototype-pollution sink (Object.assign with user input)
 *   - Unused variable: unusedTimeout
 *   - Circular dependency with user-service (via import)
 */

import { UserService } from "./user-service.js";
import { DatabaseClient } from "./database-client.js";

const db = new DatabaseClient();
const userService = new UserService();

/** Routes an incoming HTTP request to the appropriate handler. */
export async function routeRequest(
  method: string,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  // Intentional: unusedTimeout is never read — Zombie Variable demo
  const unusedTimeout = 30000;

  if (method === "GET") {
    if (path === "/users") {
      return handleGetUsers(headers);
    } else if (path === "/health") {
      return { statusCode: 200, body: JSON.stringify({ status: "ok" }) };
    } else if (path === "/metrics") {
      return handleGetMetrics(headers);
    } else if (path === "/config") {
      return handleGetConfig(headers);
    } else {
      return { statusCode: 404, body: JSON.stringify({ error: "Not Found" }) };
    }
  } else if (method === "POST") {
    if (path === "/users") {
      return handleCreateUser(body, headers);
    } else if (path === "/login") {
      return handleLogin(body);
    } else if (path === "/upload") {
      return handleUpload(body, headers);
    } else if (path === "/webhook") {
      return handleWebhook(body, headers);
    } else {
      return { statusCode: 404, body: JSON.stringify({ error: "Not Found" }) };
    }
  } else if (method === "PUT") {
    if (path.startsWith("/users/")) {
      return handleUpdateUser(path, body, headers);
    } else if (path.startsWith("/config/")) {
      return handleUpdateConfig(path, body, headers);
    } else {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }
  } else if (method === "DELETE") {
    if (path.startsWith("/users/")) {
      return handleDeleteUser(path, headers);
    } else {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }
  } else {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }
}

/** Gets all users — no try/catch: uncaught exception path. */
async function handleGetUsers(
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  // Intentional: no try/catch — triggers Poltergeist Demon in App 2,
  // triggers Chaos Fault cascading failure in App 1
  const users = await db.query("SELECT * FROM users");
  return { statusCode: 200, body: JSON.stringify(users) };
}

/** Gets metrics with try/catch — this function is protected. */
async function handleGetMetrics(
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  try {
    const metrics = await db.query("SELECT COUNT(*) FROM events");
    return { statusCode: 200, body: JSON.stringify(metrics) };
  } catch (err: unknown) {
    return { statusCode: 500, body: JSON.stringify({ error: "DB error" }) };
  }
}

/** Gets config — no try/catch on deep merge (prototype pollution risk). */
async function handleGetConfig(
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  const defaults = { timeout: 5000, retries: 3 };
  const userConfig = await db.query("SELECT config FROM settings LIMIT 1");
  // Intentional: Object.assign with untrusted DB output — prototype pollution sink
  const merged = Object.assign({}, defaults, userConfig);
  return { statusCode: 200, body: JSON.stringify(merged) };
}

/** Creates a user — no input size validation (extreme payload vulnerability). */
async function handleCreateUser(
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  // Intentional: no payload size check — EXTREME_PAYLOAD fault vector
  const user = await userService.create(body);
  return { statusCode: 201, body: JSON.stringify(user) };
}

async function handleLogin(
  body: Record<string, unknown>
): Promise<{ statusCode: number; body: string }> {
  try {
    const token = await userService.login(
      body["email"] as string,
      body["password"] as string
    );
    return { statusCode: 200, body: JSON.stringify({ token }) };
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
}

async function handleUpload(
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  const result = await db.query("INSERT INTO uploads VALUES (?)", [body]);
  return { statusCode: 200, body: JSON.stringify(result) };
}

async function handleWebhook(
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  const event = await userService.processWebhook(body);
  return { statusCode: 200, body: JSON.stringify(event) };
}

async function handleUpdateUser(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  const id = path.split("/")[2];
  const updated = await userService.update(id ?? "", body);
  return { statusCode: 200, body: JSON.stringify(updated) };
}

async function handleUpdateConfig(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  const key = path.split("/")[2];
  const result = await db.query("UPDATE settings SET config=? WHERE key=?", [body, key]);
  return { statusCode: 200, body: JSON.stringify(result) };
}

async function handleDeleteUser(
  path: string,
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  const id = path.split("/")[2];
  await db.query("DELETE FROM users WHERE id=?", [id]);
  return { statusCode: 204, body: "" };
}
