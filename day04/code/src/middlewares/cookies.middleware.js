/**
 * Cookie Parsing Middleware — implemented from first principles (no dependency)
 *
 * Chapter Ref: Day04 Ch02 — "Cookies are transport, not storage"
 *
 * RFC 6265 (`Cookie: name1=value1; name2=value2`) is a deceptively simple format
 * with three sharp edges that a naive `split(";")` gets wrong:
 *
 *   1. Values may legitimately contain '=' (base64 padding, JWTs). Splitting on
 *      every '=' truncates them → only the FIRST '=' is a delimiter.
 *   2. Values are percent-encoded by the browser. `decodeURIComponent` throws on
 *      a malformed sequence ("%E0%A4%A"), so decoding is wrapped and a bad value
 *      falls back to its raw form instead of crashing the request.
 *   3. A crafted `__proto__=x` cookie would pollute the prototype chain of the
 *      container object if it were a plain `{}` → a null-prototype object plus a
 *      deny-list makes prototype pollution impossible.
 *
 * The parsed bag is attached to `req.cookies` (null-prototype) and the raw
 * header is preserved on `req.rawCookies` for integrity checks.
 */

/** Prototype-pollution deny-list — these keys must never reach the bag. */
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Defensive cap: browsers limit cookies to ~4KB each; 8KB of header is plenty. */
const MAX_COOKIE_HEADER_BYTES = 8 * 1024;

export function cookieParserMiddleware(req, res, next) {
  /** @type {Record<string, string>} */
  const bag = Object.create(null);
  const rawHeader = req.headers["cookie"];

  if (typeof rawHeader === "string" && rawHeader.length > 0) {
    if (Buffer.byteLength(rawHeader, "utf8") > MAX_COOKIE_HEADER_BYTES) {
      // Oversized cookie header → treat as absent rather than parsing attacker input.
      req.cookies = bag;
      req.rawCookies = rawHeader;
      return next();
    }

    for (const pair of rawHeader.split(";")) {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex < 1) continue; // no '=' or empty name → skip

      const name = pair.slice(0, separatorIndex).trim();
      const rawValue = pair.slice(separatorIndex + 1).trim();

      if (!name || FORBIDDEN_KEYS.has(name)) continue;

      let value = rawValue;
      try {
        value = decodeURIComponent(rawValue);
      } catch {
        value = rawValue; // malformed percent-encoding → keep raw bytes
      }

      // First occurrence wins (RFC 6265 duplicate handling).
      if (!(name in bag)) bag[name] = value;
    }
  }

  req.cookies = bag;
  req.rawCookies = rawHeader ?? "";
  next();
}

export default cookieParserMiddleware;
