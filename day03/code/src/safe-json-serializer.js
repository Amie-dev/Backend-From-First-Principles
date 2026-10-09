/**
 * Standalone Demonstration: Safe Custom JSON Serializer and Replacer/Reviver
 * Run with: npm run safe-json
 */

import { SafeJsonTransformer } from "./utils/safe-json-transformer.js";

console.log("==================================================================");
console.log("    SAFE JSON TRANSFORMER DEMO (BigInt, Date, Map, Set, Circular)  ");
console.log("==================================================================");

// Domain Object containing values that break standard JSON.stringify
const domainObject = {
  accountNumber: 9007199254740995n, // BigInt beyond Number.MAX_SAFE_INTEGER
  createdDate: new Date("2026-10-09T14:00:00.000Z"),
  permissions: new Set(["READ", "WRITE", "EXECUTE"]),
  preferences: new Map([["theme", "dark"], ["notifications", true]]),
  invalidScore: NaN,
  optionalField: undefined
};

// Inject circular reference
domainObject.selfLink = domainObject;

console.log("\n1. Native JS Object before serialization:");
console.log(domainObject);

// 2. Safe Stringify
const jsonString = SafeJsonTransformer.safeStringify(domainObject);
console.log("\n2. Serialized Safe Wire String:");
console.log(jsonString);

// 3. Safe Parse
const restoredObject = SafeJsonTransformer.parse(jsonString);
console.log("\n3. Deserialized Restored Object:");
console.log(restoredObject);

console.log("\n4. Verification Summary:");
console.log(`   - BigInt Type Preserved? : ${typeof restoredObject.accountNumber === "bigint"} (${restoredObject.accountNumber}n)`);
console.log(`   - Date Object Restored?  : ${restoredObject.createdDate instanceof Date} (${restoredObject.createdDate.toISOString()})`);
console.log(`   - Set Collection Restored: ${restoredObject.permissions instanceof Set}`);
console.log(`   - Map Collection Restored: ${restoredObject.preferences instanceof Map}`);
console.log(`   - Circular Reference     : "${restoredObject.selfLink}"`);
console.log("==================================================================");
