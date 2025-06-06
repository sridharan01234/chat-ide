/**
 * Tree Data Providers for AI Code Assistant VS Code Extension
 *
 * This module contains various tree data providers for managing UI components
 * including drop zones, file trees, and drag-and-drop functionality.
 *
 * @fileoverview Tree data providers and drag-drop controllers
 * @author AI Code Assistant Extension
 * @version 1.0.0
 */

import * as vscode from "vscode";
import {
  DropZoneItem,
  ChatItem,
  ChatMessage,
  DRAG_DROP_MIME_TYPES,
} from "./types";
import { FileUtils, ErrorUtils } from "./utils";

/**
 * Drop Zone Provider for handling drag-and-drop operations
 * Implements both TreeDataProvider and TreeDragAndDropController interfaces
 */
export class DropZoneProvider
  implements
    vscode.TreeDataProvider<DropZoneItem>,
    vscode.TreeDragAndDropController<DropZoneItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    DropZoneItem | undefined | null | void
  > = new vscode.EventEmitter<DropZoneItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    DropZoneItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  // Drag and Drop configuration - supports multiple MIME types for maximum compatibility
  dropMimeTypes = [
    DRAG_DROP_MIME_TYPES.URI_LIST,
    DRAG_DROP_MIME_TYPES.VS_CODE_TREE,
    DRAG_DROP_MIME_TYPES.VS_CODE_FILE_EXPLORER,
    DRAG_DROP_MIME_TYPES.VS_CODE_EDITOR_DROP,
    DRAG_DROP_MIME_TYPES.VS_CODE_TAB_DROP,
    DRAG_DROP_MIME_TYPES.PLAIN_TEXT,
    DRAG_DROP_MIME_TYPES.FILES,
  ];
  dragMimeTypes = [DRAG_DROP_MIME_TYPES.URI_LIST];

  constructor(private onDropCallback: (uri: vscode.Uri) => Promise<void>) {}

  /**
   * Handles drop events in the drop zone
   * Processes various data transfer formats and routes to callback
   */
  public async handleDrop(
    target: DropZoneItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken,
  ): Promise<void> {
    console.log("[DropZoneProvider] Drop detected");

    const availableTypes = this.getAvailableDataTypes(dataTransfer);
    console.log("[DropZoneProvider] Available MIME types:", availableTypes);

    try {
      // Try to process data in order of preference
      if (
        (await this.processUriListData(dataTransfer)) ||
        (await this.processPlainTextData(dataTransfer)) ||
        (await this.processVSCodeTreeData(dataTransfer))
      ) {
        vscode.window.showInformationMessage("✅ Files dropped successfully!");
        return;
      }

      // No supported data found
      this.handleDropFailure(availableTypes);
    } catch (error) {
      ErrorUtils.logError("DropZoneProvider", error);
      vscode.window.showErrorMessage(
        `Failed to process dropped files: ${ErrorUtils.createUserFriendlyError(error)}`,
      );
    }
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
  private async processUriListData(
    dataTransfer: vscode.DataTransfer,
  ): Promise<boolean> {
    const uriListData = dataTransfer.get(DRAG_DROP_MIME_TYPES.URI_LIST);
    if (!uriListData) return false;

    const uriString = await uriListData.asString();
    console.log("[DropZoneProvider] URI string:", uriString);

    if (!uriString?.trim()) return false;

    const uris = uriString
      .split(/[\r\n]+/)
      .filter((uri) => uri.trim().length > 0);

    for (const uriStr of uris) {
      try {
        const uri = vscode.Uri.parse(uriStr);
        console.log("[DropZoneProvider] Processing URI:", uri.toString());
        await this.onDropCallback(uri);
      } catch (error) {
        ErrorUtils.logError("DropZoneProvider URI processing", error);
      }
    }

    return uris.length > 0;
  }

  /**
   * Processes plain text data (fallback for some editor tab drops)
   */
  private async processPlainTextData(
    dataTransfer: vscode.DataTransfer,
  ): Promise<boolean> {
    const plainTextData = dataTransfer.get(DRAG_DROP_MIME_TYPES.PLAIN_TEXT);
    if (!plainTextData) return false;

    const textContent = await plainTextData.asString();
    console.log("[DropZoneProvider] Plain text content:", textContent);

    if (!textContent?.trim()) return false;

    // Check if it's a file URI or path
    if (FileUtils.isValidFilePath(textContent)) {
      try {
        const uri = vscode.Uri.parse(textContent);
        console.log(
          "[DropZoneProvider] Processing plain text URI:",
          uri.toString(),
        );
        await this.onDropCallback(uri);
        return true;
      } catch (error) {
        ErrorUtils.logError("DropZoneProvider plain text processing", error);
      }
    }

    return false;
  }

  /**
   * Processes VS Code tree data (structured data from explorer/tabs)
   */
  private async processVSCodeTreeData(
    dataTransfer: vscode.DataTransfer,
  ): Promise<boolean> {
    const treeDataTypes = [
      DRAG_DROP_MIME_TYPES.VS_CODE_TREE,
      DRAG_DROP_MIME_TYPES.VS_CODE_FILE_EXPLORER,
      DRAG_DROP_MIME_TYPES.VS_CODE_EDITOR_DROP,
      DRAG_DROP_MIME_TYPES.VS_CODE_TAB_DROP,
    ];

    for (const mimeType of treeDataTypes) {
      const item = dataTransfer.get(mimeType);
      if (!item) continue;

      console.log("[DropZoneProvider] Processing mime type:", mimeType);
      const content = await item.asString();
      console.log("[DropZoneProvider] Tree content:", content);

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
        await this.onDropCallback(uri);
        return true;
      }

      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.resource) {
            const uri = vscode.Uri.parse(item.resource);
            await this.onDropCallback(uri);
          }
        }
        return data.length > 0;
      }
    } catch {
      // If not JSON, try as plain URI
      if (FileUtils.isValidFilePath(content)) {
        const uri = vscode.Uri.parse(content);
        await this.onDropCallback(uri);
        return true;
      }
    }

    return false;
  }

  /**
   * Handles drop failure cases
   */
  private handleDropFailure(availableTypes: string[]): void {
    console.log("[DropZoneProvider] No supported drop data found");
    vscode.window.showWarningMessage(
      `No supported files found in drop. Available types: ${availableTypes.join(", ")}`,
    );
  }

  /**
   * Handles drag events (allows dragging items out)
   */
  public async handleDrag(
    source: readonly DropZoneItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken,
  ): Promise<void> {
    console.log("[DropZoneProvider] Drag initiated from drop zone");
    // Could implement dragging out functionality if needed
  }

  // TreeDataProvider implementation
  getTreeItem(element: DropZoneItem): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      vscode.TreeItemCollapsibleState.None,
    );
    item.iconPath = new vscode.ThemeIcon(element.iconPath);
    item.tooltip = element.tooltip;
    item.contextValue = "dropZoneItem";
    return item;
  }

  getChildren(element?: DropZoneItem): Thenable<DropZoneItem[]> {
    if (!element) {
      return Promise.resolve([
        {
          label: "📁 Drop files here",
          iconPath: "folder",
          tooltip:
            "Drag and drop files from VS Code Explorer or your file system",
        },
        {
          label: "🎯 Supports multiple files",
          iconPath: "files",
          tooltip: "You can drag multiple files at once",
        },
        {
          label: "📂 Supports folders",
          iconPath: "file-directory",
          tooltip: "Drag folders to process all files inside",
        },
      ]);
    }
    return Promise.resolve([]);
  }
}

/**
 * Simple TreeDataProvider for managing attached files in the UI
 */
export class FileTreeDataProvider
  implements vscode.TreeDataProvider<vscode.Uri>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.Uri | undefined | null | void
  > = new vscode.EventEmitter<vscode.Uri | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    vscode.Uri | undefined | null | void
  > = this._onDidChangeTreeData.event;

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

  /**
   * Clears all attached files
   */
  clearAttachedFiles(): void {
    this.attachedFiles.clear();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets all attached files
   */
  getAttachedFiles(): vscode.Uri[] {
    return Array.from(this.attachedFiles).map((uriString) =>
      vscode.Uri.parse(uriString),
    );
  }

  getTreeItem(element: vscode.Uri): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element,
      vscode.TreeItemCollapsibleState.None,
    );
    item.resourceUri = element;
    item.contextValue = "attachedFile";
    item.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [element],
    };
    item.tooltip = `${FileUtils.getFileName(element.fsPath)} - Click to open`;
    return item;
  }

  getChildren(element?: vscode.Uri): Thenable<vscode.Uri[]> {
    if (!element) {
      const files = Array.from(this.attachedFiles).map((uriString) =>
        vscode.Uri.parse(uriString),
      );
      return Promise.resolve(files);
    }
    return Promise.resolve([]);
  }
}

/**
 * Chat TreeDataProvider for managing chat messages and files in tree view
 */
export class ChatTreeDataProvider implements vscode.TreeDataProvider<ChatItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    ChatItem | undefined | null | void
  > = new vscode.EventEmitter<ChatItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ChatItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private messages: ChatMessage[] = [];

  /**
   * Updates the messages and refreshes the tree
   */
  updateMessages(messages: ChatMessage[]): void {
    this.messages = messages;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Clears all messages
   */
  clearMessages(): void {
    this.messages = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ChatItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, element.collapsibleState);
    item.id = element.id;

    if (element.type === "message") {
      item.iconPath =
        element.message?.sender === "user"
          ? new vscode.ThemeIcon("account")
          : new vscode.ThemeIcon("robot");
      item.tooltip = element.message?.content;
      item.contextValue = "chatMessage";
    } else if (element.type === "file") {
      item.iconPath = new vscode.ThemeIcon("file");
      item.contextValue = "chatFile";
      item.resourceUri = element.message?.fileReference
        ? vscode.Uri.file(element.message.fileReference.filePath)
        : undefined;
      item.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [item.resourceUri],
      };
    }

    return item;
  }

  getChildren(element?: ChatItem): Thenable<ChatItem[]> {
    if (!element) {
      const items: ChatItem[] = [];

      this.messages.forEach((message) => {
        const messageItem: ChatItem = {
          id: `message-${message.id}`,
          label: `${message.sender}: ${message.content.substring(0, 50)}${message.content.length > 50 ? "..." : ""}`,
          type: "message",
          message: message,
          collapsibleState: message.fileReference
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
        };
        items.push(messageItem);

        if (message.fileReference) {
          const fileItem: ChatItem = {
            id: `file-${message.id}`,
            label: `📎 ${message.fileReference.fileName}`,
            type: "file",
            message: message,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
          };
          items.push(fileItem);
        }
      });

      return Promise.resolve(items);
    }

    return Promise.resolve([]);
  }
}
