/**
 * AI Code Assistant VS Code Extension
 * 
 * Main extension entry point that handles:
 * - Extension activation and deactivation
 * - Command registration and handling
 * - Drag-and-drop providers setup
 * - File tree management
 * - Context menu integration
 * 
 * @fileoverview Main extension implementation
 * @author AI Code Assistant Extension
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { ChatProvider } from './chatProvider';

/**
 * Represents an item in the drop zone tree view
 */
interface DropZoneItem {
    label: string;
    iconPath: string;
    tooltip: string;
}

/**
 * Drop Zone Provider for handling drag-and-drop operations
 * Implements both TreeDataProvider and TreeDragAndDropController interfaces
 */
class DropZoneProvider implements vscode.TreeDataProvider<DropZoneItem>, vscode.TreeDragAndDropController<DropZoneItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DropZoneItem | undefined | null | void> = new vscode.EventEmitter<DropZoneItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DropZoneItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // Drag and Drop configuration - supports multiple MIME types for maximum compatibility
    dropMimeTypes = [
        'text/uri-list', 
        'application/vnd.code.tree.explorer', 
        'application/vnd.code.tree.fileexplorer',
        'application/vnd.code.editor.drop',
        'application/vnd.code.tab.drop',
        'text/plain',
        'files'
    ];
    dragMimeTypes = ['text/uri-list'];

    constructor(private chatProvider: ChatProvider) {}

    /**
     * Handles drop events in the drop zone
     * Processes various data transfer formats and routes to chat provider
     */
    public async handleDrop(target: DropZoneItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        console.log('[DropZoneProvider] Drop detected');
        
        const availableTypes = this.getAvailableDataTypes(dataTransfer);
        console.log('[DropZoneProvider] Available MIME types:', availableTypes);
        
        // Try to process data in order of preference
        if (await this.processUriListData(dataTransfer) ||
            await this.processPlainTextData(dataTransfer) ||
            await this.processVSCodeTreeData(dataTransfer)) {
            
            vscode.window.showInformationMessage('✅ Files dropped successfully!');
            return;
        }
        
        // No supported data found
        this.handleDropFailure(availableTypes);
    }

    /**
     * Gets all available data types from the data transfer object
     */
    private getAvailableDataTypes(dataTransfer: vscode.DataTransfer): string[] {
        const types: string[] = [];
        for (const mimeType of this.dropMimeTypes) {
            if (dataTransfer.get(mimeType)) {
                types.push(mimeType);
            }
        }
        return types;
    }

    /**
     * Processes URI list data (primary method for most file drops)
     */
    private async processUriListData(dataTransfer: vscode.DataTransfer): Promise<boolean> {
        const uriListData = dataTransfer.get('text/uri-list');
        if (!uriListData) return false;
        
        const uriString = await uriListData.asString();
        console.log('[DropZoneProvider] URI string:', uriString);
        
        if (!uriString?.trim()) return false;
        
        const uris = uriString.split(/[\r\n]+/).filter(uri => uri.trim().length > 0);
        
        for (const uriStr of uris) {
            try {
                const uri = vscode.Uri.parse(uriStr);
                console.log('[DropZoneProvider] Processing URI:', uri.toString());
                await this.chatProvider.handleDroppedUri(uri);
            } catch (error) {
                console.error('[DropZoneProvider] Error processing URI:', error);
            }
        }
        
        return uris.length > 0;
    }

    /**
     * Processes plain text data (fallback for some editor tab drops)
     */
    private async processPlainTextData(dataTransfer: vscode.DataTransfer): Promise<boolean> {
        const plainTextData = dataTransfer.get('text/plain');
        if (!plainTextData) return false;
        
        const textContent = await plainTextData.asString();
        console.log('[DropZoneProvider] Plain text content:', textContent);
        
        if (!textContent?.trim()) return false;
        
        // Check if it's a file URI or path
        if (this.isFilePath(textContent)) {
            try {
                const uri = vscode.Uri.parse(textContent);
                console.log('[DropZoneProvider] Processing plain text URI:', uri.toString());
                await this.chatProvider.handleDroppedUri(uri);
                return true;
            } catch (error) {
                console.error('[DropZoneProvider] Error processing plain text URI:', error);
            }
        }
        
        return false;
    }

    /**
     * Processes VS Code tree data (structured data from explorer/tabs)
     */
    private async processVSCodeTreeData(dataTransfer: vscode.DataTransfer): Promise<boolean> {
        const treeDataTypes = [
            'application/vnd.code.tree.explorer', 
            'application/vnd.code.tree.fileexplorer', 
            'application/vnd.code.editor.drop', 
            'application/vnd.code.tab.drop'
        ];
        
        for (const mimeType of treeDataTypes) {
            const item = dataTransfer.get(mimeType);
            if (!item) continue;
            
            console.log('[DropZoneProvider] Processing mime type:', mimeType);
            const content = await item.asString();
            console.log('[DropZoneProvider] Tree content:', content);
            
            if (await this.processTreeContent(content)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Processes tree content (JSON or plain text)
     */
    private async processTreeContent(content: string): Promise<boolean> {
        if (!content?.trim()) return false;
        
        try {
            // Try parsing as JSON
            const data = JSON.parse(content);
            
            if (data.resource) {
                const uri = vscode.Uri.parse(data.resource);
                await this.chatProvider.handleDroppedUri(uri);
                return true;
            }
            
            if (Array.isArray(data)) {
                for (const item of data) {
                    if (item.resource) {
                        const uri = vscode.Uri.parse(item.resource);
                        await this.chatProvider.handleDroppedUri(uri);
                    }
                }
                return data.length > 0;
            }
        } catch {
            // If not JSON, try as plain URI
            if (this.isFilePath(content)) {
                const uri = vscode.Uri.parse(content);
                await this.chatProvider.handleDroppedUri(uri);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Checks if a string represents a file path or URI
     */
    private isFilePath(text: string): boolean {
        return text.startsWith('file://') || text.includes('/') || text.match(/^[a-zA-Z]:\\/) !== null;
    }

    /**
     * Handles drop failure cases
     */
    private handleDropFailure(availableTypes: string[]): void {
        console.log('[DropZoneProvider] No supported drop data found');
        vscode.window.showWarningMessage(
            `No supported files found in drop. Available types: ${availableTypes.join(', ')}`
        );
    }

    /**
     * Handles drag events (allows dragging items out)
     */
    public async handleDrag(source: readonly DropZoneItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        console.log('[DropZoneProvider] Drag initiated from drop zone');
        // Could implement dragging out functionality if needed
    }

    // TreeDataProvider implementation
    getTreeItem(element: DropZoneItem): vscode.TreeItem {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon(element.iconPath);
        item.tooltip = element.tooltip;
        item.contextValue = 'dropZoneItem';
        return item;
    }

    getChildren(element?: DropZoneItem): Thenable<DropZoneItem[]> {
        if (!element) {
            return Promise.resolve([
                {
                    label: '📁 Drop files here',
                    iconPath: 'folder',
                    tooltip: 'Drag and drop files from VS Code Explorer or your file system'
                },
                {
                    label: '🎯 Supports multiple files',
                    iconPath: 'files',
                    tooltip: 'You can drag multiple files at once'
                },
                {
                    label: '📂 Supports folders',
                    iconPath: 'file-directory',
                    tooltip: 'Drag folders to process all files inside'
                }
            ]);
        }
        return Promise.resolve([]);
    }
}

/**
 * Simple TreeDataProvider for managing attached files in the UI
 */
class FileTreeDataProvider implements vscode.TreeDataProvider<vscode.Uri> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.Uri | undefined | null | void> = new vscode.EventEmitter<vscode.Uri | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.Uri | undefined | null | void> = this._onDidChangeTreeData.event;

    private activeFile: vscode.Uri | undefined;
    private attachedFiles: Set<string> = new Set();

    /**
     * Sets the currently active file
     */
    setActiveFile(uri: vscode.Uri): void {
        this.activeFile = uri;
        this._onDidChangeTreeData.fire();
    }

    /**
     * Adds a file to the attached files list
     */
    addAttachedFile(uri: vscode.Uri): void {
        this.attachedFiles.add(uri.toString());
        this._onDidChangeTreeData.fire();
    }

    /**
     * Removes a file from the attached files list
     */
    removeAttachedFile(uri: vscode.Uri): void {
        this.attachedFiles.delete(uri.toString());
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.Uri): vscode.TreeItem {
        const item = new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
        item.resourceUri = element;
        item.contextValue = 'attachedFile';
        item.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [element]
        };
        return item;
    }

    getChildren(element?: vscode.Uri): Thenable<vscode.Uri[]> {
        if (!element) {
            const files = Array.from(this.attachedFiles).map(uriString => vscode.Uri.parse(uriString));
            return Promise.resolve(files);
        }
        return Promise.resolve([]);
    }
}

/**
 * Extension activation function
 * Called when the extension is first activated
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('[Extension] Activating AI Code Assistant...');

    try {
        // Initialize core providers
        const chatProvider = new ChatProvider(context.extensionUri);
        const dropZoneProvider = new DropZoneProvider(chatProvider);
        const fileTreeDataProvider = new FileTreeDataProvider();

        // Register providers
        registerProviders(context, chatProvider, dropZoneProvider, fileTreeDataProvider);
        
        // Register commands
        registerCommands(context, chatProvider, fileTreeDataProvider);
        
        // Set up event listeners
        setupEventListeners(context, chatProvider, fileTreeDataProvider);
        
        // Create status bar item
        createStatusBarItem(context);

        console.log('[Extension] AI Code Assistant activated successfully!');
    } catch (error) {
        console.error('[Extension] Error activating extension:', error);
        vscode.window.showErrorMessage(`Failed to activate AI Code Assistant: ${error}`);
    }
}

/**
 * Registers all extension providers
 */
function registerProviders(
    context: vscode.ExtensionContext, 
    chatProvider: ChatProvider, 
    dropZoneProvider: DropZoneProvider, 
    fileTreeDataProvider: FileTreeDataProvider
): void {
    // Register webview provider
    const webviewProvider = vscode.window.registerWebviewViewProvider(
        ChatProvider.viewType,
        chatProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );
    
    // Register drop zone tree view
    const dropZoneTreeView = vscode.window.createTreeView('aiAssistantDropZone', {
        treeDataProvider: dropZoneProvider,
        dragAndDropController: dropZoneProvider,
        canSelectMany: true
    });
    
    // Register file tree view
    const fileTreeView = vscode.window.createTreeView('aiAssistantFiles', {
        treeDataProvider: fileTreeDataProvider,
        canSelectMany: true
    });

    context.subscriptions.push(webviewProvider, dropZoneTreeView, fileTreeView);
    console.log('[Extension] Providers registered successfully');
}

/**
 * Registers all extension commands
 */
function registerCommands(
    context: vscode.ExtensionContext, 
    chatProvider: ChatProvider, 
    fileTreeDataProvider: FileTreeDataProvider
): void {
    const commands = [
        // Basic chat commands
        vscode.commands.registerCommand('ai-assistant.openChat', () => {
            vscode.commands.executeCommand('workbench.view.extension.ai-assistant');
            chatProvider.reveal();
        }),
        
        vscode.commands.registerCommand('ai-assistant.clearChat', () => {
            chatProvider.clearChat();
        }),
        
        vscode.commands.registerCommand('ai-assistant.newChat', () => {
            chatProvider.newChat();
        }),

        // File attachment commands
        vscode.commands.registerCommand('ai-assistant.attachActiveFile', async () => {
            await chatProvider.attachActiveFile();
        }),

        vscode.commands.registerCommand('ai-assistant.browseFiles', async () => {
            await chatProvider.browseAndAttachFile();
        }),

        vscode.commands.registerCommand('ai-assistant.attachSelection', async () => {
            await chatProvider.attachSelectedText();
        }),

        // Multiple file attachment command
        vscode.commands.registerCommand('ai-assistant.attachMultipleFiles', async () => {
            await handleMultipleFileAttachment(chatProvider);
        }),

        // Context menu command
        vscode.commands.registerCommand('ai-assistant.attachFileFromExplorer', async (uri: vscode.Uri) => {
            if (uri?.fsPath) {
                await chatProvider.attachFileFromPath(uri.fsPath);
                chatProvider.reveal();
            }
        })
    ];

    context.subscriptions.push(...commands);
    console.log('[Extension] Commands registered successfully');
}

/**
 * Handles multiple file attachment with folder support
 */
async function handleMultipleFileAttachment(chatProvider: ChatProvider): Promise<void> {
    const fileUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: true,
        title: 'Select files or folders to attach',
        filters: {
            'Code Files': ['js', 'ts', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'],
            'Web Files': ['html', 'css', 'scss', 'sass', 'less', 'vue', 'jsx', 'tsx'],
            'Data Files': ['json', 'xml', 'yaml', 'yml', 'csv', 'sql'],
            'Documentation': ['md', 'txt', 'rst'],
            'All Files': ['*']
        }
    });

    if (!fileUris?.length) return;

    for (const uri of fileUris) {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            
            if (stat.type === vscode.FileType.Directory) {
                await handleFolderAttachment(chatProvider, uri);
            } else {
                await chatProvider.attachFileFromPath(uri.fsPath);
            }
        } catch (error) {
            console.error('[Extension] Error attaching file:', error);
            vscode.window.showErrorMessage(`Failed to attach ${uri.fsPath}: ${error}`);
        }
    }
    
    chatProvider.reveal();
}

/**
 * Handles folder attachment by processing contained files
 */
async function handleFolderAttachment(chatProvider: ChatProvider, folderUri: vscode.Uri): Promise<void> {
    const maxFiles = 20;
    const folderFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folderUri, '**/*'),
        '**/node_modules/**',
        50
    );
    
    const filesToProcess = folderFiles.slice(0, maxFiles);
    
    for (const fileUri of filesToProcess) {
        await chatProvider.attachFileFromPath(fileUri.fsPath);
    }
    
    vscode.window.showInformationMessage(
        `Attached folder with ${filesToProcess.length} files${folderFiles.length > maxFiles ? ` (limited to ${maxFiles})` : ''}`
    );
}

/**
 * Sets up event listeners for the extension
 */
function setupEventListeners(
    context: vscode.ExtensionContext, 
    chatProvider: ChatProvider, 
    fileTreeDataProvider: FileTreeDataProvider
): void {
    // Listen for active editor changes
    const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
            chatProvider.notifyActiveFileChange(editor.document);
            fileTreeDataProvider.setActiveFile(editor.document.uri);
        }
    });

    // Create workspace file watcher for enhanced integration
    const fileWatcher = vscode.workspace.createFileSystemWatcher(
        '**/*.{js,ts,jsx,tsx,py,java,c,cpp,cs,php,rb,go,rs,kt,swift,dart,vue,html,css,scss,sass,less,json,xml,yaml,yml,md,txt}',
        false, // don't ignore create events
        true,  // ignore change events
        true   // ignore delete events
    );

    fileWatcher.onDidCreate(async (uri) => {
        console.log('[Extension] New file created:', uri.fsPath);
        // Future enhancement: Could auto-suggest file attachment
    });

    context.subscriptions.push(activeEditorChangeListener, fileWatcher);
    console.log('[Extension] Event listeners set up successfully');
}

/**
 * Creates and configures the status bar item
 */
function createStatusBarItem(context: vscode.ExtensionContext): void {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(robot) AI Assistant";
    statusBarItem.tooltip = "Open AI Assistant Chat";
    statusBarItem.command = 'ai-assistant.openChat';
    statusBarItem.show();
    
    context.subscriptions.push(statusBarItem);
    console.log('[Extension] Status bar item created');
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated
 */
export function deactivate() {
    console.log('[Extension] Deactivating AI Code Assistant...');
    // Cleanup would go here if needed
}