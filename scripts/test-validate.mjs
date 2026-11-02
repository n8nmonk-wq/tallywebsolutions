import assert from "node:assert/strict";
import { validateEmail, validatePhone, validateName } from "../src/lib/validate.ts";

// email
assert.equal(validateEmail("a@b.com").ok, true);
assert.equal(validateEmail("  Ritika@Example.COM ").value, "ritika@example.com");
assert.equal(validateEmail("nope").ok, false);
assert.equal(validateEmail("a@b").ok, false);
assert.equal(validateEmail("x@mailinator.com").ok, false, "disposable must be rejected");
assert.equal(validateEmail("x@YOPMAIL.com").ok, false, "disposable check must be case-insensitive");

// phone
assert.equal(validatePhone("9876543210").value, "+919876543210");
assert.equal(validatePhone("+91 98765 43210").value, "+919876543210");
assert.equal(validatePhone("09876543210").value, "+919876543210");
assert.equal(validatePhone("1234567890").ok, false, "must start 6-9");
assert.equal(validatePhone("98765").ok, false, "too short");
assert.equal(validatePhone("9999999999").ok, false, "repeated digits are fake");
assert.equal(validatePhone("").ok, false);

// name
assert.equal(validateName("  Narendra   Bhatt ").value, "Narendra Bhatt");
assert.equal(validateName("A").ok, false);
assert.equal(validateName("123").ok, false);
assert.equal(validateName("क").ok, false, "single letter still too short");
assert.equal(validateName("नरेन्द्र").ok, true, "non-Latin names must be accepted");

console.log("validation checks passed");
