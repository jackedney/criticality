"use strict";
/**
 * Decision Ledger module.
 *
 * Provides an append-only ledger for recording protocol decisions.
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadLedger = exports.saveLedger = exports.deserialize = exports.serialize = exports.LedgerSerializationError = exports.fromData = exports.InvalidFilterKeyError = exports.DependencyNotFoundError = exports.CircularDependencyError = exports.InvalidSupersedeError = exports.DecisionNotFoundError = exports.CanonicalOverrideError = exports.DuplicateDecisionIdError = exports.LedgerValidationError = exports.Ledger = void 0;
var ledger_js_1 = require("./ledger.js");
Object.defineProperty(exports, "Ledger", { enumerable: true, get: function () { return ledger_js_1.Ledger; } });
Object.defineProperty(exports, "LedgerValidationError", { enumerable: true, get: function () { return ledger_js_1.LedgerValidationError; } });
Object.defineProperty(exports, "DuplicateDecisionIdError", { enumerable: true, get: function () { return ledger_js_1.DuplicateDecisionIdError; } });
Object.defineProperty(exports, "CanonicalOverrideError", { enumerable: true, get: function () { return ledger_js_1.CanonicalOverrideError; } });
Object.defineProperty(exports, "DecisionNotFoundError", { enumerable: true, get: function () { return ledger_js_1.DecisionNotFoundError; } });
Object.defineProperty(exports, "InvalidSupersedeError", { enumerable: true, get: function () { return ledger_js_1.InvalidSupersedeError; } });
Object.defineProperty(exports, "CircularDependencyError", { enumerable: true, get: function () { return ledger_js_1.CircularDependencyError; } });
Object.defineProperty(exports, "DependencyNotFoundError", { enumerable: true, get: function () { return ledger_js_1.DependencyNotFoundError; } });
Object.defineProperty(exports, "InvalidFilterKeyError", { enumerable: true, get: function () { return ledger_js_1.InvalidFilterKeyError; } });
Object.defineProperty(exports, "fromData", { enumerable: true, get: function () { return ledger_js_1.fromData; } });
var persistence_js_1 = require("./persistence.js");
Object.defineProperty(exports, "LedgerSerializationError", { enumerable: true, get: function () { return persistence_js_1.LedgerSerializationError; } });
Object.defineProperty(exports, "serialize", { enumerable: true, get: function () { return persistence_js_1.serialize; } });
Object.defineProperty(exports, "deserialize", { enumerable: true, get: function () { return persistence_js_1.deserialize; } });
Object.defineProperty(exports, "saveLedger", { enumerable: true, get: function () { return persistence_js_1.saveLedger; } });
Object.defineProperty(exports, "loadLedger", { enumerable: true, get: function () { return persistence_js_1.loadLedger; } });
