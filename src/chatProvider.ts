/**
 * Chat Provider for AI Code Assistant VS Code Extension
 * 
 * This module provides the main chat interface functionality including:
 * - Webview management for the chat UI
 * - File attachment and analysis capabilities
 * - Drag and drop handling for various file sources
 * - Message processing and AI response generation
 * 
 * @fileoverview Main chat provider implementation
 * @author AI Code Assistant Extension
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a single chat message in the conversation
 */
interface ChatMessage {
    id: string;
    sender: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    fileReference?: FileReference;
}

/**
 * Represents a file attachment in the chat
 */
interface FileReference {
    fileName: string;
    filePath: string;
    content: string;
    language: string;
}

/**
 * Represents an item in the chat tree view
 */
interface ChatItem {
    id: string;
    label: string;
    type: 'message' | 'file';
    message?: ChatMessage;
    collapsibleState?: vscode.TreeItemCollapsibleState;
}

/**
 * Main chat provider class that implements webview and tree data provider interfaces
 * Handles all chat functionality including file attachments and drag-and-drop
 */
export class ChatProvider implements vscode.WebviewViewProvider, vscode.TreeDataProvider<ChatItem>, vscode.TreeDragAndDropController<ChatItem> {
    public static readonly viewType = 'aiAssistantChat';
    private _view?: vscode.WebviewView;
    private messages: ChatMessage[] = [];
    
    // TreeDataProvider event emitter
    private _onDidChangeTreeData: vscode.EventEmitter<ChatItem | undefined | null | void> = new vscode.EventEmitter<ChatItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChatItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    // Drag and Drop configuration
    dropMimeTypes = ['text/uri-list', 'application/vnd.code.tree.explorer'];
    dragMimeTypes = ['text/uri-list'];

    /**
     * Maximum file size for external file drops (1MB)
     */
    private static readonly MAX_FILE_SIZE = 1024 * 1024;

    /**
     * File extensions mapped to programming languages
     */
    private static readonly LANGUAGE_MAP: { [key: string]: string } = {
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.py': 'python',
        '.java': 'java',
        '.cpp': 'cpp',
        '.c': 'c',
        '.cs': 'csharp',
        '.php': 'php',
        '.rb': 'ruby',
        '.go': 'go',
        '.rs': 'rust',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.dart': 'dart',
        '.vue': 'vue',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.sass': 'sass',
        '.less': 'less',
        '.json': 'json',
        '.xml': 'xml',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.md': 'markdown',
        '.txt': 'plaintext'
    };

    constructor(private readonly _extensionUri: vscode.Uri) {}

    /**
     * Resolves the webview view when it's first shown
     * Sets up the webview HTML content and message handlers
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        // Configure webview options
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Set webview HTML content
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            await this.handleWebviewMessage(data);
        });

        // Add welcome message
        this.addMessage('assistant', 'Hello! I\'m your coding assistant. I can help you with code review, debugging, and explanations. You can also attach files for me to analyze.');
    }

    /**
     * Handles messages received from the webview
     * Routes different message types to appropriate handlers
     */
    private async handleWebviewMessage(data: any): Promise<void> {
        try {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message, data.fileReference);
                    break;
                case 'attachFile':
                    await this.browseAndAttachFile();
                    break;
                case 'filesDropped':
                    await this.handleFilesDropped(data);
                    break;
                case 'textDropped':
                    await this.handleUserMessage(`Dropped text: ${data.text}`);
                    break;
                case 'dropFailed':
                    vscode.window.showWarningMessage(data.message);
                    break;
                default:
                    console.warn('[ChatProvider] Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('[ChatProvider] Error handling webview message:', error);
            vscode.window.showErrorMessage(`Error processing message: ${error}`);
        }
    }

    /**
     * Handles dropped files from various sources
     */
    private async handleFilesDropped(data: any): Promise<void> {
        if (data.source === 'vscode-explorer' && data.uris) {
            await this.handleVSCodeExplorerDrop(data.uris);
        } else if (data.source === 'vscode-editor-tab' && data.uris) {
            await this.handleEditorTabDrop(data.uris);
        } else if (data.source === 'os-files' && data.files) {
            vscode.window.showWarningMessage(
                'OS file drops are limited in webviews. Please use the file browser button or drag from VS Code Explorer.'
            );
        }
    }

    /**
     * Processes a user message and generates an AI response
     */
    private async handleUserMessage(message: string, fileReference?: FileReference): Promise<void> {
        if (!message.trim() && !fileReference) {
            return;
        }

        // Add user message to chat
        this.addMessage('user', message, fileReference);

        // Generate and add AI response
        const response = await this.generateResponse(message, fileReference);
        this.addMessage('assistant', response);
    }

    /**
     * Generates an AI response based on user input and optional file context
     */
    private async generateResponse(userMessage: string, fileReference?: FileReference): Promise<string> {
        if (fileReference) {
            return this.analyzeFile(fileReference, userMessage);
        }

        // Generate contextual response for text-only messages
        return this.generateTextResponse(userMessage);
    }

    /**
     * Generates responses for text-only messages
     */
    private generateTextResponse(userMessage: string): string {
        const responses = [
            `I understand you're asking about: "${userMessage}"\n\nI can help you with:\n• Code review and optimization\n• Debugging and error fixing\n• Explaining complex code\n• Suggesting improvements\n• Adding documentation\n\nWhat specific aspect would you like me to focus on?`,
            `That's an interesting question about: "${userMessage}"\n\nTo provide better assistance, could you:\n• Share the specific code you're working with\n• Describe any errors you're encountering\n• Let me know what you're trying to achieve\n\nFeel free to attach a file so I can give you more targeted help!`,
            `Thanks for your question: "${userMessage}"\n\nI'm here to help with your coding needs! You can:\n• Ask me to review specific code\n• Get help with debugging\n• Request explanations of complex logic\n• Ask for optimization suggestions\n\nHow can I assist you today?`
        ];

        return responses[Math.floor(Math.random() * responses.length)];
    }

    /**
     * Analyzes an attached file and provides insights
     */
    private analyzeFile(fileReference: FileReference, userMessage?: string): string {
        const { fileName, content, language } = fileReference;
        const stats = this.getFileStatistics(content);

        let response = `📁 **${fileName}** (${language})\n`;
        response += `📊 **Stats:** ${stats.lineCount} lines, ${this.formatFileSize(stats.fileSize)}\n\n`;

        if (userMessage) {
            response += `**Your Question:** "${userMessage}"\n\n`;
        }

        // Analyze code structure
        const codeAnalysis = this.analyzeCodeStructure(content, language);
        response += this.formatCodeAnalysis(codeAnalysis);

        response += `\n**I can help you with:**\n`;
        response += `• Code review and optimization\n`;
        response += `• Debugging and error fixing\n`;
        response += `• Explaining complex parts\n`;
        response += `• Suggesting improvements\n`;
        response += `• Adding documentation\n\n`;
        response += `**What would you like me to help you with?**`;

        return response;
    }

    /**
     * Gets basic statistics about a file's content
     */
    private getFileStatistics(content: string): { lineCount: number; fileSize: number } {
        return {
            lineCount: content.split('\n').length,
            fileSize: Buffer.byteLength(content, 'utf8')
        };
    }

    /**
     * Analyzes the structure of code content
     */
    private analyzeCodeStructure(content: string, language: string): { functions: string[]; classes: string[]; imports: string[] } {
        return {
            functions: this.extractFunctions(content, language),
            classes: this.extractClasses(content, language),
            imports: this.extractImports(content, language)
        };
    }

    /**
     * Formats code analysis results for display
     */
    private formatCodeAnalysis(analysis: { functions: string[]; classes: string[]; imports: string[] }): string {
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

    /**
     * Extracts function names from code content
     */
    private extractFunctions(content: string, language: string): string[] {
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
    private getFunctionPatterns(language: string): RegExp[] {
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
            case 'javascript':
            case 'typescript':
                return jsPatterns;
            case 'python':
                return pythonPatterns;
            default:
                return jsPatterns; // Default fallback
        }
    }

    /**
     * Extracts class names from code content
     */
    private extractClasses(content: string, language: string): string[] {
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

    /**
     * Extracts import statements from code content
     */
    private extractImports(content: string, language: string): string[] {
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
    private getImportPatterns(language: string): RegExp[] {
        switch (language) {
            case 'javascript':
            case 'typescript':
                return [/^import/, /^require\(/, /^const.*=.*require\(/];
            case 'python':
                return [/^import/, /^from.*import/];
            case 'java':
                return [/^import/];
            case 'csharp':
                return [/^using/];
            default:
                return [/^import/];
        }
    }

    /**
     * Formats file size in human-readable format
     */
    private formatFileSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
        return Math.round(bytes / (1024 * 1024)) + ' MB';
    }

    /**
     * Adds a new message to the chat and updates the UI
     */
    private addMessage(sender: 'user' | 'assistant', content: string, fileReference?: FileReference): void {
        const message: ChatMessage = {
            id: Date.now().toString(),
            sender,
            content,
            timestamp: new Date(),
            fileReference
        };

        this.messages.push(message);
        this.updateWebview();
        this.updateTreeView();
    }

    /**
     * Updates the webview with current messages
     */
    private updateWebview(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateMessages',
                messages: this.messages
            });
        }
    }

    /**
     * Updates the tree view
     */
    private updateTreeView(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Gets the programming language from file extension
     */
    private getLanguageFromExtension(ext: string): string {
        return ChatProvider.LANGUAGE_MAP[ext.toLowerCase()] || 'plaintext';
    }

    /**
     * Generates HTML content for the webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'html', 'chat.html');
        const cssPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'css', 'chat.css');
        const jsPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'js', 'chat.js');

        const cssUri = webview.asWebviewUri(cssPath);
        const jsUri = webview.asWebviewUri(jsPath);

        try {
            let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
            
            return htmlContent
                .replace('{{cssPath}}', cssUri.toString())
                .replace('{{scriptPath}}', jsUri.toString());
        } catch (error) {
            console.error('[ChatProvider] Error loading webview files:', error);
            return this._getFallbackHtml();
        }
    }

    /**
     * Provides fallback HTML when webview files can't be loaded
     */
    private _getFallbackHtml(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI Code Assistant</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 10px;
                    text-align: center;
                }
                .error {
                    color: var(--vscode-errorForeground);
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    padding: 20px;
                    border-radius: 8px;
                    margin: 20px;
                }
            </style>
        </head>
        <body>
            <div class="error">
                <h3>⚠️ Error Loading Chat Interface</h3>
                <p>Could not load the chat interface files. Please check that the webview files exist.</p>
            </div>
        </body>
        </html>`;
    }

    // TreeDataProvider implementation
    getTreeItem(element: ChatItem): vscode.TreeItem {
        const item = new vscode.TreeItem(element.label, element.collapsibleState);
        item.id = element.id;
        
        if (element.type === 'message') {
            item.iconPath = element.message?.sender === 'user' 
                ? new vscode.ThemeIcon('account') 
                : new vscode.ThemeIcon('robot');
            item.tooltip = element.message?.content;
            item.contextValue = 'chatMessage';
        } else if (element.type === 'file') {
            item.iconPath = new vscode.ThemeIcon('file');
            item.contextValue = 'chatFile';
            item.resourceUri = element.message?.fileReference 
                ? vscode.Uri.file(element.message.fileReference.filePath) 
                : undefined;
        }
        
        return item;
    }

    getChildren(element?: ChatItem): Thenable<ChatItem[]> {
        if (!element) {
            const items: ChatItem[] = [];
            
            this.messages.forEach((message) => {
                const messageItem: ChatItem = {
                    id: `message-${message.id}`,
                    label: `${message.sender}: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`,
                    type: 'message',
                    message: message,
                    collapsibleState: message.fileReference 
                        ? vscode.TreeItemCollapsibleState.Expanded 
                        : vscode.TreeItemCollapsibleState.None
                };
                items.push(messageItem);
                
                if (message.fileReference) {
                    const fileItem: ChatItem = {
                        id: `file-${message.id}`,
                        label: `📎 ${message.fileReference.fileName}`,
                        type: 'file',
                        message: message,
                        collapsibleState: vscode.TreeItemCollapsibleState.None
                    };
                    items.push(fileItem);
                }
            });
            
            return Promise.resolve(items);
        }
        
        return Promise.resolve([]);
    }

    // Public API methods

    /**
     * Shows the chat view
     */
    public reveal(): void {
        if (this._view) {
            this._view.show?.(true);
        }
    }

    /**
     * Clears all messages from the chat
     */
    public clearChat(): void {
        this.messages = [];
        this.updateWebview();
        this.updateTreeView();
    }

    /**
     * Starts a new chat session
     */
    public newChat(): void {
        this.clearChat();
        this.addMessage('assistant', 'Hello! I\'m your coding assistant. How can I help you today?');
    }

    /**
     * Attaches the currently active file to the chat
     */
    public async attachActiveFile(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active file to attach.');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const selectedText = document.getText(selection);
        const content = selectedText || document.getText();
        
        const fileReference: FileReference = {
            fileName: path.basename(document.fileName),
            filePath: document.fileName,
            content: content,
            language: document.languageId
        };

        await this.handleUserMessage(`${selectedText ? 'Selected code' : 'File content'} from ${fileReference.fileName}`, fileReference);
    }

    /**
     * Opens file browser to attach a file
     */
    public async browseAndAttachFile(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Attach File',
            filters: {
                'Code Files': ['js', 'ts', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift'],
                'Web Files': ['html', 'css', 'scss', 'vue', 'jsx', 'tsx'],
                'Data Files': ['json', 'xml', 'yaml', 'yml', 'csv'],
                'Text Files': ['md', 'txt'],
                'All Files': ['*']
            }
        });

        if (result && result[0]) {
            await this.attachFileFromPath(result[0].fsPath);
        }
    }

    /**
     * Attaches selected text from the active editor
     */
    public async attachSelectedText(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('No text selected to attach.');
            return;
        }

        const document = editor.document;
        const selectedText = document.getText(editor.selection);
        
        if (selectedText.trim()) {
            const fileReference: FileReference = {
                fileName: `${path.basename(document.fileName)} (selection)`,
                filePath: document.fileName,
                content: selectedText,
                language: document.languageId
            };

            await this.handleUserMessage(`Selected text from ${path.basename(document.fileName)}`, fileReference);
        }
    }

    /**
     * Attaches a file from a given file path
     */
    public async attachFileFromPath(filePath: string): Promise<void> {
        try {
            const fileName = path.basename(filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            const language = this.getLanguageFromExtension(path.extname(fileName));

            const fileReference: FileReference = {
                fileName,
                filePath,
                content,
                language
            };

            await this.handleUserMessage(`Attached file: ${fileName}`, fileReference);
        } catch (error) {
            console.error('[ChatProvider] Error attaching file:', error);
            vscode.window.showErrorMessage(`Failed to attach file: ${error}`);
        }
    }

    /**
     * Handles dropped URIs from various VS Code sources
     */
    public async handleDroppedUri(uri: vscode.Uri): Promise<void> {
        console.log('[ChatProvider] Processing dropped URI:', uri.toString());
        
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            
            if (stat.type === vscode.FileType.File) {
                await this.processDroppedFile(uri);
            } else if (stat.type === vscode.FileType.Directory) {
                await this.processDroppedDirectory(uri);
            }
        } catch (error) {
            console.error('[ChatProvider] Error handling dropped URI:', error);
            vscode.window.showErrorMessage(`Failed to process dropped file: ${error}`);
        }
    }

    /**
     * Processes a dropped file
     */
    private async processDroppedFile(uri: vscode.Uri): Promise<void> {
        const content = await vscode.workspace.fs.readFile(uri);
        const textContent = Buffer.from(content).toString('utf8');
        
        // Check file size
        if (content.length > ChatProvider.MAX_FILE_SIZE) {
            vscode.window.showWarningMessage(`File ${path.basename(uri.fsPath)} is too large (>${this.formatFileSize(ChatProvider.MAX_FILE_SIZE)}). Please use a smaller file.`);
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

    /**
     * Processes a dropped directory
     */
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
        
        vscode.window.showInformationMessage(`Processed ${processedFiles} files from folder: ${path.basename(uri.fsPath)}`);
    }

    /**
     * Handles VS Code Explorer file drops
     */
    private async handleVSCodeExplorerDrop(uris: string[]): Promise<void> {
        console.log('[ChatProvider] Processing VS Code Explorer drop:', uris);
        
        for (const uriString of uris) {
            try {
                const uri = vscode.Uri.parse(uriString);
                await this.handleDroppedUri(uri);
            } catch (error) {
                console.error('[ChatProvider] Error processing VS Code Explorer URI:', error);
                vscode.window.showErrorMessage(`Failed to process file: ${uriString}`);
            }
        }
        
        if (uris.length > 0) {
            vscode.window.showInformationMessage(`✅ Successfully processed ${uris.length} file(s) from VS Code Explorer!`);
        }
    }

    /**
     * Handles Editor tab file drops
     */
    private async handleEditorTabDrop(uris: string[]): Promise<void> {
        console.log('[ChatProvider] Processing Editor Tab drop:', uris);
        
        for (const uriString of uris) {
            try {
                let uri: vscode.Uri;
                
                if (uriString.startsWith('file://')) {
                    uri = vscode.Uri.parse(uriString);
                } else if (uriString.startsWith('/') || uriString.match(/^[a-zA-Z]:/)) {
                    uri = vscode.Uri.file(uriString);
                } else {
                    uri = vscode.Uri.parse(uriString);
                }
                
                console.log('[ChatProvider] Processing editor tab URI:', uri.toString());
                await this.handleDroppedUri(uri);
            } catch (error) {
                console.error('[ChatProvider] Error processing Editor Tab URI:', error);
                vscode.window.showErrorMessage(`Failed to process file from editor tab: ${uriString}`);
            }
        }
        
        if (uris.length > 0) {
            vscode.window.showInformationMessage(`✅ Successfully processed ${uris.length} file(s) from editor tab!`);
        }
    }

    // TreeDragAndDropController implementation (simplified)
    public async handleDrop(target: ChatItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        console.log('[ChatProvider] Drop detected on chat view');
        
        const uriListData = dataTransfer.get('text/uri-list');
        if (uriListData) {
            const uriString = await uriListData.asString();
            const uris = uriString.split('\r\n').filter(uri => uri.trim().length > 0);
            
            for (const uriStr of uris) {
                try {
                    const uri = vscode.Uri.parse(uriStr);
                    await this.handleDroppedUri(uri);
                } catch (error) {
                    console.error('[ChatProvider] Error processing URI:', error);
                }
            }
        }
    }

    public async handleDrag(source: readonly ChatItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const uris: string[] = [];
        
        for (const item of source) {
            if (item.type === 'file' && item.message?.fileReference) {
                uris.push(vscode.Uri.file(item.message.fileReference.filePath).toString());
            }
        }
        
        if (uris.length > 0) {
            dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uris.join('\r\n')));
        }
    }

    /**
     * Placeholder for active file change notifications
     */
    public notifyActiveFileChange(document: vscode.TextDocument): void {
        // Future enhancement: Could notify about file changes for smart context
    }
}