import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "scrypt";
const KEY_LENGTH = 64;

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const derived = scryptSync(String(password), salt, KEY_LENGTH).toString("hex");
  return `${HASH_PREFIX}$${salt}$${derived}`;
}

export function verifyPassword(password, storedHash) {
  const [prefix, salt, expectedHex] = String(storedHash ?? "").split("$");
  if (prefix !== HASH_PREFIX || !salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function sessionCookie(token) {
  return `db_session=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=28800`;
}

export function clearSessionCookie() {
  return "db_session=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0";
}

export function getSessionToken(request) {
  const header = request.headers.authorization ?? "";
  if (header.startsWith("Bearer ")) return header.slice("Bearer ".length);

  const cookieHeader = request.headers.cookie ?? "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
  return cookies.db_session ?? "";
}
