/**
 * Utility functions for AI Code Assistant VS Code Extension
 * 
 * This module contains common utility functions used throughout the extension.
 * Centralizing utilities here improves code reusability and maintainability.
 * 
 * @fileoverview Utility functions and helpers
 * @author AI Code Assistant Extension
 * @version 1.0.0
 */

import * as path from 'path';
import { SupportedLanguage, LANGUAGE_EXTENSIONS, FileStatistics, CodeAnalysis } from './types';

/**
 * File utilities
 */
export class FileUtils {
    /**
     * Gets the programming language from file extension
     */
    static getLanguageFromExtension(ext: string): SupportedLanguage {
        return LANGUAGE_EXTENSIONS[ext.toLowerCase()] || SupportedLanguage.PLAINTEXT;
    }

    /**
     * Gets file statistics from content
     */
    static getFileStatistics(content: string): FileStatistics {
        return {
            lineCount: content.split('\n').length,
            fileSize: Buffer.byteLength(content, 'utf8'),
            characterCount: content.length
        };
    }

    /**
     * Formats file size in human-readable format
     */
    static formatFileSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
        return Math.round(bytes / (1024 * 1024)) + ' MB';
    }

    /**
     * Checks if a string represents a valid file path or URI
     */
    static isValidFilePath(text: string): boolean {
        return text.startsWith('file://') || text.includes('/') || text.match(/^[a-zA-Z]:\\/) !== null;
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
 * Code analysis utilities
 */
export class CodeAnalysisUtils {
    /**
     * Analyzes the structure of code content
     */
    static analyzeCodeStructure(content: string, language: SupportedLanguage): CodeAnalysis {
        return {
            functions: this.extractFunctions(content, language),
            classes: this.extractClasses(content, language),
            imports: this.extractImports(content, language),
            language: language
        };
    }

    /**
     * Extracts function names from code content
     */
    private static extractFunctions(content: string, language: SupportedLanguage): string[] {
        const functions: string[] = [];
        const lines = content.split('\n');
        const patterns = this.getFunctionPatterns(language);
        
        for (const line of lines) {
            const trimmed = line.trim();
            for (const pattern of patterns) {
                const match = trimmed.match(pattern);
                if (match) {
                    const funcName = match[1] || match[2] || match[3];
                    if (funcName && !functions.includes(funcName)) {
                        functions.push(funcName);
                    }
                }
            }
        }

        return functions;
    }

    /**
     * Gets function detection patterns for different languages
     */
    private static getFunctionPatterns(language: SupportedLanguage): RegExp[] {
        const jsPatterns = [
            /function\s+(\w+)/,
            /(\w+)\s*\(.*\)\s*{/,
            /(\w+):\s*function/,
            /const\s+(\w+)\s*=/,
            /let\s+(\w+)\s*=/,
            /var\s+(\w+)\s*=/
        ];

        const pythonPatterns = [
            /def\s+(\w+)/,
            /async\s+def\s+(\w+)/
        ];

        switch (language) {
            case SupportedLanguage.JAVASCRIPT:
            case SupportedLanguage.TYPESCRIPT:
                return jsPatterns;
            case SupportedLanguage.PYTHON:
                return pythonPatterns;
            default:
                return jsPatterns;
        }
    }

    /**
     * Extracts class names from code content
     */
    private static extractClasses(content: string, language: SupportedLanguage): string[] {
        const classes: string[] = [];
        const lines = content.split('\n');
        const patterns = this.getClassPatterns(language);

        for (const line of lines) {
            const trimmed = line.trim();
            for (const pattern of patterns) {
                const match = trimmed.match(pattern);
                if (match) {
                    const className = match[1];
                    if (className && !classes.includes(className)) {
                        classes.push(className);
                    }
                }
            }
        }

        return classes;
    }

    /**
     * Gets class detection patterns for different languages
     */
    private static getClassPatterns(language: SupportedLanguage): RegExp[] {
        switch (language) {
            case SupportedLanguage.JAVASCRIPT:
            case SupportedLanguage.TYPESCRIPT:
                return [/class\s+(\w+)/, /interface\s+(\w+)/, /type\s+(\w+)/];
            case SupportedLanguage.PYTHON:
                return [/class\s+(\w+)/];
            case SupportedLanguage.JAVA:
            case SupportedLanguage.CSHARP:
                return [/class\s+(\w+)/, /interface\s+(\w+)/];
            default:
                return [/class\s+(\w+)/];
        }
    }

    /**
     * Extracts import statements from code content
     */
    private static extractImports(content: string, language: SupportedLanguage): string[] {
        const imports: string[] = [];
        const lines = content.split('\n');
        const patterns = this.getImportPatterns(language);

        for (const line of lines) {
            const trimmed = line.trim();
            for (const pattern of patterns) {
                if (pattern.test(trimmed)) {
                    imports.push(trimmed);
                }
            }
        }

        return imports;
    }

    /**
     * Gets import detection patterns for different languages
     */
    private static getImportPatterns(language: SupportedLanguage): RegExp[] {
        switch (language) {
            case SupportedLanguage.JAVASCRIPT:
            case SupportedLanguage.TYPESCRIPT:
                return [/^import/, /^require\(/, /^const.*=.*require\(/];
            case SupportedLanguage.PYTHON:
                return [/^import/, /^from.*import/];
            case SupportedLanguage.JAVA:
                return [/^import/];
            case SupportedLanguage.CSHARP:
                return [/^using/];
            default:
                return [/^import/];
        }
    }

    /**
     * Formats code analysis results for display
     */
    static formatCodeAnalysis(analysis: CodeAnalysis): string {
        let result = '';

        if (analysis.functions.length > 0) {
            const displayFunctions = analysis.functions.slice(0, 3);
            const remainingCount = analysis.functions.length - 3;
            result += `🔧 **Functions found:** ${displayFunctions.join(', ')}${remainingCount > 0 ? ` (+${remainingCount} more)` : ''}\n`;
        }

        if (analysis.classes.length > 0) {
            const displayClasses = analysis.classes.slice(0, 3);
            const remainingCount = analysis.classes.length - 3;
            result += `📦 **Classes found:** ${displayClasses.join(', ')}${remainingCount > 0 ? ` (+${remainingCount} more)` : ''}\n`;
        }

        if (analysis.imports.length > 0) {
            result += `📥 **Dependencies:** ${analysis.imports.length} imports\n`;
        }

        return result;
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
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Escapes HTML entities in text
     */
    static escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Formats message content with basic markdown-like styling
     */
    static formatMessageContent(content: string): string {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold text
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic text
            .replace(/\n/g, '<br>');                           // Line breaks
    }

    /**
     * Generates a unique ID
     */
    static generateId(): string {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }
}

/**
 * DOM utilities for webview
 */
export class DOMUtils {
    /**
     * Creates a safe element selector
     */
    static getElementById(id: string): HTMLElement | null {
        return document.getElementById(id);
    }

    /**
     * Safely adds event listener with error handling
     */
    static addEventListener(element: HTMLElement | null, event: string, handler: EventListener): void {
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    /**
     * Safely removes event listener
     */
    static removeEventListener(element: HTMLElement | null, event: string, handler: EventListener): void {
        if (element) {
            element.removeEventListener(event, handler);
        }
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

        const nonPrintable = content.split('').filter(char => {
            const code = char.charCodeAt(0);
            return code < 32 && code !== 9 && code !== 10 && code !== 13;
        }).length;

        return (nonPrintable / content.length) > 0.3;
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
            if (error.message.includes('ECONNREFUSED')) {
                return 'Cannot connect to AI service. Please make sure it is running.';
            }
            if (error.message.includes('timeout')) {
                return 'Request timed out. The AI service may be busy.';
            }
            if (error.message.includes('not found')) {
                return 'Requested resource not found.';
            }
            return error.message;
        }
        return 'An unexpected error occurred.';
    }

    /**
     * Logs error with context
     */
    static logError(context: string, error: unknown): void {
        console.error(`[${context}] Error:`, error);
    }
}

/**
 * Array utilities
 */
export class ArrayUtils {
    /**
     * Removes duplicates from array
     */
    static unique<T>(array: T[]): T[] {
        return [...new Set(array)];
    }

    /**
     * Chunks array into smaller arrays
     */
    static chunk<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Safely gets first element of array
     */
    static first<T>(array: T[]): T | undefined {
        return array.length > 0 ? array[0] : undefined;
    }
}