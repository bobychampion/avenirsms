"use strict";
/**
 * Google Workspace Integration Cloud Functions
 *
 * This module provides backend Cloud Functions for managing Google Workspace
 * OAuth flows, token management, and service verification.
 *
 * @module functions/google
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./types"), exports);
__exportStar(require("./googleAuthService"), exports);
__exportStar(require("./googleTokenService"), exports);
__exportStar(require("./googleVerificationService"), exports);
__exportStar(require("./googleApiClient"), exports);
__exportStar(require("./googleDriveService"), exports);
__exportStar(require("./googleCalendarService"), exports);
__exportStar(require("./googleClassroomService"), exports);
__exportStar(require("./googleGmailService"), exports);
//# sourceMappingURL=index.js.map