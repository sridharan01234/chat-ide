/**
 * Ghost Chat Provider for AI Code Assistant
 *
 * Provides a ghost-like chat interface that appears directly at the cursor position
 * with a floating, semi-transparent input field - similar to Cursor editor
 */

import * as vscode from "vscode";
import { OllamaService } from "./ollamaService";
import { FileManager } from "./fileManager";
import { ErrorUtils } from "./utils";

export class GhostChatProvider {
  private static instance: GhostChatProvider;
  private ollamaService: OllamaService;
  private fileManager: FileManager;
  private activeSession: GhostChatSession | undefined;

  private constructor(ollamaService: OllamaService, fileManager: FileManager) {
    this.ollamaService = ollamaService;
    this.fileManager = fileManager;
  }

  public static getInstance(
    ollamaService: OllamaService,
    fileManager: FileManager,
  ): GhostChatProvider {
    if (!GhostChatProvider.instance) {
      GhostChatProvider.instance = new GhostChatProvider(
        ollamaService,
        fileManager,
      );
    }
    return GhostChatProvider.instance;
  }

  /**
   * Start ghost chat session at current cursor position
   */
  public async startGhostChat(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor found");
      return;
    }

    // End any existing session
    if (this.activeSession) {
      this.activeSession.dispose();
      this.activeSession = undefined;
    }

    // Create new session
    this.activeSession = new GhostChatSession(
      editor,
      this.ollamaService,
      this.fileManager,
    );

    await this.activeSession.start();
  }

  /**
   * Accept the current suggestion
   */
  public async acceptSuggestion(): Promise<void> {
    if (this.activeSession) {
      await this.activeSession.acceptSuggestion();
    }
  }

  /**
   * Reject the current suggestion
   */
  public async rejectSuggestion(): Promise<void> {
    if (this.activeSession) {
      this.activeSession.rejectSuggestion();
    }
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    if (this.activeSession) {
      this.activeSession.dispose();
    }
  }
}

class GhostChatSession {
  private editor: vscode.TextEditor;
  private ollamaService: OllamaService;
  private fileManager: FileManager;
  private originalPosition: vscode.Position;
  private suggestionRange: vscode.Range | undefined;
  private suggestionDecoration: vscode.TextEditorDecorationType;
  private ghostDecoration: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];
  private isProcessing = false;
  private isActive = false;
  private currentInput = "";

  constructor(
    editor: vscode.TextEditor,
    ollamaService: OllamaService,
    fileManager: FileManager,
  ) {
    this.editor = editor;
    this.ollamaService = ollamaService;
    this.fileManager = fileManager;
    this.originalPosition = editor.selection.active;

    // Create decoration type for highlighting suggestions
    this.suggestionDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor(
        "editor.findMatchHighlightBackground",
      ),
      border: "1px solid",
      borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
      opacity: "0.8",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    // Create decoration type for ghost chat indicator
    this.ghostDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: "",
        backgroundColor: new vscode.ThemeColor("editor.background"),
        border: "1px solid",
        borderColor: new vscode.ThemeColor("editor.foreground"),
        color: new vscode.ThemeColor("editor.foreground"),
        fontStyle: "normal",
        margin: "0 0 0 2px",
        width: "200px",
        height: "20px",
      },
      isWholeLine: false,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }

  /**
   * Start the ghost chat session
   */
  public async start(): Promise<void> {
    this.isActive = true;

    // Show ghost input decoration
    this.showGhostInput();

    // Set up keyboard listeners
    this.setupKeyboardListeners();

    // Show status bar message
    vscode.window.setStatusBarMessage("Ghost Chat: Type your message...", 5000);
  }

  /**
   * Show ghost input decoration at cursor position
   */
  private showGhostInput(): void {
    const position = this.originalPosition;
    const range = new vscode.Range(position, position);

    // Create the ghost input decoration with placeholder text
    const ghostDecorationUpdated = vscode.window.createTextEditorDecorationType(
      {
        after: {
          contentText: this.currentInput || "💬 Ask AI...",
          backgroundColor: new vscode.ThemeColor("editor.background"),
          border: "1px solid",
          borderColor: new vscode.ThemeColor("editor.foreground"),
          color: this.currentInput
            ? new vscode.ThemeColor("editor.foreground")
            : new vscode.ThemeColor("descriptionForeground"),
          fontStyle: this.currentInput ? "normal" : "italic",
          margin: "0 0 0 4px",
          width: `${Math.max(200, this.currentInput.length * 8)}px`,
          height: "18px",
          textDecoration: "none",
        },
        isWholeLine: false,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        opacity: "0.8",
      },
    );

    // Clean up old decoration
    if (this.ghostDecoration) {
      this.ghostDecoration.dispose();
    }
    this.ghostDecoration = ghostDecorationUpdated;

    // Apply decoration
    this.editor.setDecorations(this.ghostDecoration, [range]);
  }

  /**
   * Setup keyboard event listeners for ghost input
   */
  private setupKeyboardListeners(): void {
    // Listen for text document changes to capture typing
    const textChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === this.editor.document && this.isActive) {
        this.handleTextChange(e);
      }
    });

    // Listen for key presses
    const typeListener = vscode.commands.registerCommand("type", (args) => {
      if (this.isActive && this.editor === vscode.window.activeTextEditor) {
        return this.handleType(args);
      }
      return vscode.commands.executeCommand("default:type", args);
    });

    this.disposables.push(textChangeListener, typeListener);
  }

  /**
   * Handle typing in ghost input
   */
  private async handleType(args: { text: string }): Promise<void> {
    const text = args.text;

    if (text === "\n" || text === "\r\n") {
      // Enter pressed - submit the input
      await this.submitInput();
      return;
    }

    if (text === "\u001b") {
      // Escape pressed - cancel
      this.dispose();
      return;
    }

    if (text === "\b" || text === "\u007f") {
      // Backspace pressed
      this.currentInput = this.currentInput.slice(0, -1);
    } else if (text.length === 1 && text >= " ") {
      // Regular character
      this.currentInput += text;
    }

    // Update ghost decoration
    this.showGhostInput();
  }

  /**
   * Handle text document changes
   */
  private handleTextChange(e: vscode.TextDocumentChangeEvent): void {
    // Check if changes are at the cursor position and might interfere
    for (const change of e.contentChanges) {
      if (
        change.range.contains(this.originalPosition) ||
        change.range.start.isEqual(this.originalPosition)
      ) {
        // User is typing at the cursor position, update our tracking
        this.originalPosition = change.range.end;
        this.showGhostInput();
        break;
      }
    }
  }

  /**
   * Submit the current input to AI
   */
  private async submitInput(): Promise<void> {
    if (!this.currentInput.trim()) {
      this.dispose();
      return;
    }

    const userInput = this.currentInput.trim();
    this.isProcessing = true;

    // Clear ghost input and show processing indicator
    this.clearGhostInput();
    this.showProcessingIndicator();

    try {
      // Get context from current file and selection
      const document = this.editor.document;
      const selection = this.editor.selection;

      let contextCode = "";
      if (!selection.isEmpty) {
        contextCode = document.getText(selection);
      } else {
        // Get surrounding context (10 lines before and after cursor)
        const startLine = Math.max(0, this.originalPosition.line - 10);
        const endLine = Math.min(
          document.lineCount - 1,
          this.originalPosition.line + 10,
        );
        const contextRange = new vscode.Range(
          startLine,
          0,
          endLine,
          document.lineAt(endLine).text.length,
        );
        contextCode = document.getText(contextRange);
      }

      // Prepare prompt
      const prompt = this.createPrompt(
        userInput,
        contextCode,
        document.languageId,
      );

      // Get AI response
      const response = await this.ollamaService.generateResponse(prompt);

      // Extract code from response if it contains code blocks
      const codeMatch = response.match(/```(?:\w+)?\n?([\s\S]*?)```/);
      const suggestion = codeMatch ? codeMatch[1].trim() : response.trim();

      if (suggestion && codeMatch) {
        await this.showSuggestion(suggestion);
      } else {
        // Show non-code response as notification
        vscode.window.showInformationMessage(`AI: ${response}`);
        this.dispose();
      }
    } catch (error) {
      console.error("[GhostChat] Error getting AI response:", error);
      ErrorUtils.logError("GhostChat.submitInput", error);
      vscode.window.showErrorMessage(
        `Failed to get AI response: ${ErrorUtils.createUserFriendlyError(error)}`,
      );
      this.dispose();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Create prompt with context
   */
  private createPrompt(
    userInput: string,
    contextCode: string,
    languageId: string,
  ): string {
    return `You are an AI coding assistant. The user is working in a ${languageId} file and has asked: "${userInput}"

Current code context:
\`\`\`${languageId}
${contextCode}
\`\`\`

Please provide a helpful response. If you're suggesting code changes, provide only the code that should be inserted at the cursor position. Keep your response concise and focused.`;
  }

  /**
   * Show processing indicator
   */
  private showProcessingIndicator(): void {
    const position = this.originalPosition;
    const range = new vscode.Range(position, position);

    const processingDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: "⏳ AI is thinking...",
        color: new vscode.ThemeColor("descriptionForeground"),
        fontStyle: "italic",
        margin: "0 0 0 4px",
      },
    });

    if (this.ghostDecoration) {
      this.ghostDecoration.dispose();
    }
    this.ghostDecoration = processingDecoration;

    this.editor.setDecorations(this.ghostDecoration, [range]);
  }

  /**
   * Clear ghost input decoration
   */
  private clearGhostInput(): void {
    if (this.ghostDecoration) {
      this.editor.setDecorations(this.ghostDecoration, []);
    }
  }

  /**
   * Show suggestion inline in the editor
   */
  private async showSuggestion(suggestion: string): Promise<void> {
    const selection = this.editor.selection;
    const position = selection.isEmpty
      ? this.originalPosition
      : selection.start;

    // Insert suggestion at cursor/selection
    await this.editor.edit((editBuilder) => {
      if (selection.isEmpty) {
        editBuilder.insert(position, suggestion);
      } else {
        editBuilder.replace(selection, suggestion);
      }
    });

    // Create range for the inserted text
    const lines = suggestion.split("\n");
    const endLine = position.line + lines.length - 1;
    const endChar =
      lines.length === 1
        ? position.character + suggestion.length
        : lines[lines.length - 1].length;
    const endPosition = new vscode.Position(endLine, endChar);
    this.suggestionRange = new vscode.Range(position, endPosition);

    // Apply suggestion decoration
    if (this.suggestionRange) {
      this.editor.setDecorations(this.suggestionDecoration, [
        this.suggestionRange,
      ]);
    }

    // Show action buttons
    const action = await vscode.window.showInformationMessage(
      "AI suggestion inserted at cursor",
      { modal: false },
      "Accept ✅",
      "Reject ❌",
      "Regenerate 🔄",
    );

    if (action === "Accept ✅") {
      await this.acceptSuggestion();
    } else if (action === "Reject ❌") {
      this.rejectSuggestion();
    } else if (action === "Regenerate 🔄") {
      this.rejectSuggestion();
      // Start new ghost chat session for regeneration
      setTimeout(() => {
        vscode.commands.executeCommand("ai-assistant.startGhostChat");
      }, 100);
    } else {
      // Auto-accept if no action taken
      setTimeout(() => {
        if (this.suggestionRange) {
          this.acceptSuggestion();
        }
      }, 10000);
    }
  }

  /**
   * Accept the current suggestion
   */
  public async acceptSuggestion(): Promise<void> {
    // Clear decoration
    this.editor.setDecorations(this.suggestionDecoration, []);

    // Move cursor to end of suggestion
    if (this.suggestionRange) {
      const newPosition = this.suggestionRange.end;
      this.editor.selection = new vscode.Selection(newPosition, newPosition);
    }

    vscode.window.showInformationMessage("✅ AI suggestion accepted");
    this.dispose();
  }

  /**
   * Reject the current suggestion
   */
  public rejectSuggestion(): void {
    if (this.suggestionRange) {
      // Remove the suggested text
      this.editor.edit((editBuilder) => {
        editBuilder.delete(this.suggestionRange!);
      });

      // Clear decoration
      this.editor.setDecorations(this.suggestionDecoration, []);

      // Restore original cursor position
      this.editor.selection = new vscode.Selection(
        this.originalPosition,
        this.originalPosition,
      );
    }

    vscode.window.showInformationMessage("❌ AI suggestion rejected");
    this.dispose();
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    this.isActive = false;

    // Clear any decorations
    this.clearGhostInput();
    this.editor.setDecorations(this.suggestionDecoration, []);

    // Dispose decoration types
    if (this.suggestionDecoration) {
      this.suggestionDecoration.dispose();
    }
    if (this.ghostDecoration) {
      this.ghostDecoration.dispose();
    }

    // Dispose all other resources
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
