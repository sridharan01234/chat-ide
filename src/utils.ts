/**
 * Utility functions for AI Code Assistant VS Code Extension
 *
 * This module contains common utility functions used throughout the extension.
 * Centralizing utilities here improves code reusability and maintainability.
 *
 * @fileoverview Utility functions and helpers
 * @author SRIDHARAN THILLAIYAPPAN
 * @version 1.0.0
 */

import * as path from "path";
import {
  SupportedLanguage,
  LANGUAGE_EXTENSIONS,
  FileStatistics,
} from "./types";

/**
 * File utilities
 */
export class FileUtils {
  /**
   * Gets the programming language from file extension
   */
  static getLanguageFromExtension(ext: string): SupportedLanguage {
    return (
      LANGUAGE_EXTENSIONS[ext.toLowerCase()] || SupportedLanguage.PLAINTEXT
    );
  }

  /**
   * Gets file statistics from content
   */
  static getFileStatistics(content: string): FileStatistics {
    return {
      lineCount: content.split("\n").length,
      fileSize: Buffer.byteLength(content, "utf8"),
      characterCount: content.length,
    };
  }

  /**
   * Formats file size in human-readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return Math.round(bytes / (1024 * 1024)) + " MB";
  }

  /**
   * Checks if a string represents a valid file path or URI
   */
  static isValidFilePath(text: string): boolean {
    return (
      text.startsWith("file://") ||
      text.includes("/") ||
      text.match(/^[a-zA-Z]:\\/) !== null
    );
  }

  /**
   * Checks if file extension is supported
   */
  static isSupportedFileExtension(ext: string): boolean {
    return ext.toLowerCase() in LANGUAGE_EXTENSIONS;
  }

  /**
   * Gets the base name of a file from a path
   */
  static getFileName(filePath: string): string {
    return path.basename(filePath);
  }

  /**
   * Gets the file extension from a path
   */
  static getFileExtension(filePath: string): string {
    return path.extname(filePath);
  }
}



/**
 * String utilities
 */
export class StringUtils {
  /**
   * Truncates text to specified length with ellipsis
   */
  static truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  /**
   * Escapes HTML entities in text
   */
  static escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Formats message content with basic markdown-like styling
   */
  static formatMessageContent(content: string): string {
    return content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // Bold text
      .replace(/\*(.*?)\*/g, "<em>$1</em>") // Italic text
      .replace(/\n/g, "<br>"); // Line breaks
  }

  /**
   * Generates a unique ID
   */
  static generateId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }
}

/**
 * Validation utilities
 */
export class ValidationUtils {
  /**
   * Validates if content is likely binary
   */
  static isBinaryContent(content: string): boolean {
    // Check for null bytes or high percentage of non-printable characters
    const nullBytes = (content.match(/\0/g) || []).length;
    if (nullBytes > 0) return true;

    const nonPrintable = content.split("").filter((char) => {
      const code = char.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    }).length;

    return nonPrintable / content.length > 0.3;
  }

  /**
   * Validates file size
   */
  static isValidFileSize(size: number, maxSize: number): boolean {
    return size <= maxSize;
  }

  /**
   * Validates message content
   */
  static isValidMessage(message: string): boolean {
    return message.trim().length > 0;
  }
}

/**
 * Error handling utilities
 */
export class ErrorUtils {
  /**
   * Creates a user-friendly error message
   */
  static createUserFriendlyError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED")) {
        return "Cannot connect to AI service. Please make sure it is running.";
      }
      if (error.message.includes("timeout")) {
        return "Request timed out. The AI service may be busy.";
      }
      if (error.message.includes("not found")) {
        return "Requested resource not found.";
      }
      return error.message;
    }
    return "An unexpected error occurred.";
  }

  /**
   * Logs error with context
   */
  static logError(context: string, error: unknown): void {
    console.error(`[${context}] Error:`, error);
  }
}
