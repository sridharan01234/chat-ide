/**
 * Enhanced Ghost Chat Provider for AI Code Assistant
 * 
 * Provides a ghost-like chat interface that appears directly at the cursor position
 * with diff-like accept/reject functionality similar to Monaco Editor patterns
 * 
 * Features:
 * - Floating input at cursor position with manual close (Escape)
 * - Diff-like preview without applying changes immediately
 * - Accept/Reject functionality using VS Code's inline suggestion patterns
 * - Context-aware AI suggestions with proper resource management
 * - Monaco Editor-style diff preview system
 */

import * as vscode from 'vscode';
import { OllamaService } from './ollamaService';
import { FileManager } from './fileManager';
import { ErrorUtils } from './utils';

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
  private originalSelection: vscode.Selection;
  private suggestionRange: vscode.Range | undefined;
  private suggestionText: string = "";
  private suggestionDecoration: vscode.TextEditorDecorationType;
  private ghostDecoration: vscode.TextEditorDecorationType;
  private acceptDecoration: vscode.TextEditorDecorationType;
  private rejectDecoration: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];
  private keyboardDisposables: vscode.Disposable[] = [];
  private isProcessing = false;
  private isActive = false;
  private hasSuggestion = false;
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
    this.originalSelection = editor.selection;

    // Create decoration type for diff-style preview of suggestions
    this.suggestionDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("diffEditor.insertedTextBackground"),
      border: "1px solid",
      borderColor: new vscode.ThemeColor("diffEditor.insertedTextBorder"),
      opacity: "0.6",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      overviewRulerColor: new vscode.ThemeColor("diffEditor.insertedTextBorder"),
    });

    // Create decoration type for ghost chat input
    this.ghostDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: "",
        backgroundColor: new vscode.ThemeColor("editor.background"),
        border: "1px solid",
        borderColor: new vscode.ThemeColor("focusBorder"),
        color: new vscode.ThemeColor("editor.foreground"),
        fontStyle: "normal",
        margin: "0 0 0 4px",
        width: "200px",
        height: "18px",
      },
      isWholeLine: false,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    // Create accept/reject button decorations
    this.acceptDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: " ✅ Accept (Tab)",
        backgroundColor: new vscode.ThemeColor("button.background"),
        color: new vscode.ThemeColor("button.foreground"),
        border: "1px solid",
        borderColor: new vscode.ThemeColor("button.border"),
        margin: "0 2px 0 4px",
        textDecoration: "none; padding: 2px 6px; border-radius: 3px; cursor: pointer;",
      },
    });

    this.rejectDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: " ❌ Reject (Esc)",
        backgroundColor: new vscode.ThemeColor("button.secondaryBackground"),
        color: new vscode.ThemeColor("button.secondaryForeground"),
        border: "1px solid",
        borderColor: new vscode.ThemeColor("contrastBorder"),
        margin: "0 0 0 2px",
        textDecoration: "none; padding: 2px 6px; border-radius: 3px; cursor: pointer;",
      },
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
    // Create a disposable for keyboard handling
    const keyboardDisposable = vscode.commands.registerCommand("type", async (args) => {
      if (!this.isActive || this.editor !== vscode.window.activeTextEditor) {
        return vscode.commands.executeCommand("default:type", args);
      }

      return this.handleKeyPress(args);
    });

    // Listen for special key combinations
    const escapeHandler = vscode.commands.registerCommand("ghost-chat.escape", () => {
      if (this.isActive) {
        this.handleEscape();
      }
    });

    const tabHandler = vscode.commands.registerCommand("ghost-chat.tab", () => {
      if (this.hasSuggestion) {
        this.acceptSuggestion();
      }
    });

    const enterHandler = vscode.commands.registerCommand("ghost-chat.enter", () => {
      if (this.isActive && !this.hasSuggestion) {
        this.submitInput();
      }
    });

    this.keyboardDisposables.push(keyboardDisposable, escapeHandler, tabHandler, enterHandler);
    this.disposables.push(...this.keyboardDisposables);

    // Register keybindings temporarily
    vscode.commands.executeCommand('setContext', 'ghostChatActive', true);
  }

  /**
   * Handle key press events
   */
  private async handleKeyPress(args: { text: string }): Promise<void> {
    const text = args.text;

    // Handle special cases
    if (text === "\n" || text === "\r\n") {
      // Enter pressed
      if (!this.hasSuggestion) {
        await this.submitInput();
      }
      return;
    }

    if (text === "\t") {
      // Tab pressed
      if (this.hasSuggestion) {
        await this.acceptSuggestion();
      }
      return;
    }

    if (text === "\u0008" || text === "\u007f") {
      // Backspace/Delete pressed
      if (this.currentInput.length > 0) {
        this.currentInput = this.currentInput.slice(0, -1);
        this.showGhostInput();
      } else if (this.hasSuggestion) {
        // If no input and we have suggestion, reject it
        this.rejectSuggestion();
      }
      return;
    }

    // Handle regular text input
    if (text.length === 1 && text >= " ") {
      this.currentInput += text;
      this.showGhostInput();
    }
  }

  /**
   * Handle escape key
   */
  private handleEscape(): void {
    if (this.hasSuggestion) {
      this.rejectSuggestion();
    } else {
      this.dispose();
    }
  }

  /**
   * Show suggestion as diff-style preview without applying changes
   */
  private async showSuggestion(suggestion: string): Promise<void> {
    const selection = this.editor.selection;
    const position = selection.isEmpty ? this.originalPosition : selection.start;

    // Store suggestion text for later application
    this.suggestionText = suggestion;
    this.hasSuggestion = true;

    // Calculate the range where suggestion would be inserted
    const lines = suggestion.split("\n");
    let endLine: number;
    let endChar: number;

    if (selection.isEmpty) {
      // Insert at cursor
      endLine = position.line + lines.length - 1;
      endChar = lines.length === 1 
        ? position.character + suggestion.length 
        : lines[lines.length - 1].length;
    } else {
      // Replace selection
      endLine = position.line + lines.length - 1;
      endChar = lines.length === 1 
        ? position.character + suggestion.length 
        : lines[lines.length - 1].length;
    }

    const endPosition = new vscode.Position(endLine, endChar);
    this.suggestionRange = new vscode.Range(position, endPosition);

    // Create virtual document to show diff-style preview
    await this.showDiffPreview(suggestion, position, selection);

    // Show accept/reject buttons
    this.showActionButtons();

    // Clear ghost input
    this.clearGhostInput();

    // Show status message
    vscode.window.setStatusBarMessage(
      "AI suggestion ready - Tab to accept, Esc to reject", 
      10000
    );
  }

  /**
   * Show diff-style preview using virtual text
   */
  private async showDiffPreview(suggestion: string, position: vscode.Position, selection: vscode.Selection): Promise<void> {
    // Create decoration that shows the suggestion as preview text
    const suggestionLines = suggestion.split('\n');
    const decorationOptions: vscode.DecorationOptions[] = [];

    if (suggestionLines.length === 1) {
      // Single line suggestion
      decorationOptions.push({
        range: new vscode.Range(position, position),
        renderOptions: {
          after: {
            contentText: suggestion,
            backgroundColor: new vscode.ThemeColor("diffEditor.insertedTextBackground"),
            color: new vscode.ThemeColor("diffEditor.insertedTextColor"),
            fontStyle: "italic",
            border: "1px solid",
            borderColor: new vscode.ThemeColor("diffEditor.insertedTextBorder"),
            margin: "0 2px",
          }
        }
      });
    } else {
      // Multi-line suggestion - show preview at cursor position
      suggestionLines.forEach((line, index) => {
        const linePosition = new vscode.Position(position.line + index, 
          index === 0 ? position.character : 0);
        decorationOptions.push({
          range: new vscode.Range(linePosition, linePosition),
          renderOptions: {
            after: {
              contentText: line,
              backgroundColor: new vscode.ThemeColor("diffEditor.insertedTextBackground"),
              color: new vscode.ThemeColor("diffEditor.insertedTextColor"),
              fontStyle: "italic",
              border: index === 0 ? "1px solid" : "none",
              borderColor: new vscode.ThemeColor("diffEditor.insertedTextBorder"),
            }
          }
        });
      });
    }

    // Apply diff-style decoration
    this.editor.setDecorations(this.suggestionDecoration, decorationOptions);
  }

  /**
   * Show action buttons for accept/reject
   */
  private showActionButtons(): void {
    if (!this.suggestionRange) return;

    const buttonPosition = this.suggestionRange.end;
    const buttonRange = new vscode.Range(buttonPosition, buttonPosition);

    // Show accept button
    this.editor.setDecorations(this.acceptDecoration, [{ range: buttonRange }]);

    // Show reject button (positioned after accept button)  
    const rejectPosition = new vscode.Position(buttonPosition.line, buttonPosition.character + 1);
    const rejectRange = new vscode.Range(rejectPosition, rejectPosition);
    this.editor.setDecorations(this.rejectDecoration, [{ range: rejectRange }]);
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
   * Accept the current suggestion
   */
  public async acceptSuggestion(): Promise<void> {
    if (!this.hasSuggestion || !this.suggestionText) {
      return;
    }

    // Apply the suggestion to the editor
    const selection = this.originalSelection;
    const position = selection.isEmpty ? this.originalPosition : selection.start;

    await this.editor.edit((editBuilder) => {
      if (selection.isEmpty) {
        editBuilder.insert(position, this.suggestionText);
      } else {
        editBuilder.replace(selection, this.suggestionText);
      }
    });

    // Clear all decorations
    this.clearAllSuggestionDecorations();

    // Move cursor to end of inserted text
    const lines = this.suggestionText.split("\n");
    const endLine = position.line + lines.length - 1;
    const endChar =
      lines.length === 1
        ? position.character + this.suggestionText.length
        : lines[lines.length - 1].length;
    const endPosition = new vscode.Position(endLine, endChar);
    
    this.editor.selection = new vscode.Selection(endPosition, endPosition);

    vscode.window.showInformationMessage("✅ AI suggestion accepted");
    this.dispose();
  }

  /**
   * Clear all suggestion-related decorations
   */
  private clearAllSuggestionDecorations(): void {
    this.editor.setDecorations(this.suggestionDecoration, []);
    this.editor.setDecorations(this.acceptDecoration, []);
    this.editor.setDecorations(this.rejectDecoration, []);
  }

  /**
   * Reject the current suggestion
   */
  public rejectSuggestion(): void {
    if (this.hasSuggestion) {
      // Clear all suggestion decorations (no need to remove text since it was never inserted)
      this.clearAllSuggestionDecorations();

      // Restore original cursor position
      this.editor.selection = new vscode.Selection(
        this.originalPosition,
        this.originalPosition,
      );

      // Reset suggestion state
      this.hasSuggestion = false;
      this.suggestionText = "";
      this.suggestionRange = undefined;
    }

    vscode.window.showInformationMessage("❌ AI suggestion rejected");
    this.dispose();
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    this.isActive = false;
    this.hasSuggestion = false;

    // Clear context
    vscode.commands.executeCommand('setContext', 'ghostChatActive', false);

    // Clear any decorations
    this.clearGhostInput();
    this.clearAllSuggestionDecorations();

    // Dispose decoration types
    if (this.suggestionDecoration) {
      this.suggestionDecoration.dispose();
    }
    if (this.ghostDecoration) {
      this.ghostDecoration.dispose();
    }
    if (this.acceptDecoration) {
      this.acceptDecoration.dispose();
    }
    if (this.rejectDecoration) {
      this.rejectDecoration.dispose();
    }

    // Dispose keyboard handlers first
    this.keyboardDisposables.forEach((d) => d.dispose());
    this.keyboardDisposables = [];

    // Dispose all other resources
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];

    // Clear status bar
    vscode.window.setStatusBarMessage("");
  }
}
