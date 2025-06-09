/**
 * AI Code Assistant VS Code Extension
 *
 * Main extension entry point that handles:
 * - Extension activation and deactivation
 * - Command registration and handling
 * - Provider registration and setup
 * - Event listener configuration
 *
 * @fileoverview Main extension implementation
 * @author SRIDHARAN THILLAIYAPPAN
 * @version 1.0.0
 */

import * as vscode from "vscode";
import { ChatProvider } from "./chatProvider";
import { DropZoneProvider, FileTreeDataProvider } from "./providers";
import { FileManager, FileAttachmentManager } from "./fileManager";
import { OllamaService } from "./ollamaService";
import {
  InlineChatProvider,
  registerInlineCompletions,
} from "./inlineChatProvider";
import { ErrorUtils } from "./utils";
import { DEFAULT_CONFIG } from "./types";
import { CopilotPanel } from "./copilotPanel";

/**
 * Extension activation function
 * Called when the extension is first activated
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("[Extension] Activating AI Code Assistant...");

  try {
    // Initialize services
    const fileManager = new FileManager(DEFAULT_CONFIG);
    const fileAttachmentManager = new FileAttachmentManager();
    const ollamaService = new OllamaService();

    // Initialize core providers
    const chatProvider = new ChatProvider(
      context.extensionUri,
      fileManager,
      fileAttachmentManager,
      ollamaService,
    );

    const inlineChatProvider = InlineChatProvider.getInstance(
      ollamaService,
    );

    // Initialize Copilot-style panel
    const copilotPanel = CopilotPanel.getInstance(ollamaService, fileManager);

    const dropZoneProvider = new DropZoneProvider(async (uri: vscode.Uri) => {
      try {
        const fileReferences = await fileManager.processDroppedUri(uri);
        fileAttachmentManager.stageFiles(fileReferences);
      } catch (error) {
        ErrorUtils.logError("Extension.dropZoneCallback", error);
        vscode.window.showErrorMessage(
          ErrorUtils.createUserFriendlyError(error),
        );
      }
    });

    const fileTreeDataProvider = new FileTreeDataProvider();

    // Register providers
    registerProviders(
      context,
      chatProvider,
      dropZoneProvider,
      fileTreeDataProvider,
    );

    // Register commands
    registerCommands(
      context,
      chatProvider,
      fileManager,
      fileAttachmentManager,
      inlineChatProvider,
    );

    // Register Copilot panel commands
    CopilotPanel.registerCommands(context, copilotPanel);

    // Register inline completions
    registerInlineCompletions(context, ollamaService);

    // Set up event listeners
    setupEventListeners(context, fileTreeDataProvider);

    // Create status bar item
    createStatusBarItem(context);

    console.log("[Extension] AI Code Assistant activated successfully!");
  } catch (error) {
    ErrorUtils.logError("Extension.activate", error);
    vscode.window.showErrorMessage(
      `Failed to activate AI Code Assistant: ${ErrorUtils.createUserFriendlyError(error)}`,
    );
  }
}

/**
 * Registers all extension providers
 */
function registerProviders(
  context: vscode.ExtensionContext,
  chatProvider: ChatProvider,
  dropZoneProvider: DropZoneProvider,
  fileTreeDataProvider: FileTreeDataProvider,
): void {
  // Register webview provider
  const webviewProvider = vscode.window.registerWebviewViewProvider(
    ChatProvider.viewType,
    chatProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    },
  );

  // Register drop zone tree view
  const dropZoneTreeView = vscode.window.createTreeView("aiAssistantDropZone", {
    treeDataProvider: dropZoneProvider,
    dragAndDropController: dropZoneProvider,
    canSelectMany: true,
  });

  // Register file tree view
  const fileTreeView = vscode.window.createTreeView("aiAssistantFiles", {
    treeDataProvider: fileTreeDataProvider,
    canSelectMany: true,
  });

  context.subscriptions.push(webviewProvider, dropZoneTreeView, fileTreeView);
  console.log("[Extension] Providers registered successfully");
}

/**
 * Registers all extension commands
 */
function registerCommands(
  context: vscode.ExtensionContext,
  chatProvider: ChatProvider,
  fileManager: FileManager,
  fileAttachmentManager: FileAttachmentManager,
  inlineChatProvider: InlineChatProvider,
): void {
  const commands = [
    // Basic chat commands
    vscode.commands.registerCommand("ai-assistant.openChat", () => {
      vscode.commands.executeCommand("workbench.view.extension.ai-assistant");
    }),

    vscode.commands.registerCommand("ai-assistant.newChat", () => {
      chatProvider.clearMessages();
      fileAttachmentManager.clearStagedFiles();
      vscode.window.showInformationMessage("New chat started");
    }),

    // File attachment commands
    vscode.commands.registerCommand(
      "ai-assistant.attachActiveFile",
      async () => {
        await handleAttachActiveFile(fileManager, fileAttachmentManager);
      },
    ),

    vscode.commands.registerCommand(
      "ai-assistant.attachSelection",
      async () => {
        await handleAttachSelectedText(fileManager, fileAttachmentManager);
      },
    ),

    // Multiple file attachment command (supports single files too)
    vscode.commands.registerCommand(
      "ai-assistant.attachMultipleFiles",
      async () => {
        await handleMultipleFileAttachment(fileManager, fileAttachmentManager);
      },
    ),

    // Context menu command
    vscode.commands.registerCommand(
      "ai-assistant.attachFileFromExplorer",
      async (uri: vscode.Uri) => {
        if (uri?.fsPath) {
          await handleAttachFileFromPath(
            uri.fsPath,
            fileManager,
            fileAttachmentManager,
          );
        }
      },
    ),

    // Inline chat commands
    vscode.commands.registerCommand(
      "ai-assistant.startInlineChat",
      async () => {
        await inlineChatProvider.startInlineChat();
      },
    ),

    vscode.commands.registerCommand(
      "ai-assistant.acceptInlineChat",
      async () => {
        await inlineChatProvider.acceptSuggestion();
      },
    ),

    vscode.commands.registerCommand(
      "ai-assistant.rejectInlineChat",
      async () => {
        await inlineChatProvider.rejectSuggestion();
      },
    ),
  ];

  context.subscriptions.push(...commands);
  console.log("[Extension] Commands registered successfully");
}

/**
 * Handles attaching the active file
 */
async function handleAttachActiveFile(
  fileManager: FileManager,
  fileAttachmentManager: FileAttachmentManager,
): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showWarningMessage("No active file to attach");
    return;
  }

  try {
    const fileReference = fileManager.createFileReferenceFromDocument(
      activeEditor.document,
    );
    fileAttachmentManager.stageFile(fileReference);
  } catch (error) {
    ErrorUtils.logError("Extension.handleAttachActiveFile", error);
    vscode.window.showErrorMessage(ErrorUtils.createUserFriendlyError(error));
  }
}

/**
 * Handles attaching selected text from the active editor
 */
async function handleAttachSelectedText(
  fileManager: FileManager,
  fileAttachmentManager: FileAttachmentManager,
): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showWarningMessage("No active file to attach selection from");
    return;
  }

  const selection = activeEditor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage("No text selected");
    return;
  }

  try {
    const selectedText = activeEditor.document.getText(selection);
    const fileReference = fileManager.createFileReferenceFromDocument(
      activeEditor.document,
      selectedText,
    );
    fileAttachmentManager.stageFile(fileReference);
  } catch (error) {
    ErrorUtils.logError("Extension.handleAttachSelectedText", error);
    vscode.window.showErrorMessage(ErrorUtils.createUserFriendlyError(error));
  }
}

/**
 * Handles attaching a file from a specific path
 */
async function handleAttachFileFromPath(
  filePath: string,
  fileManager: FileManager,
  fileAttachmentManager: FileAttachmentManager,
): Promise<void> {
  try {
    const uri = vscode.Uri.file(filePath);
    const fileReferences = await fileManager.processDroppedUri(uri);
    fileAttachmentManager.stageFiles(fileReferences);
  } catch (error) {
    ErrorUtils.logError("Extension.handleAttachFileFromPath", error);
    vscode.window.showErrorMessage(ErrorUtils.createUserFriendlyError(error));
  }
}

/**
 * Handles multiple file attachment with folder support
 */
async function handleMultipleFileAttachment(
  fileManager: FileManager,
  fileAttachmentManager: FileAttachmentManager,
): Promise<void> {
  const fileUris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: true,
    title: "Select files or folders to attach",
    filters: {
      "Code Files": [
        "js",
        "ts",
        "py",
        "java",
        "cpp",
        "c",
        "cs",
        "php",
        "rb",
        "go",
        "rs",
      ],
      "Web Files": ["html", "css", "scss", "sass", "less", "vue", "jsx", "tsx"],
      "Data Files": ["json", "xml", "yaml", "yml", "csv", "sql"],
      Documentation: ["md", "txt", "rst"],
      "All Files": ["*"],
    },
  });

  if (!fileUris?.length) return;

  const allFileReferences = [];

  for (const uri of fileUris) {
    try {
      const fileReferences = await fileManager.processDroppedUri(uri);
      allFileReferences.push(...fileReferences);
    } catch (error) {
      ErrorUtils.logError("Extension.handleMultipleFileAttachment", error);
      vscode.window.showErrorMessage(
        `Failed to attach ${uri.fsPath}: ${ErrorUtils.createUserFriendlyError(error)}`,
      );
    }
  }

  if (allFileReferences.length > 0) {
    fileAttachmentManager.stageFiles(allFileReferences);
  }
}

/**
 * Sets up event listeners for the extension
 */
function setupEventListeners(
  context: vscode.ExtensionContext,
  fileTreeDataProvider: FileTreeDataProvider,
): void {
  // Listen for active editor changes
  const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor(
    async (editor) => {
      if (editor) {
        fileTreeDataProvider.setActiveFile(editor.document.uri);
      }
    },
  );

  // Create workspace file watcher for enhanced integration
  const fileWatcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{js,ts,jsx,tsx,py,java,c,cpp,cs,php,rb,go,rs,kt,swift,dart,vue,html,css,scss,sass,less,json,xml,yaml,yml,md,txt}",
    false, // don't ignore create events
    true, // ignore change events
    true, // ignore delete events
  );

  fileWatcher.onDidCreate(async (uri) => {
    console.log("[Extension] New file created:", uri.fsPath);
    // Future enhancement: Could auto-suggest file attachment
  });

  context.subscriptions.push(activeEditorChangeListener, fileWatcher);
  console.log("[Extension] Event listeners set up successfully");
}

/**
 * Creates and configures the status bar item
 */
function createStatusBarItem(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(robot) AI Assistant";
  statusBarItem.tooltip = "Open AI Assistant Chat";
  statusBarItem.command = "ai-assistant.openChat";
  statusBarItem.show();

  context.subscriptions.push(statusBarItem);
  console.log("[Extension] Status bar item created");
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated
 */
export function deactivate() {
  console.log("[Extension] Deactivating AI Code Assistant...");
  // Cleanup would go here if needed
}
