/**
 * Safe JSON Serialization & Deserialization Utilities
 * Solves standard JSON edge cases: BigInt, Date strings, Map, Set, NaN, Infinity, and circular references.
 */

export class SafeJsonTransformer {
  /**
   * Custom Replacer Function for JSON.stringify
   * Encodes unsupported native JS types into tagged JSON-compatible objects.
   */
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

    if (typeof value === "number" && (isNaN(value) || !isFinite(value))) {
      return { __type: "SpecialNumber", value: value.toString() };
    }

    return value;
  }

  /**
   * Custom Reviver Function for JSON.parse
   * Reconstructs native JS types from tagged JSON objects and ISO Date strings.
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

    // Auto-revive ISO 8601 Date strings into native JS Date instances
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    if (typeof value === "string" && isoDatePattern.test(value)) {
      return new Date(value);
    }

    return value;
  }

  /**
   * Safely stringifies objects, preventing circular reference fatal crashes
   * @param {Object} data Any JS object or primitive
   * @returns {string} Safe JSON string
   */
  static safeStringify(data) {
    const seen = new WeakSet();
    return JSON.stringify(data, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular Reference]";
        }
        seen.add(value);
      }
      return SafeJsonTransformer.customReplacer(key, value);
    });
  }

  /**
   * Safely parses JSON string into native object with type revival
   * @param {string} jsonString Standard or tagged JSON string
   * @returns {Object} Deserialized native JS object
   */
  static parse(jsonString) {
    return JSON.parse(jsonString, SafeJsonTransformer.customReviver);
  }
}
