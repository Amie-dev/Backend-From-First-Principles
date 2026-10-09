# Implementation Guide 04: Safe JSON Handling & Serialization Traps

## 1. Architectural Concept

Standard `JSON.stringify()` fails on several common JavaScript runtime data types:
* `BigInt`: Throws `TypeError: Do not know how to serialize a BigInt`.
* `Date`: Converted into ISO string, but deserialized as a `String` (losing method prototypes).
* `Set` / `Map`: Stringified as empty objects `{}`.
* Circular References: Throws `TypeError: Converting circular structure to JSON`.

`SafeJsonTransformer` solves these traps using custom JSON `replacer` and `reviver` functions combined with `WeakSet` tracking.

---

## 2. Code Implementation (`src/utils/safe-json-transformer.js`)

```javascript
export class SafeJsonTransformer {
  static customReplacer(key, value) {
    if (typeof value === "bigint") {
      return { __type: "BigInt", value: value.toString() };
    }
    if (value instanceof Map) {
      return { __type: "Map", value: Array.from(value.entries()) };
    }
    if (value instanceof Set) {
      return { __type: "Set", value: Array.from(value.values()) };
    }
    return value;
  }

  static customReviver(key, value) {
    if (value && typeof value === "object" && value.__type) {
      switch (value.__type) {
        case "BigInt": return BigInt(value.value);
        case "Map": return new Map(value.value);
        case "Set": return new Set(value.value);
      }
    }

    const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    if (typeof value === "string" && isoDatePattern.test(value)) {
      return new Date(value);
    }

    return value;
  }

  static safeStringify(data) {
    const seen = new WeakSet();
    return JSON.stringify(data, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular Reference]";
        seen.add(value);
      }
      return SafeJsonTransformer.customReplacer(key, value);
    });
  }

  static parse(jsonString) {
    return JSON.parse(jsonString, SafeJsonTransformer.customReviver);
  }
}
```

---

## 3. Running Demonstration

Execute the standalone safe JSON script to verify type revival and circular reference handling:

```bash
npm run safe-json
```
