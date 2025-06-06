# AI Code Assistant Extension - Technical Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Features](#features)
5. [Data Flow](#data-flow)
6. [Drag & Drop System](#drag--drop-system)
7. [File Processing](#file-processing)
8. [Code Analysis](#code-analysis)
9. [User Interface](#user-interface)
10. [Extension Lifecycle](#extension-lifecycle)
11. [Configuration](#configuration)
12. [Troubleshooting](#troubleshooting)

## Overview

The AI Code Assistant is a VS Code extension that provides an intelligent chat interface for code analysis, file processing, and developer assistance. It features advanced drag-and-drop capabilities, multi-file support, and real-time code analysis.

### Key Features

- 🤖 AI-powered chat interface
- 📁 Drag-and-drop file attachment from multiple sources
- 🔍 Real-time code analysis and insights
- 📂 Multi-file and folder processing
- 🌳 Tree view integration
- ⚡ Enhanced VS Code integration

## Architecture

The extension follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension Host                    │
├─────────────────────────────────────────────────────────────┤
│  Extension Entry Point (extension.ts)                      │
│  ├── Command Registration                                   │
│  ├── Provider Registration                                  │
│  └── Event Listener Setup                                   │
├─────────────────────────────────────────────────────────────┤
│  Core Providers                                            │
│  ├── ChatProvider (chatProvider.ts)                        │
│  ├── DropZoneProvider                                       │
│  └── FileTreeDataProvider                                   │
├─────────────────────────────────────────────────────────────┤
│  Webview Components                                         │
│  ├── HTML Template (chat.html)                             │
│  ├── CSS Styling (chat.css)                                │
│  └── JavaScript Logic (chat.js)                            │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Extension Entry Point (`extension.ts`)

The main extension file that handles:

- **Extension Activation**: Initializes all components when VS Code loads the extension
- **Provider Registration**: Sets up webview, tree view, and drag-drop providers
- **Command Registration**: Defines all extension commands and their handlers
- **Event Listeners**: Manages file system watchers and editor change events

```typescript
export function activate(context: vscode.ExtensionContext) {
  // Initialize core providers
  const chatProvider = new ChatProvider(context.extensionUri);
  const dropZoneProvider = new DropZoneProvider(chatProvider);
  const fileTreeDataProvider = new FileTreeDataProvider();

  // Register all components
  registerProviders(
    context,
    chatProvider,
    dropZoneProvider,
    fileTreeDataProvider,
  );
  registerCommands(context, chatProvider, fileTreeDataProvider);
  setupEventListeners(context, chatProvider, fileTreeDataProvider);
}
```

### 2. Chat Provider (`chatProvider.ts`)

The core component that manages the chat functionality:

#### Responsibilities:

- **Webview Management**: Creates and maintains the chat UI
- **Message Processing**: Handles user input and generates AI responses
- **File Analysis**: Processes attached files and extracts code insights
- **Drag-Drop Handling**: Manages file drops from various VS Code sources

#### Key Methods:

- `resolveWebviewView()`: Sets up the webview when first displayed
- `handleUserMessage()`: Processes user input and generates responses
- `analyzeFile()`: Performs code analysis on attached files
- `handleDroppedUri()`: Processes dropped files and folders

### 3. Drop Zone Provider

Specialized provider for handling drag-and-drop operations:

#### Supported Drop Sources:

- VS Code Explorer files/folders
- Editor tabs
- External file system (limited)
- Plain text content

#### MIME Types Supported:

```typescript
dropMimeTypes = [
  "text/uri-list", // Standard URI list
  "application/vnd.code.tree.explorer", // VS Code Explorer
  "application/vnd.code.editor.drop", // Editor drops
  "text/plain", // Plain text fallback
];
```

### 4. Webview Components

#### HTML Template (`chat.html`)

- Provides the chat interface structure
- Includes message display area, input field, and drop zone
- Uses VS Code CSS variables for consistent theming

#### CSS Styling (`chat.css`)

- Implements VS Code-compliant styling
- Responsive design for different panel sizes
- Drag-and-drop visual feedback

#### JavaScript Logic (`chat.js`)

- Handles user interactions
- Manages drag-and-drop events
- Communicates with the extension backend

## Features

### 1. Chat Interface

The chat interface provides a natural way to interact with the AI assistant:

```typescript
interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  content: string;
  timestamp: Date;
  fileReference?: FileReference;
}
```

**Features:**

- Real-time messaging
- File attachment display
- Message history
- Markdown-like formatting support

### 2. File Attachment System

Multiple ways to attach files:

#### Method 1: Drag and Drop

```javascript
// Webview handles multiple drop sources
function handleDrop(e) {
  e.preventDefault();
  const dataTransfer = e.dataTransfer;

  // Process in order of preference
  if (
    processVSCodeUriList(dataTransfer) ||
    processResourceUrls(dataTransfer) ||
    processPlainText(dataTransfer)
  ) {
    // Successfully processed
  }
}
```

#### Method 2: File Browser

```typescript
public async browseAndAttachFile(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Attach File',
        filters: {
            'Code Files': ['js', 'ts', 'py', 'java', 'cpp'],
            'All Files': ['*']
        }
    });
}
```

#### Method 3: Active File/Selection

```typescript
public async attachActiveFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const document = editor.document;
        const selection = editor.selection;
        const content = selectedText || document.getText();
        // Process file content
    }
}
```

### 3. Code Analysis Engine

The extension analyzes code files to provide insights:

#### File Statistics

```typescript
private getFileStatistics(content: string): {
    lineCount: number;
    fileSize: number;
} {
    return {
        lineCount: content.split('\n').length,
        fileSize: Buffer.byteLength(content, 'utf8')
    };
}
```

#### Code Structure Analysis

- **Function Detection**: Identifies functions across multiple languages
- **Class Extraction**: Finds class/interface definitions
- **Import Analysis**: Tracks dependencies and imports
- **Language Recognition**: Auto-detects programming language

#### Language Support

```typescript
private static readonly LANGUAGE_MAP = {
    '.js': 'javascript',    '.ts': 'typescript',
    '.py': 'python',        '.java': 'java',
    '.cpp': 'cpp',          '.cs': 'csharp',
    '.php': 'php',          '.rb': 'ruby',
    '.go': 'go',            '.rs': 'rust',
    // ... more languages
};
```

## Data Flow

### 1. File Drop Flow

```
User Drags File → Webview Detects Drop → Process Data Transfer →
Extract URI/Path → Send to ChatProvider → Analyze File →
Generate Response → Update UI
```

### 2. Message Flow

```
User Types Message → Webview Captures Input → Send to Extension →
ChatProvider Processes → Generate AI Response → Update Webview →
Display in Chat
```

### 3. File Analysis Flow

```
File Attached → Read File Content → Detect Language →
Extract Functions/Classes → Analyze Structure →
Generate Insights → Format Response
```

## Drag & Drop System

### Webview Drop Handling

The webview implements sophisticated drop detection:

```javascript
function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const dataTransfer = e.dataTransfer;

  // Try different data sources in order
  if (
    processVSCodeUriList(dataTransfer) || // VS Code tabs
    processResourceUrls(dataTransfer) || // Alternative format
    processCodeEditors(dataTransfer) || // Editor specific
    processUriList(dataTransfer) || // Standard URI list
    processPlainText(dataTransfer) || // Plain text fallback
    processOSFiles(dataTransfer)
  ) {
    // OS file objects
    return;
  }

  handleDropFailure(dataTransfer);
}
```

### Extension Drop Handling

The extension provides additional drop zones:

```typescript
public async handleDrop(
    target: DropZoneItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
): Promise<void> {
    const uriListData = dataTransfer.get('text/uri-list');
    if (uriListData) {
        const uriString = await uriListData.asString();
        const uris = uriString.split('\r\n').filter(uri => uri.trim());

        for (const uriStr of uris) {
            const uri = vscode.Uri.parse(uriStr);
            await this.chatProvider.handleDroppedUri(uri);
        }
    }
}
```

## File Processing

### Single File Processing

```typescript
private async processDroppedFile(uri: vscode.Uri): Promise<void> {
    const content = await vscode.workspace.fs.readFile(uri);
    const textContent = Buffer.from(content).toString('utf8');

    // Check file size limits
    if (content.length > MAX_FILE_SIZE) {
        vscode.window.showWarningMessage('File too large');
        return;
    }

    const fileReference: FileReference = {
        fileName: path.basename(uri.fsPath),
        filePath: uri.fsPath,
        content: textContent,
        language: this.getLanguageFromExtension(path.extname(uri.fsPath))
    };

    await this.handleUserMessage(`Dropped file: ${fileReference.fileName}`, fileReference);
}
```

### Folder Processing

```typescript
private async processDroppedDirectory(uri: vscode.Uri): Promise<void> {
    const files = await vscode.workspace.fs.readDirectory(uri);
    let processedFiles = 0;
    const maxFiles = 10;

    for (const [fileName, fileType] of files) {
        if (fileType === vscode.FileType.File && processedFiles < maxFiles) {
            const fileUri = vscode.Uri.joinPath(uri, fileName);
            await this.processDroppedFile(fileUri);
            processedFiles++;
        }
    }
}
```

## Code Analysis

### Function Extraction

The extension uses pattern matching to identify functions:

```typescript
private getFunctionPatterns(language: string): RegExp[] {
    const jsPatterns = [
        /function\s+(\w+)/,           // function name()
        /(\w+)\s*\(.*\)\s*{/,        // name() {
        /(\w+):\s*function/,         // name: function
        /const\s+(\w+)\s*=/,         // const name =
    ];

    const pythonPatterns = [
        /def\s+(\w+)/,               // def name():
        /async\s+def\s+(\w+)/        // async def name():
    ];

    return language === 'python' ? pythonPatterns : jsPatterns;
}
```

### Class Detection

```typescript
private getClassPatterns(language: string): RegExp[] {
    switch (language) {
        case 'javascript':
        case 'typescript':
            return [/class\s+(\w+)/, /interface\s+(\w+)/, /type\s+(\w+)/];
        case 'python':
            return [/class\s+(\w+)/];
        case 'java':
        case 'csharp':
            return [/class\s+(\w+)/, /interface\s+(\w+)/];
        default:
            return [/class\s+(\w+)/];
    }
}
```

## User Interface

### VS Code Integration

The extension integrates seamlessly with VS Code:

#### Activity Bar

- Custom icon in the activity bar
- Dedicated view container for all extension views

#### Views

- **Chat View**: Main webview for conversations
- **Drop Zone**: Visual drag-and-drop area
- **Attached Files**: Tree view of processed files

#### Commands

```json
{
  "ai-assistant.openChat": "Open AI Assistant",
  "ai-assistant.attachActiveFile": "Attach Active File",
  "ai-assistant.attachSelection": "Attach Selected Code",
  "ai-assistant.clearChat": "Clear Chat History"
}
```

#### Context Menus

- Explorer context menu for file attachment
- Editor context menu for selection attachment
- Tab context menu integration

### Status Bar

```typescript
function createStatusBarItem(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(robot) AI Assistant";
  statusBarItem.tooltip = "Open AI Assistant Chat";
  statusBarItem.command = "ai-assistant.openChat";
  statusBarItem.show();
}
```

## Extension Lifecycle

### Activation

```typescript
export function activate(context: vscode.ExtensionContext) {
  console.log("[Extension] Activating AI Code Assistant...");

  try {
    // 1. Initialize providers
    const chatProvider = new ChatProvider(context.extensionUri);
    const dropZoneProvider = new DropZoneProvider(chatProvider);
    const fileTreeDataProvider = new FileTreeDataProvider();

    // 2. Register components
    registerProviders(
      context,
      chatProvider,
      dropZoneProvider,
      fileTreeDataProvider,
    );
    registerCommands(context, chatProvider, fileTreeDataProvider);
    setupEventListeners(context, chatProvider, fileTreeDataProvider);
    createStatusBarItem(context);

    console.log("[Extension] Activated successfully!");
  } catch (error) {
    console.error("[Extension] Activation failed:", error);
    vscode.window.showErrorMessage(`Failed to activate: ${error}`);
  }
}
```

### Deactivation

```typescript
export function deactivate() {
  console.log("[Extension] Deactivating AI Code Assistant...");
  // Cleanup resources if needed
}
```

## Configuration

### Package.json Configuration

#### Extension Metadata

```json
{
  "name": "ai-code-assistant",
  "displayName": "AI Code Assistant",
  "description": "An AI-powered code assistant with enhanced drag-and-drop functionality",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.80.0"
  }
}
```

#### Activation Events

```json
{
  "activationEvents": [
    "onStartupFinished",
    "onView:aiAssistantChat",
    "onCommand:ai-assistant.openChat"
  ]
}
```

#### View Containers

```json
{
  "viewsContainers": {
    "activitybar": [
      {
        "id": "ai-assistant",
        "title": "AI Assistant",
        "icon": "$(robot)"
      }
    ]
  }
}
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",
    "lib": ["ES2020"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true
  }
}
```

## Troubleshooting

### Common Issues

#### 1. Drag and Drop Not Working

**Symptoms**: Files don't attach when dragged to the extension
**Solution**:

- Check browser security settings in webview
- Verify MIME type support in console logs
- Ensure preventDefault() is called in drag handlers

#### 2. File Analysis Errors

**Symptoms**: Files attach but analysis fails
**Solution**:

- Check file size limits (1MB max)
- Verify file encoding (UTF-8 required)
- Check language detection patterns

#### 3. Webview Not Loading

**Symptoms**: Chat interface shows error message
**Solution**:

- Verify webview files exist in correct paths
- Check file permissions
- Review console errors in developer tools

### Debug Logging

The extension includes comprehensive logging:

```typescript
// Enable debug logging
console.log("[Extension] Debug message");
console.log("[ChatProvider] Processing file:", fileName);
console.log("[DropZone] Available MIME types:", types);
```

### Performance Considerations

#### File Size Limits

```typescript
private static readonly MAX_FILE_SIZE = 1024 * 1024; // 1MB
```

#### Folder Processing Limits

```typescript
const maxFiles = 10; // Maximum files per folder
```

#### Memory Management

- DOM elements are cached for performance
- Event listeners are properly disposed
- Large file content is not stored permanently

### Extension Development

#### Building

```bash
npm run compile
```

#### Testing

```bash
# Launch VS Code Extension Development Host
F5 (in VS Code)
```

#### Packaging

```bash
vsce package
```

## Future Enhancements

### Planned Features

1. **Real AI Integration**: Connect to actual AI services
2. **Code Generation**: Generate code based on descriptions
3. **Advanced Analysis**: Deeper code quality insights
4. **Project Context**: Understand entire project structure
5. **Collaborative Features**: Share insights with team members

### Architecture Improvements

1. **Plugin System**: Allow custom analyzers
2. **Caching**: Implement intelligent file caching
3. **Streaming**: Support large file streaming
4. **Workspace Integration**: Better workspace understanding

---

_Last updated: June 6, 2025_
