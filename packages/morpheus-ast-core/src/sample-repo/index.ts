/**
 * sample-repo/index.ts
 *
 * Pre-loaded Serverless Sample Repository — virtual source fixture.
 *
 * The three sample files are stored as source-text strings rather than
 * compiled TypeScript modules. This keeps them out of the TS compiler's
 * strict-unused-variable/parameter checks while still providing real,
 * syntactically valid TypeScript for the AST parser to analyse at runtime.
 *
 * Both apps load SAMPLE_REPO_SOURCES via contracts.ts ParseRequest to
 * populate their demo view without any login or file upload.
 *
 * Intentional faults embedded in the fixture (exercised by both apps):
 *   - routeRequest (CC ≥ 18)              → high-complexity analysis
 *   - validateUserInput (CC ≥ 16)         → high-complexity analysis
 *   - handleGetUsers: no try/catch        → uncaught exception path
 *   - handleGetConfig: Object.assign      → prototype-pollution taint path
 *   - handleCreateUser: no size check     → extreme-payload fault vector
 *   - UserService → DatabaseClient        → circular dependency detection
 *   - unusedTimeout                       → unused variable detection
 */

/** Virtual source text for api-gateway.ts */
export const API_GATEWAY_SOURCE = `
import { UserService } from "./user-service";
import { DatabaseClient } from "./database-client";

const db = new DatabaseClient();
const userService = new UserService();

export async function routeRequest(
  method: string,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  const unusedTimeout = 30000;
  if (method === "GET") {
    if (path === "/users") { return handleGetUsers(headers); }
    else if (path === "/health") { return { statusCode: 200, body: JSON.stringify({ status: "ok" }) }; }
    else if (path === "/metrics") { return handleGetMetrics(headers); }
    else if (path === "/config") { return handleGetConfig(headers); }
    else { return { statusCode: 404, body: JSON.stringify({ error: "Not Found" }) }; }
  } else if (method === "POST") {
    if (path === "/users") { return handleCreateUser(body, headers); }
    else if (path === "/login") { return handleLogin(body); }
    else if (path === "/upload") { return handleUpload(body, headers); }
    else if (path === "/webhook") { return handleWebhook(body, headers); }
    else { return { statusCode: 404, body: JSON.stringify({ error: "Not Found" }) }; }
  } else if (method === "PUT") {
    if (path.startsWith("/users/")) { return handleUpdateUser(path, body, headers); }
    else if (path.startsWith("/config/")) { return handleUpdateConfig(path, body, headers); }
    else { return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) }; }
  } else if (method === "DELETE") {
    if (path.startsWith("/users/")) { return handleDeleteUser(path, headers); }
    else { return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) }; }
  } else {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }
}

async function handleGetUsers(headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  const users = await db.query("SELECT * FROM users");
  return { statusCode: 200, body: JSON.stringify(users) };
}

async function handleGetMetrics(headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  try {
    const metrics = await db.query("SELECT COUNT(*) FROM events");
    return { statusCode: 200, body: JSON.stringify(metrics) };
  } catch (err: unknown) {
    return { statusCode: 500, body: JSON.stringify({ error: "DB error" }) };
  }
}

async function handleGetConfig(headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  const defaults = { timeout: 5000, retries: 3 };
  const userConfig = await db.query("SELECT config FROM settings LIMIT 1");
  const merged = Object.assign({}, defaults, userConfig);
  return { statusCode: 200, body: JSON.stringify(merged) };
}

async function handleCreateUser(body: Record<string, unknown>, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  const user = await userService.create(body);
  return { statusCode: 201, body: JSON.stringify(user) };
}

async function handleLogin(body: Record<string, unknown>): Promise<{ statusCode: number; body: string }> {
  try {
    const token = await userService.login(body["email"] as string, body["password"] as string);
    return { statusCode: 200, body: JSON.stringify({ token }) };
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
}

async function handleUpload(body: Record<string, unknown>, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  const result = await db.query("INSERT INTO uploads VALUES (?)", [body]);
  return { statusCode: 200, body: JSON.stringify(result) };
}

async function handleWebhook(body: Record<string, unknown>, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  const event = await userService.processWebhook(body);
  return { statusCode: 200, body: JSON.stringify(event) };
}

async function handleUpdateUser(path: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  const id = path.split("/")[2];
  const updated = await userService.update(id ?? "", body);
  return { statusCode: 200, body: JSON.stringify(updated) };
}

async function handleUpdateConfig(path: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  const key = path.split("/")[2];
  const result = await db.query("UPDATE settings SET config=? WHERE key=?", [body, key]);
  return { statusCode: 200, body: JSON.stringify(result) };
}

async function handleDeleteUser(path: string, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  const id = path.split("/")[2];
  await db.query("DELETE FROM users WHERE id=?", [id]);
  return { statusCode: 204, body: "" };
}
`.trim();

/** Virtual source text for user-service.ts */
export const USER_SERVICE_SOURCE = `
import { DatabaseClient } from "./database-client";

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
      return "token-" + Date.now();
    } catch (err: unknown) {
      throw new Error("Login failed");
    }
  }

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const validated = validateUserInput(data);
    const result = await db.query("UPDATE users SET data=? WHERE id=?", [validated, id]);
    return result as Record<string, unknown>;
  }

  async processWebhook(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const event = await db.query("INSERT INTO events VALUES (?)", [payload]);
    return event as Record<string, unknown>;
  }
}

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
`.trim();

/** Virtual source text for database-client.ts */
export const DATABASE_CLIENT_SOURCE = `
export class DatabaseClient {
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async query(sql: string, params?: unknown[]): Promise<unknown> {
    if (!this.connected) { await this.connect(); }
    return [];
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}
`.trim();

/**
 * Virtual ParseRequest-compatible entries for the pre-loaded sample.
 * Pass these to the parser engine via a virtual-file adapter instead of
 * real file paths, so the demo works in the browser without file system access.
 */
export const SAMPLE_REPO_VIRTUAL_FILES: readonly { filePath: string; source: string }[] = [
  { filePath: "sample/api-gateway.ts",    source: API_GATEWAY_SOURCE },
  { filePath: "sample/user-service.ts",   source: USER_SERVICE_SOURCE },
  { filePath: "sample/database-client.ts", source: DATABASE_CLIENT_SOURCE },
];

/** Human-readable label shown in both apps when the demo is active. */
export const SAMPLE_REPO_LABEL = "Serverless API (Pre-loaded Demo)";

/** Description shown in the app UI. */
export const SAMPLE_REPO_DESCRIPTION =
  "A three-file serverless TypeScript API with intentional " +
  "vulnerabilities, high-complexity functions, circular dependencies, " +
  "and uncaught exception paths — ready to audit or exorcise.";

/** Expected findings for smoke-testing both apps after load. */
export const SAMPLE_REPO_EXPECTED = {
  minFunctions: 12,
  minEdges: 8,
  minCircularDeps: 1,
  minSecurityFindings: 5,
  bossRoomFunctionNames: ["routeRequest", "validateUserInput"],
  taintSinkFunctionNames: ["handleGetConfig"],
  uncaughtExceptionFunctions: ["handleGetUsers", "processWebhook", "connect"],
  unusedVariables: ["unusedTimeout"],
} as const;
