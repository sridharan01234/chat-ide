/**
 * Type definitions for AI Code Assistant VS Code Extension
 *
 * This file contains all shared interfaces, types, and enums used throughout the extension.
 * Centralizing types here improves maintainability and prevents circular dependencies.
 *
 * @fileoverview Centralized type definitions
 * @author AI Code Assistant Extension
 * @version 1.0.0
 */

import * as vscode from "vscode";

/**
 * Represents a single chat message in the conversation
 */
export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  content: string;
  timestamp: Date;
  fileReference?: FileReference;
}

/**
 * Represents a file attachment in the chat
 */
export interface FileReference {
  fileName: string;
  filePath: string;
  content: string;
  language: string;
  size?: number;
  lineCount?: number;
}

/**
 * Represents an item in the chat tree view
 */
export interface ChatItem {
  id: string;
  label: string;
  type: "message" | "file";
  message?: ChatMessage;
  collapsibleState?: vscode.TreeItemCollapsibleState;
}

/**
 * Represents an item in the drop zone tree view
 */
export interface DropZoneItem {
  label: string;
  iconPath: string;
  tooltip: string;
}

/**
 * Ollama service message format
 */
export interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Ollama API response format
 */
export interface OllamaResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama model information
 */
export interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
  modified_at: string;
}

/**
 * Connection status for services
 */
export interface ServiceConnectionStatus {
  connected: boolean;
  url: string;
  availableModels: string[];
}

/**
 * File statistics for analysis
 */
export interface FileStatistics {
  lineCount: number;
  fileSize: number;
  characterCount: number;
}

/**
 * Code structure analysis result
 */
export interface CodeAnalysis {
  functions: string[];
  classes: string[];
  imports: string[];
  complexity?: number;
  language: string;
}

/**
 * Webview message types for communication between extension and webview
 */
export interface WebviewMessage {
  type: WebviewMessageType;
  [key: string]: any;
}

/**
 * Enum for webview message types
 */
export enum WebviewMessageType {
  SEND_MESSAGE = "sendMessage",
  ATTACH_FILE = "attachFile",
  FILES_DROPPED = "filesDropped",
  TEXT_DROPPED = "textDropped",
  DROP_FAILED = "dropFailed",
  CLEAR_STAGED_FILE = "clearStagedFile",
  CLEAR_CHAT = "clearChat",
  UPDATE_MESSAGES = "updateMessages",
  UPDATE_STAGED_FILE = "updateStagedFile",
}

/**
 * Drop source types
 */
export enum DropSource {
  VS_CODE_EXPLORER = "vscode-explorer",
  VS_CODE_EDITOR_TAB = "vscode-editor-tab",
  OS_FILES = "os-files",
  PLAIN_TEXT = "plain-text",
}

/**
 * Supported programming languages
 */
export enum SupportedLanguage {
  JAVASCRIPT = "javascript",
  TYPESCRIPT = "typescript",
  PYTHON = "python",
  JAVA = "java",
  CPP = "cpp",
  C = "c",
  CSHARP = "csharp",
  PHP = "php",
  RUBY = "ruby",
  GO = "go",
  RUST = "rust",
  SWIFT = "swift",
  KOTLIN = "kotlin",
  DART = "dart",
  VUE = "vue",
  HTML = "html",
  CSS = "css",
  SCSS = "scss",
  SASS = "sass",
  LESS = "less",
  JSON = "json",
  XML = "xml",
  YAML = "yaml",
  MARKDOWN = "markdown",
  PLAINTEXT = "plaintext",
}

/**
 * Configuration for file processing limits
 */
export interface FileProcessingConfig {
  maxFileSize: number;
  maxFilesPerFolder: number;
  supportedExtensions: string[];
  binaryFileExtensions: string[];
}

/**
 * Extension commands enumeration
 */
export enum ExtensionCommand {
  OPEN_CHAT = "ai-assistant.openChat",
  CLEAR_CHAT = "ai-assistant.clearChat",
  NEW_CHAT = "ai-assistant.newChat",
  ATTACH_ACTIVE_FILE = "ai-assistant.attachActiveFile",
  BROWSE_FILES = "ai-assistant.browseFiles",
  ATTACH_SELECTION = "ai-assistant.attachSelection",
  ATTACH_MULTIPLE_FILES = "ai-assistant.attachMultipleFiles",
  ATTACH_FILE_FROM_EXPLORER = "ai-assistant.attachFileFromExplorer",
}

/**
 * MIME types used for drag and drop operations
 */
export const DRAG_DROP_MIME_TYPES = {
  URI_LIST: "text/uri-list",
  VS_CODE_TREE: "application/vnd.code.tree.explorer",
  VS_CODE_FILE_EXPLORER: "application/vnd.code.tree.fileexplorer",
  VS_CODE_EDITOR_DROP: "application/vnd.code.editor.drop",
  VS_CODE_TAB_DROP: "application/vnd.code.tab.drop",
  PLAIN_TEXT: "text/plain",
  FILES: "files",
} as const;

/**
 * Language to file extension mapping
 */
export const LANGUAGE_EXTENSIONS: Record<string, SupportedLanguage> = {
  ".js": SupportedLanguage.JAVASCRIPT,
  ".jsx": SupportedLanguage.JAVASCRIPT,
  ".ts": SupportedLanguage.TYPESCRIPT,
  ".tsx": SupportedLanguage.TYPESCRIPT,
  ".py": SupportedLanguage.PYTHON,
  ".java": SupportedLanguage.JAVA,
  ".cpp": SupportedLanguage.CPP,
  ".c": SupportedLanguage.C,
  ".cs": SupportedLanguage.CSHARP,
  ".php": SupportedLanguage.PHP,
  ".rb": SupportedLanguage.RUBY,
  ".go": SupportedLanguage.GO,
  ".rs": SupportedLanguage.RUST,
  ".swift": SupportedLanguage.SWIFT,
  ".kt": SupportedLanguage.KOTLIN,
  ".dart": SupportedLanguage.DART,
  ".vue": SupportedLanguage.VUE,
  ".html": SupportedLanguage.HTML,
  ".css": SupportedLanguage.CSS,
  ".scss": SupportedLanguage.SCSS,
  ".sass": SupportedLanguage.SASS,
  ".less": SupportedLanguage.LESS,
  ".json": SupportedLanguage.JSON,
  ".xml": SupportedLanguage.XML,
  ".yaml": SupportedLanguage.YAML,
  ".yml": SupportedLanguage.YAML,
  ".md": SupportedLanguage.MARKDOWN,
  ".txt": SupportedLanguage.PLAINTEXT,
};

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: FileProcessingConfig = {
  maxFileSize: 1024 * 1024, // 1MB
  maxFilesPerFolder: 10,
  supportedExtensions: Object.keys(LANGUAGE_EXTENSIONS),
  binaryFileExtensions: [
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".bin",
    ".dat",
    ".db",
  ],
};

/**
 * Ollama service configuration
 */
export interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
  timeout: number;
  temperature: number;
  topP: number;
  topK: number;
}

/**
 * Default Ollama configuration
 */
export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: "http://localhost:11434",
  defaultModel: "llama3.2",
  timeout: 60000,
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
};
