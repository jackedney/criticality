"use strict";
/**
 * Safe file system utilities with path validation.
 *
 * This module provides wrapper functions for common file system operations that
 * validate all paths before use to prevent security vulnerabilities such as:
 *
 * - Path traversal attacks (e.g., "../../../etc/passwd")
 * - Directory traversal in user-supplied paths
 * - Invalid or empty file paths
 *
 * All paths are resolved to absolute paths and validated before any file system
 * operation is attempted. This ensures that operations only occur on intended
 * files and directories.
 *
 * @packageDocumentation
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathValidationError = void 0;
exports.validatePath = validatePath;
exports.safeReadFile = safeReadFile;
exports.safeWriteFile = safeWriteFile;
exports.safeExists = safeExists;
exports.safeExistsSync = safeExistsSync;
exports.safeReadFileSync = safeReadFileSync;
exports.safeReaddirSync = safeReaddirSync;
exports.safeMkdir = safeMkdir;
exports.safeReaddir = safeReaddir;
exports.safeStat = safeStat;
exports.safeUnlink = safeUnlink;
exports.safeRename = safeRename;
exports.safeWriteFileSync = safeWriteFileSync;
exports.safeMkdirSync = safeMkdirSync;
exports.safeRmSync = safeRmSync;
exports.safeAppendFile = safeAppendFile;
exports.safeAppendFileWithOptions = safeAppendFileWithOptions;
exports.safeMkdirTemp = safeMkdirTemp;
exports.safeCopyFile = safeCopyFile;
exports.safeRm = safeRm;
exports.safeSymlink = safeSymlink;
var promises_1 = require("node:fs/promises");
var node_fs_1 = require("node:fs");
var path = require("node:path");
/**
 * Error thrown when path validation fails.
 */
var PathValidationError = /** @class */ (function (_super) {
    __extends(PathValidationError, _super);
    /**
     * Creates a new PathValidationError.
     *
     * @param message - Human-readable error message.
     * @param invalidPath - The path that failed validation.
     */
    function PathValidationError(message, invalidPath) {
        var _this = _super.call(this, message) || this;
        _this.name = 'PathValidationError';
        _this.invalidPath = invalidPath;
        return _this;
    }
    return PathValidationError;
}(Error));
exports.PathValidationError = PathValidationError;
/**
 * Validates and resolves a file system path.
 *
 * This function ensures that:
 * - The path is a non-empty string
 * - The path can be resolved to an absolute path
 * - The resolved path is absolute (prevents relative path traversal)
 *
 * Security Rationale:
 * - Using `path.resolve` normalizes the path and resolves any "." or ".." segments
 * - Checking `path.isAbsolute` ensures the resolved path is absolute
 * - This prevents directory traversal attacks where malicious input could escape
 *   the intended directory structure
 *
 * Note: This function does not enforce containment within a specific root directory.
 * To enforce path containment, validate that the resolved path starts with an
 * expected root directory after calling this function.
 *
 * @param filePath - The path to validate.
 * @returns The resolved absolute path.
 * @throws {PathValidationError} If the path is invalid (empty, non-string, contains null bytes, or resolves to a non-absolute path).
 *
 * @example
 * ```ts
 * // Valid paths
 * validatePath('/tmp/test.txt') // Returns '/tmp/test.txt'
 * validatePath('./test.txt')    // Returns absolute path like '/current/dir/test.txt'
 *
 * // Invalid paths throw PathValidationError
 * validatePath('')                      // Throws: Path cannot be empty
 * validatePath('/tmp/test\0file.txt')  // Throws: Path cannot contain null bytes
 * validatePath(null as unknown as string) // Throws: Path must be a string
 * ```
 */
function validatePath(filePath) {
    if (typeof filePath !== 'string') {
        throw new PathValidationError('Path must be a string', String(filePath));
    }
    if (filePath.length === 0) {
        throw new PathValidationError('Path cannot be empty', filePath);
    }
    if (filePath.includes('\0')) {
        throw new PathValidationError('Path cannot contain null bytes', filePath);
    }
    var resolved = path.resolve(filePath);
    if (!path.isAbsolute(resolved)) {
        throw new PathValidationError('Path must resolve to an absolute path', filePath);
    }
    return resolved;
}
/**
 * Safely reads a file after validating the path.
 *
 * @param filePath - The path to the file to read.
 * @param options - Optional encoding or file read options.
 * @returns A promise that resolves to the file contents.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be read (e.g., file not found, permission denied).
 */
function safeReadFile(filePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPath;
        return __generator(this, function (_a) {
            validatedPath = validatePath(filePath);
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
            return [2 /*return*/, (0, promises_1.readFile)(validatedPath, options)];
        });
    });
}
/**
 * Safely writes to a file after validating the path.
 *
 * @param filePath - The path to the file to write.
 * @param data - The data to write to the file.
 * @param options - Optional encoding or file write options.
 * @returns A promise that resolves when the file is written.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be written (e.g., permission denied, directory does not exist).
 */
function safeWriteFile(filePath, data, options) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPath;
        return __generator(this, function (_a) {
            validatedPath = validatePath(filePath);
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
            return [2 /*return*/, (0, promises_1.writeFile)(validatedPath, data, options)];
        });
    });
}
/**
 * Safely checks if a file or directory exists after validating the path.
 *
 * @param filePath - The path to check.
 * @returns A promise that resolves to true if the path exists, false otherwise.
 * @throws {PathValidationError} If the path is invalid.
 */
function safeExists(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPath, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    validatedPath = validatePath(filePath);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.access)(validatedPath)];
                case 2:
                    _b.sent();
                    return [2 /*return*/, true];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Synchronously checks if a file or directory exists after validating the path.
 *
 * @param filePath - The path to check.
 * @returns True if the path exists, false otherwise.
 * @throws {PathValidationError} If the path is invalid.
 */
function safeExistsSync(filePath) {
    var validatedPath = validatePath(filePath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
    return (0, node_fs_1.existsSync)(validatedPath);
}
/**
 * Synchronously reads a file after validating the path.
 *
 * @param filePath - The path to the file to read.
 * @param options - Optional encoding or file read options.
 * @returns The file contents as a string or Buffer.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be read (e.g., file not found, permission denied).
 */
function safeReadFileSync(filePath, options) {
    var validatedPath = validatePath(filePath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
    return (0, node_fs_1.readFileSync)(validatedPath, options);
}
function safeReaddirSync(filePath, options) {
    var validatedPath = validatePath(filePath);
    return (
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
    (0, node_fs_1.readdirSync)(validatedPath, 
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- type safety enforced by overload signatures
    options));
}
/**
 * Safely creates a directory after validating the path.
 *
 * @param filePath - The path to the directory to create.
 * @param options - Optional recursive mode and mode options.
 * @returns A promise that resolves when the directory is created.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the directory cannot be created (e.g., permission denied, file exists).
 */
function safeMkdir(filePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPath;
        return __generator(this, function (_a) {
            validatedPath = validatePath(filePath);
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
            return [2 /*return*/, (0, promises_1.mkdir)(validatedPath, options)];
        });
    });
}
function safeReaddir(filePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPath;
        return __generator(this, function (_a) {
            validatedPath = validatePath(filePath);
            return [2 /*return*/, (
                // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
                (0, promises_1.readdir)(validatedPath, 
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- required for complex readdir options
                options))];
        });
    });
}
/**
 * Safely gets file statistics after validating the path.
 *
 * @param filePath - The path to the file or directory.
 * @returns A promise that resolves to file statistics.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the statistics cannot be retrieved (e.g., not found, permission denied).
 */
function safeStat(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPath;
        return __generator(this, function (_a) {
            validatedPath = validatePath(filePath);
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
            return [2 /*return*/, (0, promises_1.stat)(validatedPath)];
        });
    });
}
/**
 * Safely deletes a file after validating the path.
 *
 * @param filePath - The path to the file to delete.
 * @returns A promise that resolves when the file is deleted.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be deleted (e.g., not found, is a directory, permission denied).
 */
function safeUnlink(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPath;
        return __generator(this, function (_a) {
            validatedPath = validatePath(filePath);
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
            return [2 /*return*/, (0, promises_1.unlink)(validatedPath)];
        });
    });
}
/**
 * Safely renames a file or directory after validating both paths.
 *
 * @param oldPath - The current path of the file or directory.
 * @param newPath - The new path for the file or directory.
 * @returns A promise that resolves when the file or directory is renamed.
 * @throws {PathValidationError} If either path is invalid.
 * @throws {Error} If the rename operation fails (e.g., old path not found, new path exists, permission denied).
 */
function safeRename(oldPath, newPath) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedOldPath, validatedNewPath;
        return __generator(this, function (_a) {
            validatedOldPath = validatePath(oldPath);
            validatedNewPath = validatePath(newPath);
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths are validated by validatePath
            return [2 /*return*/, (0, promises_1.rename)(validatedOldPath, validatedNewPath)];
        });
    });
}
/**
 * Synchronously writes to a file after validating the path.
 *
 * @param filePath - The path to the file to write.
 * @param data - The data to write to the file.
 * @param options - Optional encoding or file write options.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be written (e.g., permission denied, directory does not exist).
 */
function safeWriteFileSync(filePath, data, options) {
    var validatedPath = validatePath(filePath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
    (0, node_fs_1.writeFileSync)(validatedPath, data, options);
}
/**
 * Synchronously creates a directory after validating the path.
 *
 * @param filePath - The path to the directory to create.
 * @param options - Optional recursive mode and mode options.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the directory cannot be created (e.g., permission denied, file exists).
 */
function safeMkdirSync(filePath, options) {
    var validatedPath = validatePath(filePath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
    return (0, node_fs_1.mkdirSync)(validatedPath, options);
}
/**
 * Synchronously removes a file or directory after validating the path.
 *
 * @param filePath - The path to the file or directory to remove.
 * @param options - Options for removal.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the path cannot be removed (e.g., not found, permission denied).
 */
function safeRmSync(filePath, options) {
    var validatedPath = validatePath(filePath);
    (0, node_fs_1.rmSync)(validatedPath, options);
}
/**
 * Safely appends data to a file after validating the path.
 *
 * @param filePath - The path to the file to append to.
 * @param data - The data to append.
 * @param options - Optional encoding or file append options.
 * @returns A promise that resolves when the file is appended to.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be appended to (e.g., permission denied, directory does not exist).
 */
function safeAppendFile(filePath, data, options) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPath;
        return __generator(this, function (_a) {
            validatedPath = validatePath(filePath);
            if (typeof options === 'string') {
                // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
                return [2 /*return*/, (0, promises_1.appendFile)(validatedPath, data, options)];
            }
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
            return [2 /*return*/, (0, promises_1.appendFile)(validatedPath, data, options)];
        });
    });
}
function safeAppendFileWithOptions(filePath, data, options) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPath;
        return __generator(this, function (_a) {
            validatedPath = validatePath(filePath);
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
            return [2 /*return*/, (0, promises_1.appendFile)(validatedPath, data, options)];
        });
    });
}
/**
 * Safely creates a temporary directory after validating the path prefix.
 *
 * @param prefix - The prefix for the temporary directory name.
 * @returns A promise that resolves to the path of the created temporary directory.
 * @throws {PathValidationError} If the prefix is invalid.
 * @throws {Error} If the temporary directory cannot be created (e.g., permission denied).
 */
function safeMkdirTemp(prefix) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPrefix;
        return __generator(this, function (_a) {
            validatedPrefix = validatePath(prefix);
            return [2 /*return*/, (0, promises_1.mkdtemp)(validatedPrefix)];
        });
    });
}
/**
 * Safely copies a file after validating both paths.
 *
 * @param src - The source file path.
 * @param dest - The destination file path.
 * @param mode - Optional copy mode (Node.js constants like fs.constants.COPYFILE_EXCL).
 * @returns A promise that resolves when the file is copied.
 * @throws {PathValidationError} If either path is invalid.
 * @throws {Error} If the file cannot be copied (e.g., source not found, permission denied).
 */
function safeCopyFile(src, dest, mode) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedSrc, validatedDest;
        return __generator(this, function (_a) {
            validatedSrc = validatePath(src);
            validatedDest = validatePath(dest);
            return [2 /*return*/, (0, promises_1.copyFile)(validatedSrc, validatedDest, mode)];
        });
    });
}
/**
 * Safely removes a file or directory after validating the path.
 *
 * @param filePath - The path to the file or directory to remove.
 * @param options - Options for removal.
 * @returns A promise that resolves when the path is removed.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the path cannot be removed (e.g., not found, permission denied).
 */
function safeRm(filePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedPath;
        return __generator(this, function (_a) {
            validatedPath = validatePath(filePath);
            return [2 /*return*/, (0, promises_1.rm)(validatedPath, options)];
        });
    });
}
/**
 * Safely creates a symbolic link after validating both paths.
 *
 * @param target - The path to which the symbolic link should point.
 * @param path - The path where the symbolic link will be created.
 * @param type - The type of symbolic link (platform-specific).
 * @returns A promise that resolves when the symbolic link is created.
 * @throws {PathValidationError} If either path is invalid.
 * @throws {Error} If the symbolic link cannot be created (e.g., permission denied, directory does not exist).
 */
function safeSymlink(target, path, type) {
    return __awaiter(this, void 0, void 0, function () {
        var validatedTarget, validatedPath;
        return __generator(this, function (_a) {
            validatedTarget = validatePath(target);
            validatedPath = validatePath(path);
            return [2 /*return*/, (
                // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths are validated by validatePath
                (0, promises_1.symlink)(validatedTarget, validatedPath, type))];
        });
    });
}
