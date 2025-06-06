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
        // Get paths to HTML, CSS, and JS files
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'html', 'chat.html');
        const cssPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'css', 'chat.css');
        const jsPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'js', 'chat.js');

        // Convert to webview URIs
        const cssUri = webview.asWebviewUri(cssPath);
        const jsUri = webview.asWebviewUri(jsPath);

        try {
            // Read the HTML template
            let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
            
            // Replace placeholders with actual URIs
            htmlContent = htmlContent
                .replace('{{cssPath}}', cssUri.toString())
                .replace('{{scriptPath}}', jsUri.toString());

            return htmlContent;
        } catch (error) {
            console.error('Error loading webview files:', error);
            
            // Fallback to inline HTML if files can't be loaded
            return this._getFallbackHtml();
        }
    }

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
                <p>Could not load the chat interface files. Please check that the webview files exist:</p>
                <ul>
                    <li>src/webview/html/chat.html</li>
                    <li>src/webview/css/chat.css</li>
                    <li>src/webview/js/chat.js</li>
                </ul>
            </div>
        </body>
        </html>`;
    }

    // ...existing code...

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