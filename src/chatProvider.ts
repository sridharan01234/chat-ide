import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface ChatMessage {
    id: string;
    sender: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    fileReference?: FileReference;
}

interface FileReference {
    fileName: string;
    filePath: string;
    content: string;
    language: string;
}

interface ChatItem {
    id: string;
    label: string;
    type: 'message' | 'file';
    message?: ChatMessage;
    collapsibleState?: vscode.TreeItemCollapsibleState;
}

export class ChatProvider implements vscode.WebviewViewProvider, vscode.TreeDataProvider<ChatItem>, vscode.TreeDragAndDropController<ChatItem> {
    public static readonly viewType = 'aiAssistantChat';
    private _view?: vscode.WebviewView;
    private messages: ChatMessage[] = [];
    
    // TreeDataProvider implementation
    private _onDidChangeTreeData: vscode.EventEmitter<ChatItem | undefined | null | void> = new vscode.EventEmitter<ChatItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChatItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    // Drag and Drop support
    dropMimeTypes = ['text/uri-list', 'application/vnd.code.tree.explorer'];
    dragMimeTypes = ['text/uri-list'];

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message, data.fileReference);
                    break;
                case 'attachFile':
                    await this.attachFile();
                    break;
                case 'filesDropped':
                    if (data.source === 'vscode-explorer' && data.uris) {
                        await this.handleVSCodeExplorerDrop(data.uris);
                    } else if (data.source === 'vscode-editor-tab' && data.uris) {
                        await this.handleEditorTabDrop(data.uris);
                    } else if (data.source === 'os-files' && data.files) {
                        vscode.window.showWarningMessage(
                            'OS file drops are limited in webviews. Please use the file browser button or drag from VS Code Explorer while holding Shift.'
                        );
                    }
                    break;
                case 'textDropped':
                    await this.handleUserMessage(`Dropped text: ${data.text}`);
                    break;
                case 'dropFailed':
                    vscode.window.showWarningMessage(data.message);
                    break;
            }
        });

        // Add welcome message
        this.addMessage('assistant', 'Hello! I\'m your coding assistant. I can help you with code review, debugging, and explanations. You can also attach files for me to analyze.');
    }

    private async handleUserMessage(message: string, fileReference?: FileReference) {
        if (!message.trim() && !fileReference) {
            return;
        }

        // Add user message
        this.addMessage('user', message, fileReference);

        // Generate AI response
        const response = await this.generateResponse(message, fileReference);
        this.addMessage('assistant', response);
    }

    private async generateResponse(userMessage: string, fileReference?: FileReference): Promise<string> {
        if (fileReference) {
            return this.analyzeFile(fileReference, userMessage);
        }

        // Simple response for text-only messages
        const responses = [
            `I understand you're asking about: "${userMessage}"\n\nI can help you with:\n• Code review and optimization\n• Debugging and error fixing\n• Explaining complex code\n• Suggesting improvements\n• Adding documentation\n\nWhat specific aspect would you like me to focus on?`,
            `That's an interesting question about: "${userMessage}"\n\nTo provide better assistance, could you:\n• Share the specific code you're working with\n• Describe any errors you're encountering\n• Let me know what you're trying to achieve\n\nFeel free to attach a file so I can give you more targeted help!`,
            `Thanks for your question: "${userMessage}"\n\nI'm here to help with your coding needs! You can:\n• Ask me to review specific code\n• Get help with debugging\n• Request explanations of complex logic\n• Ask for optimization suggestions\n\nHow can I assist you today?`
        ];

        return responses[Math.floor(Math.random() * responses.length)];
    }

    private analyzeFile(fileReference: FileReference, userMessage?: string): string {
        const { fileName, content, language } = fileReference;
        const lineCount = content.split('\n').length;
        const fileSize = Buffer.byteLength(content, 'utf8');

        let response = `📁 **${fileName}** (${language})\n`;
        response += `📊 **Stats:** ${lineCount} lines, ${this.formatFileSize(fileSize)}\n\n`;

        if (userMessage) {
            response += `**Your Question:** "${userMessage}"\n\n`;
        }

        // Simple code analysis
        const functions = this.extractFunctions(content, language);
        const classes = this.extractClasses(content, language);

        if (functions.length > 0) {
            response += `🔧 **Functions found:** ${functions.slice(0, 3).join(', ')}${functions.length > 3 ? '...' : ''}\n`;
        }

        if (classes.length > 0) {
            response += `📦 **Classes found:** ${classes.slice(0, 3).join(', ')}${classes.length > 3 ? '...' : ''}\n`;
        }

        response += `\n**I can help you with:**\n`;
        response += `• Code review and optimization\n`;
        response += `• Debugging and error fixing\n`;
        response += `• Explaining complex parts\n`;
        response += `• Suggesting improvements\n`;
        response += `• Adding documentation\n\n`;
        response += `**What would you like me to help you with?**`;

        return response;
    }

    private extractFunctions(content: string, language: string): string[] {
        const functions: string[] = [];
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (language === 'javascript' || language === 'typescript') {
                const functionMatch = trimmed.match(/function\s+(\w+)|(\w+)\s*\(.*\)\s*{|(\w+):\s*function/);
                if (functionMatch) {
                    const funcName = functionMatch[1] || functionMatch[2] || functionMatch[3];
                    if (funcName && !functions.includes(funcName)) {
                        functions.push(funcName);
                    }
                }
            }
        }

        return functions;
    }

    private extractClasses(content: string, language: string): string[] {
        const classes: string[] = [];
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (language === 'javascript' || language === 'typescript') {
                const classMatch = trimmed.match(/class\s+(\w+)/);
                if (classMatch) {
                    const className = classMatch[1];
                    if (className && !classes.includes(className)) {
                        classes.push(className);
                    }
                }
            }
        }

        return classes;
    }

    private formatFileSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
        return Math.round(bytes / (1024 * 1024)) + ' MB';
    }

    private addMessage(sender: 'user' | 'assistant', content: string, fileReference?: FileReference) {
        const message: ChatMessage = {
            id: Date.now().toString(),
            sender,
            content,
            timestamp: new Date(),
            fileReference
        };

        this.messages.push(message);
        this.updateWebview();
    }

    private updateWebview() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateMessages',
                messages: this.messages
            });
        }
    }

    public attachFileFromEditor() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
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

            this.handleUserMessage(`Selected code from ${fileReference.fileName}`, fileReference);
        }
    }

    private async attachFile() {
        const result = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Attach File',
            filters: {
                'Code Files': ['js', 'ts', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift'],
                'All Files': ['*']
            }
        });

        if (result && result[0]) {
            const filePath = result[0].fsPath;
            const fileName = path.basename(filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            const language = this.getLanguageFromExtension(path.extname(fileName));

            const fileReference: FileReference = {
                fileName,
                filePath,
                content,
                language
            };

            this.handleUserMessage(`Attached file: ${fileName}`, fileReference);
        }
    }

    private async handleDroppedFiles(files: string[]) {
        for (const file of files) {
            const filePath = file;
            const fileName = path.basename(filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            const language = this.getLanguageFromExtension(path.extname(fileName));

            const fileReference: FileReference = {
                fileName,
                filePath,
                content,
                language
            };

            await this.handleUserMessage(`Dropped file: ${fileName}`, fileReference);
        }
    }

    private async handleDroppedUris(uris: string[]) {
        for (const uri of uris) {
            const filePath = uri;
            const fileName = path.basename(filePath);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const language = this.getLanguageFromExtension(path.extname(fileName));

                const fileReference: FileReference = {
                    fileName,
                    filePath,
                    content,
                    language
                };

                await this.handleUserMessage(`Dropped URI: ${fileName}`, fileReference);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Error processing dropped URI ${fileName}: ${errorMessage}`);
            }
        }
    }

    private getLanguageFromExtension(ext: string): string {
        const extensionMap: { [key: string]: string } = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.py': 'python',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp',
            '.php': 'php',
            '.rb': 'ruby',
            '.go': 'go',
            '.rs': 'rust',
            '.swift': 'swift'
        };

        return extensionMap[ext.toLowerCase()] || 'text';
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI Code Assistant</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 10px;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                }
                
                .shift-notice {
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 8px 12px;
                    border-radius: 4px;
                    margin-bottom: 10px;
                    font-size: 0.9em;
                    text-align: center;
                    border: 1px solid var(--vscode-widget-border);
                }
                
                .chat-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 10px;
                    margin-bottom: 10px;
                    border: 2px dashed var(--vscode-widget-border);
                    border-radius: 8px;
                    transition: all 0.3s ease;
                    position: relative;
                    min-height: 200px;
                }
                
                .chat-container.drag-active {
                    border-color: var(--vscode-button-background);
                    background-color: var(--vscode-editor-selectionBackground);
                }
                
                .drop-indicator {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    padding: 20px;
                    border-radius: 8px;
                    font-weight: bold;
                    z-index: 1000;
                    display: none;
                    text-align: center;
                }
                
                .message {
                    margin-bottom: 15px;
                    padding: 10px;
                    border-radius: 8px;
                    max-width: 90%;
                    animation: fadeIn 0.3s ease-in;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                .user-message {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    margin-left: auto;
                    text-align: right;
                }
                
                .assistant-message {
                    background-color: var(--vscode-editor-selectionBackground);
                    border: 1px solid var(--vscode-widget-border);
                }
                
                .message-content {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    line-height: 1.4;
                }
                
                .file-attachment {
                    background-color: var(--vscode-textCodeBlock-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    padding: 8px;
                    margin-top: 8px;
                    font-size: 0.9em;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .input-container {
                    display: flex;
                    gap: 8px;
                    padding: 10px 0;
                    border-top: 1px solid var(--vscode-widget-border);
                }
                
                .message-input {
                    flex: 1;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-family: inherit;
                    resize: none;
                    min-height: 20px;
                    max-height: 100px;
                }
                
                .send-button, .attach-button {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 4px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    cursor: pointer;
                    font-family: inherit;
                    transition: background-color 0.2s ease;
                }
                
                .send-button:hover, .attach-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="shift-notice">
                ⚠️ Hold <strong>Shift</strong> while dragging files from Explorer to drop them here
            </div>
            
            <div class="chat-container" id="chatContainer">
                <div class="drop-indicator" id="dropIndicator">
                    📁 Drop files here to attach them
                </div>
            </div>
            
            <div class="input-container">
                <textarea id="messageInput" class="message-input" placeholder="Type your message..." rows="1"></textarea>
                <button id="attachButton" class="attach-button" title="Attach File">📎</button>
                <button id="sendButton" class="send-button">Send</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let messages = [];

                // VS Code specific drag and drop handling
                document.addEventListener('dragover', function(e) {
                    e.preventDefault(); // CRITICAL: Must prevent default to allow drop
                    e.stopPropagation();
                    
                    const container = document.getElementById('chatContainer');
                    const indicator = document.getElementById('dropIndicator');
                    
                    container.classList.add('drag-active');
                    indicator.style.display = 'block';
                });

                document.addEventListener('dragleave', function(e) {
                    // Only hide if leaving the document entirely
                    if (e.clientX === 0 && e.clientY === 0) {
                        const container = document.getElementById('chatContainer');
                        const indicator = document.getElementById('dropIndicator');
                        
                        container.classList.remove('drag-active');
                        indicator.style.display = 'none';
                    }
                });

                document.addEventListener('drop', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    console.log('[Webview] Drop event triggered');
                    
                    const container = document.getElementById('chatContainer');
                    const indicator = document.getElementById('dropIndicator');
                    
                    container.classList.remove('drag-active');
                    indicator.style.display = 'none';
                    
                    // VS Code specific: Extract data using proper MIME types
                    const dataTransfer = e.dataTransfer;
                    
                    // Log all available types for debugging
                    console.log('[Webview] DataTransfer types:', dataTransfer.types);
                    console.log('[Webview] DataTransfer items count:', dataTransfer.items.length);
                    console.log('[Webview] DataTransfer files count:', dataTransfer.files.length);
                    
                    // Try all possible data extraction methods
                    let foundData = false;
                    
                    // Method 1: Try application/vnd.code.uri-list (Editor tabs use this)
                    const vscodeUriList = dataTransfer.getData('application/vnd.code.uri-list');
                    if (vscodeUriList && vscodeUriList.trim()) {
                        console.log('[Webview] VS Code URI list found:', vscodeUriList);
                        const uris = vscodeUriList.split(/[\\r\\n]+/).filter(uri => uri.trim());
                        if (uris.length > 0) {
                            vscode.postMessage({
                                type: 'filesDropped',
                                source: 'vscode-editor-tab',
                                uris: uris
                            });
                            foundData = true;
                        }
                    }
                    
                    // Method 2: Try resourceurls (Editor tabs)
                    if (!foundData) {
                        const resourceUrls = dataTransfer.getData('resourceurls');
                        if (resourceUrls && resourceUrls.trim()) {
                            console.log('[Webview] Resource URLs found:', resourceUrls);
                            const uris = resourceUrls.split(/[\\r\\n]+/).filter(uri => uri.trim());
                            if (uris.length > 0) {
                                vscode.postMessage({
                                    type: 'filesDropped',
                                    source: 'vscode-editor-tab',
                                    uris: uris
                                });
                                foundData = true;
                            }
                        }
                    }
                    
                    // Method 3: Try codeeditors (Editor tabs)
                    if (!foundData) {
                        const codeEditors = dataTransfer.getData('codeeditors');
                        if (codeEditors && codeEditors.trim()) {
                            console.log('[Webview] Code editors data found:', codeEditors);
                            try {
                                // Try to parse as JSON in case it contains structured data
                                const editorData = JSON.parse(codeEditors);
                                if (editorData && editorData.resource) {
                                    vscode.postMessage({
                                        type: 'filesDropped',
                                        source: 'vscode-editor-tab',
                                        uris: [editorData.resource]
                                    });
                                    foundData = true;
                                } else if (Array.isArray(editorData)) {
                                    const uris = editorData.map(item => item.resource).filter(Boolean);
                                    if (uris.length > 0) {
                                        vscode.postMessage({
                                            type: 'filesDropped',
                                            source: 'vscode-editor-tab',
                                            uris: uris
                                        });
                                        foundData = true;
                                    }
                                }
                            } catch {
                                // If not JSON, treat as plain text URI
                                if (codeEditors.startsWith('file://') || codeEditors.includes('/')) {
                                    vscode.postMessage({
                                        type: 'filesDropped',
                                        source: 'vscode-editor-tab',
                                        uris: [codeEditors]
                                    });
                                    foundData = true;
                                }
                            }
                        }
                    }
                    
                    // Method 4: Try text/uri-list (VS Code Explorer files)
                    if (!foundData) {
                        const uriList = dataTransfer.getData('text/uri-list');
                        if (uriList && uriList.trim()) {
                            console.log('[Webview] URI list found:', uriList);
                            const uris = uriList.split(/[\\r\\n]+/).filter(uri => uri.trim());
                            if (uris.length > 0) {
                                vscode.postMessage({
                                    type: 'filesDropped',
                                    source: 'vscode-explorer',
                                    uris: uris
                                });
                                foundData = true;
                            }
                        }
                    }
                    
                    // Method 5: Try text/plain (Sometimes used as fallback)
                    if (!foundData) {
                        const plainText = dataTransfer.getData('text/plain');
                        if (plainText && plainText.trim()) {
                            console.log('[Webview] Plain text found:', plainText);
                            
                            // Check if it's a file URI or path
                            if (plainText.startsWith('file://') || plainText.includes('/')) {
                                vscode.postMessage({
                                    type: 'filesDropped',
                                    source: 'vscode-editor-tab',
                                    uris: [plainText]
                                });
                                foundData = true;
                            } else {
                                // It's just text content
                                vscode.postMessage({
                                    type: 'textDropped',
                                    text: plainText
                                });
                                foundData = true;
                            }
                        }
                    }
                    
                    // Method 6: Check for actual File objects (OS drops - limited in webviews)
                    if (!foundData && dataTransfer.files.length > 0) {
                        console.log('[Webview] OS files detected (limited support)');
                        const filePaths = Array.from(dataTransfer.files).map(file => file.name);
                        vscode.postMessage({
                            type: 'filesDropped',
                            source: 'os-files',
                            files: filePaths
                        });
                        foundData = true;
                    }
                    
                    if (!foundData) {
                        console.log('[Webview] No supported drop data found');
                        console.log('[Webview] Available types:', Array.from(dataTransfer.types));
                        
                        // Log each type's content for debugging
                        for (const type of dataTransfer.types) {
                            const data = dataTransfer.getData(type);
                            console.log('[Webview] Type "' + type + '":', data);
                        }
                        
                        vscode.postMessage({
                            type: 'dropFailed',
                            message: 'No supported files found. Available types: ' + Array.from(dataTransfer.types).join(', ')
                        });
                    }
                });

                function renderMessages() {
                    const container = document.getElementById('chatContainer');
                    container.innerHTML = '<div class="drop-indicator" id="dropIndicator">📁 Drop files here to attach them</div>';
                    
                    messages.forEach(message => {
                        const messageDiv = document.createElement('div');
                        messageDiv.className = 'message ' + (message.sender === 'user' ? 'user-message' : 'assistant-message');
                        
                        const contentDiv = document.createElement('div');
                        contentDiv.className = 'message-content';
                        contentDiv.innerHTML = formatMessageContent(message.content);
                        messageDiv.appendChild(contentDiv);
                        
                        if (message.fileReference) {
                            const fileDiv = document.createElement('div');
                            fileDiv.className = 'file-attachment';
                            fileDiv.innerHTML = '📎 ' + message.fileReference.fileName;
                            messageDiv.appendChild(fileDiv);
                        }
                        
                        container.appendChild(messageDiv);
                    });
                    
                    container.scrollTop = container.scrollHeight;
                }

                function formatMessageContent(content) {
                    return content
                        .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
                        .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
                        .replace(/\\n/g, '<br>');
                }

                function sendMessage() {
                    const input = document.getElementById('messageInput');
                    const message = input.value.trim();
                    
                    if (message) {
                        vscode.postMessage({
                            type: 'sendMessage',
                            message: message
                        });
                        input.value = '';
                    }
                }

                // Event listeners
                document.getElementById('sendButton').addEventListener('click', sendMessage);
                document.getElementById('attachButton').addEventListener('click', () => {
                    vscode.postMessage({ type: 'attachFile' });
                });
                
                document.getElementById('messageInput').addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });

                // Listen for messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'updateMessages':
                            messages = message.messages;
                            renderMessages();
                            break;
                    }
                });

                // Initial render
                renderMessages();
            </script>
        </body>
        </html>`;
    }

    // TreeDataProvider methods
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
            // Root level - return all messages
            const items: ChatItem[] = [];
            
            this.messages.forEach((message, index) => {
                const messageItem: ChatItem = {
                    id: `message-${message.id}`,
                    label: `${message.sender}: ${message.content.substring(0, 50)}...`,
                    type: 'message',
                    message: message,
                    collapsibleState: message.fileReference 
                        ? vscode.TreeItemCollapsibleState.Expanded 
                        : vscode.TreeItemCollapsibleState.None
                };
                items.push(messageItem);
                
                // Add file as child if present
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

    private updateTreeView() {
        this._onDidChangeTreeData.fire();
    }

    public reveal() {
        if (this._view) {
            this._view.show?.(true);
        }
    }

    public clearChat() {
        this.messages = [];
        this.updateWebview();
    }

    public newChat() {
        this.clearChat();
        this.addMessage('assistant', 'Hello! I\'m your coding assistant. How can I help you today?');
    }

    public notifyActiveFileChange(document: vscode.TextDocument) {
        // Optional: You can add logic here to notify about file changes
        // For now, we'll just keep it empty as it's not essential for chat functionality
    }

    public async attachActiveFile() {
        this.attachFileFromEditor();
    }

    public async browseAndAttachFile() {
        await this.attachFile();
    }

    public async attachSelectedText() {
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
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
    }

    public async attachFileFromPath(filePath: string) {
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
            vscode.window.showErrorMessage(`Failed to attach file: ${error}`);
        }
    }

    // Public method for drop zone provider to call
    public async handleDroppedUri(uri: vscode.Uri): Promise<void> {
        console.log('[ChatProvider] Processing dropped URI:', uri.toString());
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            
            if (stat.type === vscode.FileType.File) {
                const content = await vscode.workspace.fs.readFile(uri);
                const textContent = Buffer.from(content).toString('utf8');
                
                const fileReference: FileReference = {
                    fileName: path.basename(uri.fsPath),
                    filePath: uri.fsPath,
                    content: textContent,
                    language: this.getLanguageFromExtension(path.extname(uri.fsPath))
                };
                
                await this.handleUserMessage(`Dropped file: ${fileReference.fileName}`, fileReference);
            } else if (stat.type === vscode.FileType.Directory) {
                // Handle directory drop
                const files = await vscode.workspace.fs.readDirectory(uri);
                let processedFiles = 0;
                
                for (const [fileName, fileType] of files) {
                    if (fileType === vscode.FileType.File && processedFiles < 10) {
                        const fileUri = vscode.Uri.joinPath(uri, fileName);
                        await this.handleDroppedUri(fileUri);
                        processedFiles++;
                    }
                }
                
                vscode.window.showInformationMessage(`Processed ${processedFiles} files from folder: ${path.basename(uri.fsPath)}`);
            }
        } catch (error) {
            console.error('[ChatProvider] Error handling dropped URI:', error);
            vscode.window.showErrorMessage(`Failed to process dropped file: ${error}`);
        }
    }

    // TreeDragAndDropController implementation
    public async handleDrop(target: ChatItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        console.log('[ChatProvider] Drop detected on chat view');
        
        // Handle URI list drops (from VS Code Explorer)
        const uriListData = dataTransfer.get('text/uri-list');
        if (uriListData) {
            console.log('[ChatProvider] URI list drop detected');
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
            return;
        }

        // Handle file drops (from external sources)
        const fileData = dataTransfer.get('application/vnd.code.tree.explorer');
        if (fileData) {
            console.log('[ChatProvider] Explorer file drop detected');
            const fileString = await fileData.asString();
            try {
                const fileInfo = JSON.parse(fileString);
                await this.handleDroppedExplorerFile(fileInfo);
            } catch (error) {
                console.error('[ChatProvider] Error processing explorer file:', error);
            }
            return;
        }

        console.log('[ChatProvider] No supported drop data found');
    }

    public async handleDrag(source: readonly ChatItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        // Allow dragging chat messages/files out
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

    private async handleDroppedExplorerFile(fileInfo: any): Promise<void> {
        console.log('[ChatProvider] Processing explorer file:', fileInfo);
        // Process VS Code explorer specific file drops
        if (fileInfo.resource) {
            const uri = vscode.Uri.parse(fileInfo.resource);
            await this.handleDroppedUri(uri);
        }
    }

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

    private async handleEditorTabDrop(uris: string[]): Promise<void> {
        console.log('[ChatProvider] Processing Editor Tab drop:', uris);
        
        for (const uriString of uris) {
            try {
                // Handle both file:// URIs and plain file paths
                let uri: vscode.Uri;
                if (uriString.startsWith('file://')) {
                    uri = vscode.Uri.parse(uriString);
                } else if (uriString.startsWith('/') || uriString.match(/^[a-zA-Z]:/)) {
                    // It's a file path, convert to URI
                    uri = vscode.Uri.file(uriString);
                } else {
                    // Try parsing as is
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
}