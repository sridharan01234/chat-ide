/**
 * Chat Provider for AI Code Assistant VS Code Extension
 * 
 * This module handles chat functionality including message management,
 * webview communication, and chat state management.
 * 
 * @fileoverview Chat provider and message management
 * @author AI Code Assistant Extension
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ChatMessage, FileReference, WebviewMessageType, WebviewMessage } from './types';
import { StringUtils, FileUtils, ErrorUtils } from './utils';
import { FileManager, FileAttachmentManager } from './fileManager';
import { OllamaService } from './ollamaService';

/**
 * Main chat provider that handles the webview and chat functionality
 */
export class ChatProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiAssistantChat';

    private _view?: vscode.WebviewView;
    private messages: ChatMessage[] = [];
    private fileManager: FileManager;
    private fileAttachmentManager: FileAttachmentManager;
    private ollamaService: OllamaService;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        fileManager: FileManager,
        fileAttachmentManager: FileAttachmentManager,
        ollamaService: OllamaService
    ) {
        this.fileManager = fileManager;
        this.fileAttachmentManager = fileAttachmentManager;
        this.ollamaService = ollamaService;
    }

    /**
     * Resolves the webview view
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            (message: WebviewMessage) => this.handleWebviewMessage(message),
            undefined,
            []
        );

        // Send initial state
        this.updateWebviewMessages();
        this.updateWebviewStagedFiles();
    }

    /**
     * Handles messages received from the webview
     */
    private async handleWebviewMessage(message: WebviewMessage): Promise<void> {
        console.log('[ChatProvider] Received message:', message.type);
        
        try {
            switch (message.type) {
                case WebviewMessageType.SEND_MESSAGE:
                    await this.handleSendMessage(message.text);
                    break;

                case WebviewMessageType.ATTACH_FILE:
                    await this.handleAttachFile();
                    break;

                case WebviewMessageType.CLEAR_STAGED_FILE:
                    this.handleClearStagedFiles();
                    break;

                case WebviewMessageType.FILES_DROPPED:
                    await this.handleFilesDropped(message.files);
                    break;

                case WebviewMessageType.TEXT_DROPPED:
                    await this.handleTextDropped(message.text);
                    break;

                case WebviewMessageType.CLEAR_CHAT:
                    this.clearMessages();
                    break;

                default:
                    console.warn('[ChatProvider] Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('[ChatProvider] Error handling message:', error);
            ErrorUtils.logError('ChatProvider.handleWebviewMessage', error);
            vscode.window.showErrorMessage(ErrorUtils.createUserFriendlyError(error));
        }
    }

    /**
     * Handles sending a message
     */
    private async handleSendMessage(text: string): Promise<void> {
        if (!text?.trim()) {
            vscode.window.showWarningMessage('Please enter a message');
            return;
        }

        try {
            // Get any staged files for the user message
            const attachedFiles = this.fileAttachmentManager.consumeStagedFiles();
            const fileReference = attachedFiles.length > 0 ? attachedFiles[0] : undefined;

            // Add user message
            const userMessage: ChatMessage = {
                id: StringUtils.generateId(),
                sender: 'user',
                content: text,
                timestamp: new Date(),
                fileReference
            };

            this.addMessage(userMessage);

            // Show typing indicator
            this.sendToWebview({
                type: WebviewMessageType.UPDATE_MESSAGES,
                messages: [...this.messages, {
                    id: 'typing',
                    sender: 'assistant',
                    content: 'Thinking...',
                    timestamp: new Date()
                }]
            });

            // Get AI response
            let prompt = text;
            if (fileReference) {
                prompt = this.createFilePrompt(text, fileReference);
            }

            // Check if Ollama service is available
            const connectionStatus = this.ollamaService.getConnectionStatus();
            if (!connectionStatus.connected) {
                throw new Error('AI service is not available. Please make sure Ollama is running.');
            }

            // Get any remaining staged files for context
            const contextFiles = this.fileAttachmentManager.getStagedFiles();
            let context = '';

            if (contextFiles.length > 0) {
                context = contextFiles.map(file => 
                    `File: ${file.fileName}\nLanguage: ${file.language}\nContent:\n${file.content}\n`
                ).join('\n---\n');
            }

            // Generate AI response using the correct method
            const aiResponse = await this.ollamaService.getCodingHelp(text, context);
            
            // Remove typing indicator and add real response
            const assistantMessage: ChatMessage = {
                id: StringUtils.generateId(),
                sender: 'assistant',
                content: aiResponse,
                timestamp: new Date()
            };

            this.addMessage(assistantMessage);
        } catch (error) {
            ErrorUtils.logError('ChatProvider.handleSendMessage', error);
            
            // Add error message
            const errorMessage: ChatMessage = {
                id: StringUtils.generateId(),
                sender: 'assistant',
                content: `Error: ${ErrorUtils.createUserFriendlyError(error)}`,
                timestamp: new Date()
            };
            
            this.addMessage(errorMessage);
        }
    }

    /**
     * Creates a prompt that includes file context
     */
    private createFilePrompt(userMessage: string, fileReference: FileReference): string {
        const fileInfo = `File: ${fileReference.fileName} (${fileReference.language})
Lines: ${fileReference.lineCount}
Size: ${FileUtils.formatFileSize(fileReference.size || 0)}

Content:
\`\`\`${fileReference.language}
${fileReference.content}
\`\`\`

`;
        
        return `${fileInfo}User question: ${userMessage}`;
    }

    /**
     * Handles file attachment from command
     */
    private async handleAttachFile(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active file to attach');
            return;
        }

        try {
            const fileReference = this.fileManager.createFileReferenceFromDocument(activeEditor.document);
            this.fileAttachmentManager.stageFile(fileReference);
            this.updateWebviewStagedFiles();
        } catch (error) {
            ErrorUtils.logError('ChatProvider.handleAttachFile', error);
            vscode.window.showErrorMessage(ErrorUtils.createUserFriendlyError(error));
        }
    }

    /**
     * Handles clearing staged files
     */
    private handleClearStagedFiles(): void {
        this.fileAttachmentManager.clearStagedFiles();
        this.updateWebviewStagedFiles();
    }

    /**
     * Handles files dropped in the webview
     */
    private async handleFilesDropped(files: string[]): Promise<void> {
        console.log('[ChatProvider] Handling dropped files:', files);
        
        try {
            const fileReferences: FileReference[] = [];
            
            for (const filePath of files) {
                try {
                    let uri: vscode.Uri;
                    
                    // Handle different URI formats from drag and drop
                    if (filePath.startsWith('file://')) {
                        uri = vscode.Uri.parse(filePath);
                    } else if (filePath.startsWith('/') || filePath.match(/^[a-zA-Z]:\\/)) {
                        // Absolute path
                        uri = vscode.Uri.file(filePath);
                    } else {
                        // Try to resolve relative to workspace
                        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                        if (workspaceFolder) {
                            uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
                        } else {
                            uri = vscode.Uri.file(filePath);
                        }
                    }
                    
                    console.log('[ChatProvider] Processing URI:', uri.toString());
                    const processedFiles = await this.fileManager.processDroppedUri(uri);
                    fileReferences.push(...processedFiles);
                    
                } catch (error) {
                    console.error('[ChatProvider] Error processing file:', filePath, error);
                    // Continue with other files even if one fails
                }
            }

            if (fileReferences.length > 0) {
                console.log('[ChatProvider] Successfully processed files:', fileReferences.map(f => f.fileName));
                this.fileAttachmentManager.stageFiles(fileReferences);
                this.updateWebviewStagedFiles();
                
                // Show success message
                vscode.window.showInformationMessage(
                    `✅ ${fileReferences.length} file(s) attached successfully`
                );
            } else {
                throw new Error('No files could be processed from the drop operation');
            }
        } catch (error) {
            console.error('[ChatProvider] Error in handleFilesDropped:', error);
            ErrorUtils.logError('ChatProvider.handleFilesDropped', error);
            
            this.sendToWebview({
                type: WebviewMessageType.DROP_FAILED,
                error: ErrorUtils.createUserFriendlyError(error)
            });
            
            vscode.window.showErrorMessage(`Failed to attach files: ${ErrorUtils.createUserFriendlyError(error)}`);
        }
    }

    /**
     * Handles text dropped in the webview
     */
    private async handleTextDropped(text: string): Promise<void> {
        if (FileUtils.isValidFilePath(text)) {
            try {
                const uri = vscode.Uri.parse(text);
                const processedFiles = await this.fileManager.processDroppedUri(uri);
                
                if (processedFiles.length > 0) {
                    this.fileAttachmentManager.stageFiles(processedFiles);
                    this.updateWebviewStagedFiles();
                }
            } catch (error) {
                ErrorUtils.logError('ChatProvider.handleTextDropped', error);
                this.sendToWebview({
                    type: WebviewMessageType.DROP_FAILED,
                    error: ErrorUtils.createUserFriendlyError(error)
                });
            }
        }
    }

    /**
     * Adds a message to the chat
     */
    private addMessage(message: ChatMessage): void {
        this.messages.push(message);
        this.updateWebviewMessages();
    }

    /**
     * Clears all messages
     */
    public clearMessages(): void {
        this.messages = [];
        this.updateWebviewMessages();
    }

    /**
     * Gets all messages
     */
    public getMessages(): ChatMessage[] {
        return [...this.messages];
    }

    /**
     * Sends a message to the webview
     */
    private sendToWebview(message: WebviewMessage): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    /**
     * Updates the webview with current messages
     */
    private updateWebviewMessages(): void {
        this.sendToWebview({
            type: WebviewMessageType.UPDATE_MESSAGES,
            messages: this.messages
        });
    }

    /**
     * Updates the webview with staged files
     */
    private updateWebviewStagedFiles(): void {
        const stagedFiles = this.fileAttachmentManager.getStagedFiles();
        this.sendToWebview({
            type: WebviewMessageType.UPDATE_STAGED_FILE,
            stagedFiles: stagedFiles
        });
    }

    /**
     * Generates HTML content for the webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'js', 'chat.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'css', 'chat.css'));

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>AI Assistant Chat</title>
</head>
<body>
    <div class="chat-container">
        <!-- Header -->
        <div class="chat-header">
            <h3>🤖 AI Assistant</h3>
            <button id="clearChatBtn" class="clear-btn" title="Clear chat">🗑️</button>
        </div>

        <!-- Staged Files Display -->
        <div id="stagedFilesContainer" class="staged-files" style="display: none;">
            <div class="staged-files-header">
                <span>📎 Attached Files:</span>
                <button id="clearStagedBtn" class="clear-staged-btn" title="Clear attached files">❌</button>
            </div>
            <div id="stagedFilesList" class="staged-files-list"></div>
        </div>

        <!-- Messages Container -->
        <div id="messagesContainer" class="messages-container">
            <div class="welcome-message">
                <h4>👋 Welcome to AI Assistant!</h4>
                <p>Ask questions about your code, attach files for analysis, or get help with development tasks.</p>
                <ul>
                    <li>📎 Attach files by dragging them here or using the attach button</li>
                    <li>💬 Type your questions or requests</li>
                    <li>🎯 Get contextual help based on your code</li>
                </ul>
            </div>
        </div>

        <!-- Input Area -->
        <div class="input-container">
            <div class="input-actions">
                <button id="attachBtn" class="attach-btn" title="Attach current file">📎</button>
            </div>
            <textarea 
                id="messageInput" 
                placeholder="Ask me anything about your code..." 
                rows="3"
            ></textarea>
            <button id="sendBtn" class="send-btn" title="Send message">Send</button>
        </div>

        <!-- Drop Zone Overlay -->
        <div id="dropZone" class="drop-zone" style="display: none;">
            <div class="drop-zone-content">
                <div class="drop-icon">📁</div>
                <div class="drop-text">Drop files here</div>
                <div class="drop-subtext">Supports code files and folders</div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Generates a nonce for CSP
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}