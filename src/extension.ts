import * as vscode from 'vscode';
import { ChatProvider } from './chatProvider';

// Drop Zone Provider for proper drag-and-drop handling
class DropZoneProvider implements vscode.TreeDataProvider<DropZoneItem>, vscode.TreeDragAndDropController<DropZoneItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DropZoneItem | undefined | null | void> = new vscode.EventEmitter<DropZoneItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DropZoneItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // Drag and Drop configuration
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

    // TreeDragAndDropController implementation
    public async handleDrop(target: DropZoneItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        console.log('[DropZoneProvider] Drop detected');
        
        // Log all available MIME types for debugging
        console.log('[DropZoneProvider] Checking available data types...');
        const availableTypes: string[] = [];
        
        // Check all possible MIME types we support
        for (const mimeType of this.dropMimeTypes) {
            const item = dataTransfer.get(mimeType);
            if (item) {
                availableTypes.push(mimeType);
                console.log(`[DropZoneProvider] Found data for MIME type: ${mimeType}`);
            }
        }
        
        console.log(`[DropZoneProvider] Available MIME types: ${availableTypes.join(', ')}`);
        
        // Handle URI list drops (from VS Code Explorer and editor tabs)
        const uriListData = dataTransfer.get('text/uri-list');
        if (uriListData) {
            console.log('[DropZoneProvider] URI list drop detected');
            const uriString = await uriListData.asString();
            console.log('[DropZoneProvider] URI string:', uriString);
            
            if (uriString && uriString.trim()) {
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
                
                if (uris.length > 0) {
                    vscode.window.showInformationMessage(`✅ Successfully processed ${uris.length} file(s)!`);
                    return;
                }
            }
        }
        
        // Handle text/plain drops (sometimes editor tabs use this)
        const plainTextData = dataTransfer.get('text/plain');
        if (plainTextData) {
            console.log('[DropZoneProvider] Plain text drop detected');
            const textContent = await plainTextData.asString();
            console.log('[DropZoneProvider] Plain text content:', textContent);
            
            // Check if it's a file URI
            if (textContent.startsWith('file://')) {
                try {
                    const uri = vscode.Uri.parse(textContent);
                    console.log('[DropZoneProvider] Processing plain text URI:', uri.toString());
                    await this.chatProvider.handleDroppedUri(uri);
                    vscode.window.showInformationMessage('✅ File dropped successfully!');
                    return;
                } catch (error) {
                    console.error('[DropZoneProvider] Error processing plain text URI:', error);
                }
            }
        }

        // Handle VS Code tree drops
        let foundData = false;
        for (const mimeType of ['application/vnd.code.tree.explorer', 'application/vnd.code.tree.fileexplorer', 'application/vnd.code.editor.drop', 'application/vnd.code.tab.drop']) {
            const item = dataTransfer.get(mimeType);
            if (item) {
                console.log('[DropZoneProvider] Processing mime type:', mimeType);
                foundData = true;
                
                const content = await item.asString();
                console.log('[DropZoneProvider] Tree content:', content);
                
                try {
                    // Try to parse as JSON first
                    const data = JSON.parse(content);
                    if (data.resource) {
                        const uri = vscode.Uri.parse(data.resource);
                        console.log('[DropZoneProvider] Processing parsed URI:', uri.toString());
                        await this.chatProvider.handleDroppedUri(uri);
                    } else if (Array.isArray(data)) {
                        // Handle multiple files
                        for (const item of data) {
                            if (item.resource) {
                                const uri = vscode.Uri.parse(item.resource);
                                console.log('[DropZoneProvider] Processing array URI:', uri.toString());
                                await this.chatProvider.handleDroppedUri(uri);
                            }
                        }
                    }
                } catch {
                    // If not JSON, try to treat as URI
                    if (content.startsWith('file://')) {
                        const uri = vscode.Uri.parse(content);
                        console.log('[DropZoneProvider] Processing direct URI:', uri.toString());
                        await this.chatProvider.handleDroppedUri(uri);
                    }
                }
                break;
            }
        }

        if (foundData) {
            vscode.window.showInformationMessage('✅ Files dropped successfully!');
        } else {
            console.log('[DropZoneProvider] No supported drop data found');
            vscode.window.showWarningMessage(`No supported files found in drop. Available MIME types: ${availableTypes.join(', ')}`);
        }
    }

    public async handleDrag(source: readonly DropZoneItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        // Allow dragging items out if needed
        console.log('[DropZoneProvider] Drag initiated from drop zone');
    }

    // TreeDataProvider methods
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

interface DropZoneItem {
    label: string;
    iconPath: string;
    tooltip: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('[Extension] Activating AI Code Assistant...');

    try {
        // Create and register the chat provider
        const chatProvider = new ChatProvider(context.extensionUri);
        
        // Register as webview view provider
        const webviewProvider = vscode.window.registerWebviewViewProvider(
            ChatProvider.viewType,
            chatProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        );
        
        context.subscriptions.push(webviewProvider);
        console.log('[Extension] Chat provider registered successfully');

        // Create and register the drop zone provider
        const dropZoneProvider = new DropZoneProvider(chatProvider);
        const dropZoneTreeView = vscode.window.createTreeView('aiAssistantDropZone', {
            treeDataProvider: dropZoneProvider,
            dragAndDropController: dropZoneProvider,
            canSelectMany: true
        });
        context.subscriptions.push(dropZoneTreeView);
        console.log('[Extension] Drop zone with drag-and-drop registered successfully');

        // Register a TreeDataProvider for file attachments
        const fileTreeDataProvider = new FileTreeDataProvider();
        const treeView = vscode.window.createTreeView('aiAssistantFiles', {
            treeDataProvider: fileTreeDataProvider,
            canSelectMany: true
        });
        context.subscriptions.push(treeView);
        console.log('[Extension] File tree data provider registered successfully');

        // Listen for active editor changes to potentially handle drops
        const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (editor) {
                // Notify the webview about the active file change
                chatProvider.notifyActiveFileChange(editor.document);
                
                // Update tree view selection
                fileTreeDataProvider.setActiveFile(editor.document.uri);
            }
        });
        context.subscriptions.push(activeEditorChangeListener);

        // Register commands
        const openChatCommand = vscode.commands.registerCommand('ai-assistant.openChat', () => {
            vscode.commands.executeCommand('workbench.view.extension.ai-assistant');
            chatProvider.reveal();
        });

        const clearChatCommand = vscode.commands.registerCommand('ai-assistant.clearChat', () => {
            chatProvider.clearChat();
        });

        const newChatCommand = vscode.commands.registerCommand('ai-assistant.newChat', () => {
            chatProvider.newChat();
        });

        // Enhanced file attachment commands
        const attachActiveFileCommand = vscode.commands.registerCommand('ai-assistant.attachActiveFile', async () => {
            await chatProvider.attachActiveFile();
        });

        const browseFilesCommand = vscode.commands.registerCommand('ai-assistant.browseFiles', async () => {
            await chatProvider.browseAndAttachFile();
        });

        const attachSelectionCommand = vscode.commands.registerCommand('ai-assistant.attachSelection', async () => {
            await chatProvider.attachSelectedText();
        });

        // New command for attaching multiple files
        const attachMultipleFilesCommand = vscode.commands.registerCommand('ai-assistant.attachMultipleFiles', async () => {
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

            if (fileUris && fileUris.length > 0) {
                for (const uri of fileUris) {
                    try {
                        const stat = await vscode.workspace.fs.stat(uri);
                        if (stat.type === vscode.FileType.Directory) {
                            // Handle folder
                            const folderFiles = await vscode.workspace.findFiles(
                                new vscode.RelativePattern(uri, '**/*'),
                                '**/node_modules/**',
                                50
                            );
                            
                            for (const fileUri of folderFiles.slice(0, 20)) {
                                await chatProvider.attachFileFromPath(fileUri.fsPath);
                            }
                            
                            vscode.window.showInformationMessage(
                                `Attached folder with ${Math.min(folderFiles.length, 20)} files`
                            );
                        } else {
                            // Handle file
                            await chatProvider.attachFileFromPath(uri.fsPath);
                        }
                    } catch (error) {
                        console.error('[Extension] Error attaching file:', error);
                        vscode.window.showErrorMessage(`Failed to attach ${uri.fsPath}: ${error}`);
                    }
                }
                
                chatProvider.reveal();
            }
        });

        context.subscriptions.push(
            openChatCommand, 
            clearChatCommand, 
            newChatCommand, 
            attachActiveFileCommand,
            browseFilesCommand,
            attachSelectionCommand,
            attachMultipleFilesCommand
        );
        console.log('[Extension] Commands registered successfully');

        // Create status bar item
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = "$(robot) AI Assistant";
        statusBarItem.tooltip = "Open AI Assistant Chat";
        statusBarItem.command = 'ai-assistant.openChat';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Add context menus for file attachment
        const editorContextMenu = vscode.commands.registerCommand('ai-assistant.attachFileFromExplorer', async (uri: vscode.Uri) => {
            if (uri && uri.fsPath) {
                await chatProvider.attachFileFromPath(uri.fsPath);
                chatProvider.reveal();
            }
        });
        context.subscriptions.push(editorContextMenu);

        // Register workspace file watcher for better drop zone integration
        const fileWatcher = vscode.workspace.createFileSystemWatcher(
            '**/*.{js,ts,jsx,tsx,py,java,c,cpp,cs,php,rb,go,rs,kt,swift,dart,vue,html,css,scss,sass,less,json,xml,yaml,yml,md,txt}',
            false, // don't ignore create events
            true,  // ignore change events
            true   // ignore delete events
        );

        fileWatcher.onDidCreate(async (uri) => {
            // Optionally notify about new files that could be attached
            console.log('[Extension] New file created:', uri.fsPath);
        });

        context.subscriptions.push(fileWatcher);

        console.log('[Extension] AI Code Assistant activated successfully!');
    } catch (error) {
        console.error('[Extension] Error activating extension:', error);
        vscode.window.showErrorMessage(`Failed to activate AI Code Assistant: ${error}`);
    }
}

export function deactivate() {
    console.log('[Extension] Deactivating AI Code Assistant...');
}

// Simple TreeDataProvider for file attachments
class FileTreeDataProvider implements vscode.TreeDataProvider<vscode.Uri> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.Uri | undefined | null | void> = new vscode.EventEmitter<vscode.Uri | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.Uri | undefined | null | void> = this._onDidChangeTreeData.event;

    private activeFile: vscode.Uri | undefined;
    private attachedFiles: Set<string> = new Set();

    setActiveFile(uri: vscode.Uri) {
        this.activeFile = uri;
        this._onDidChangeTreeData.fire();
    }

    addAttachedFile(uri: vscode.Uri) {
        this.attachedFiles.add(uri.toString());
        this._onDidChangeTreeData.fire();
    }

    removeAttachedFile(uri: vscode.Uri) {
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
            // Return root items (attached files)
            const files = Array.from(this.attachedFiles).map(uriString => vscode.Uri.parse(uriString));
            return Promise.resolve(files);
        }
        return Promise.resolve([]);
    }
}