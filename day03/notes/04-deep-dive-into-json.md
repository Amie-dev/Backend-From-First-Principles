# Chapter 04: Deep Dive into JSON (The Industry Standard)

## 1. Why JSON Dominates Modern APIs

JSON (**JavaScript Object Notation**) is the dominant data interchange standard in modern software engineering. It is used in approximately **80% of public HTTP REST APIs**.

Beyond network data transmission, JSON serves as the primary standard for:
* **Application Configuration Files**: `package.json`, `tsconfig.json`, `.eslintrc.json`.
* **Structured Application Logging**: JSON-formatted logs processed by tools like ELK stack (Elasticsearch, Logstash, Kibana) or Datadog.
* **Document Databases**: Native storage format in MongoDB (BSON) and PostgreSQL (`jsonb` columns).

---

## 2. Strict Syntax Specification Rules

Despite originating from JavaScript, JSON is a strict specification independent of any programming language. It enforces mandatory formatting constraints:

```
VALID JSON:                             INVALID JSON:
{                                       {
  "id": 101,                              id: 101,             <-- Unquoted Key!
  "name": "Alice",                        'name': 'Alice',     <-- Single Quotes!
  "roles": ["admin", "dev"],              "trailingComma": 5,  <-- Trailing Comma!
  "isActive": true                        "comment": // test   <-- Comments Not Allowed!
}                                       }
```

### Mandatory Rules:
1. **Outer Enclosure**: Must begin with `{` and end with `}` (for objects) or `[` and `]` (for arrays).
2. **String Keys with Double Quotes**: All object keys **must** be enclosed in standard double quotes (`"key":`). Single quotes or unquoted keys throw syntax parsing errors.
3. **No Trailing Commas**: The last element in an array or object must **not** have a trailing comma.
4. **No Native Comments**: JSON does not support inline (`//`) or block (`/* */`) comments.

---

## 3. Allowed vs Unsupported Data Types

JSON supports a strict subset of primitive and complex types.

| Category | Allowed JSON Types | Unsupported Types (JS/Runtime Specific) |
| :--- | :--- | :--- |
| **Primitives** | `String`, `Number`, `Boolean`, `null` | `undefined`, `Symbol`, `BigInt`, `NaN`, `Infinity` |
| **Containers** | `Array` (`[]`), `Object` (`{}`) | `Map`, `Set`, `Buffer`, `TypedArray` |
| **Special Objects** | *None* | `Function`, `Date`, `RegExp`, `Error` |

---

## 4. Common Serialization Traps & Edge Cases

When converting JavaScript runtime objects into JSON using `JSON.stringify()`, several implicit transformations occur that can cause severe production bugs:

```
Native JS Object                          Serialized JSON String
----------------                        ----------------------
{ key: undefined }            ====>     {}                   (Property Silent Drop!)
{ date: new Date() }          ====>     {"date":"2026-..."}  (Converted to String!)
{ big: 9007199254740993n }    ====>     TypeError            (BigInt Throws Exception!)
{ num: NaN }                  ====>     {"num":null}         (NaN converted to null!)
```

1. **`undefined` and Functions**: Properties with value `undefined` or function references are silently omitted from serialized JSON objects. If placed in an array, they are replaced with `null`.
2. **`BigInt` Exception**: Calling `JSON.stringify()` on an object containing a `BigInt` throws a runtime `TypeError: Do not know how to serialize a BigInt`.
3. **`NaN` and `Infinity`**: JavaScript numbers `NaN`, `Infinity`, and `-Infinity` are serialized as `null`.
4. **`Date` Objects**: Dates are automatically converted into ISO 8601 string representations (e.g., `"2026-10-09T14:00:00.000Z"`). Deserializing them produces a `String`, **not** a JavaScript `Date` instance!
5. **Circular References**: Objects containing circular memory references throw a fatal error: `TypeError: Converting circular structure to JSON`.

---

## 5. Express/Node.js Pseudocode: Robust JSON Serializer with Custom Transformers

This production-grade helper script demonstrates how to safely handle `BigInt`, `Date`, `Map`, `Set`, and circular reference traps using custom JSON `replacer` and `reviver` functions in Express/Node.js applications.

```javascript
// ==============================================================================
// Safe Custom JSON Serializer & Deserializer in Node.js
// Handles BigInt, Date, Set, Map, and Circular Reference traps
// ==============================================================================

class SafeJsonTransformer {
  /**
   * Custom Replacer Function for JSON.stringify
   * Intercepts unsupported runtime types and converts them to safe representations
   */
  static customReplacer(key, value) {
    // 1. Handle BigInt -> String with explicit type tag
    if (typeof value === "bigint") {
      return { __type: "BigInt", value: value.toString() };
    }

    // 2. Handle ES6 Map -> Array of entries
    if (value instanceof Map) {
      return { __type: "Map", value: Array.from(value.entries()) };
    }

    // 3. Handle ES6 Set -> Array of values
    if (value instanceof Set) {
      return { __type: "Set", value: Array.from(value.values()) };
    }

    // 4. Handle NaN & Infinity
    if (typeof value === "number" && (isNaN(value) || !isFinite(value))) {
      return { __type: "SpecialNumber", value: value.toString() };
    }

    return value;
  }

  /**
   * Custom Reviver Function for JSON.parse
   * Reconstructs custom tagged representations back into native types
   */
  static customReviver(key, value) {
    if (value && typeof value === "object" && value.__type) {
      switch (value.__type) {
        case "BigInt":
          return BigInt(value.value);
        case "Map":
          return new Map(value.value);
        case "Set":
          return new Set(value.value);
        case "SpecialNumber":
          return Number(value.value);
      }
    }

    // Convert ISO Date strings back into native Date instances
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    if (typeof value === "string" && isoDateRegex.test(value)) {
      return new Date(value);
    }

    return value;
  }

  /**
   * Safely stringifies objects containing circular references
   */
  static safeStringify(data) {
    const seen = new WeakSet();
    return JSON.stringify(data, (key, value) => {
      // Check for circular reference
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular Reference]";
        }
        seen.add(value);
      }
      return SafeJsonTransformer.customReplacer(key, value);
    });
  }

  static parse(jsonString) {
    return JSON.parse(jsonString, SafeJsonTransformer.customReviver);
  }
}

// ------------------------------------------------------------------------------
// DEMONSTRATION & TEST CASES
// ------------------------------------------------------------------------------

// Complex Domain Object containing standard JSON traps
const complexDomainState = {
  accountNumber: 9007199254740993n, // BigInt beyond Number.MAX_SAFE_INTEGER
  createdDate: new Date("2026-10-09T12:00:00.000Z"),
  userPermissions: new Set(["READ", "WRITE", "EXECUTE"]),
  metadata: new Map([["theme", "dark"], ["locale", "en_US"]]),
  score: NaN,
  optionalField: undefined // Will be dropped by default
};

// Create a circular reference
complexDomainState.selfReference = complexDomainState;

console.log("=== 1. Native Domain Object (Before Serialization) ===");
console.log(complexDomainState);

// Safely serialize
const serializedJSON = SafeJsonTransformer.safeStringify(complexDomainState);
console.log("\n=== 2. Serialized Safe JSON Wire String ===");
console.log(serializedJSON);

// Safely deserialize
const deserializedState = SafeJsonTransformer.parse(serializedJSON);
console.log("\n=== 3. Deserialized Native Object (Reconstructed) ===");
console.log(deserializedState);

// Verify parity
console.log("\n--- Parity Verifications ---");
console.log("BigInt Restored?      :", typeof deserializedState.accountNumber === "bigint");
console.log("Date Restored?        :", deserializedState.createdDate instanceof Date);
console.log("Set Restored?         :", deserializedState.userPermissions instanceof Set);
console.log("Map Restored?         :", deserializedState.metadata instanceof Map);
console.log("Circular Ref Handled? :", deserializedState.selfReference === "[Circular Reference]");
```

---

## 6. Key Takeaways

1. **Strict Syntax**: JSON keys must always be double-quoted strings (`"key":`), and no trailing commas or comments are permitted.
2. **Unsupported Types**: Native runtime features (`undefined`, `BigInt`, `Date`, `Function`, `Map`/`Set`) are either silently dropped, throw exceptions, or transform into standard string/null primitives.
3. **Custom Replacers/Revivers**: Custom serialization logic using `JSON.stringify(obj, replacer)` and `JSON.parse(str, reviver)` ensures lossless data fidelity across network boundaries.
