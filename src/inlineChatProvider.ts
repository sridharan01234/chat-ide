/**
 * Inline Chat Provider for AI Code Assistant
 *
 * Provides true inline chat experience directly in the editor at cursor position
 */

import * as vscode from "vscode";
import { OllamaService } from "./ollamaService";
import { FileManager } from "./fileManager";

export class InlineChatProvider {
  private static instance: InlineChatProvider;
  private ollamaService: OllamaService;
  private fileManager: FileManager;
  private activeSession: InlineChatSession | undefined;

  private constructor(ollamaService: OllamaService, fileManager: FileManager) {
    this.ollamaService = ollamaService;
    this.fileManager = fileManager;
  }

  public static getInstance(
    ollamaService: OllamaService,
    fileManager: FileManager,
  ): InlineChatProvider {
    if (!InlineChatProvider.instance) {
      InlineChatProvider.instance = new InlineChatProvider(
        ollamaService,
        fileManager,
      );
    }
    return InlineChatProvider.instance;
  }

  /**
   * Start inline chat session at current cursor position
   */
  public async startInlineChat(): Promise<void> {
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
    this.activeSession = new InlineChatSession(
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
      this.activeSession.dispose();
      this.activeSession = undefined;
    }
  }

  /**
   * Reject the current suggestion
   */
  public async rejectSuggestion(): Promise<void> {
    if (this.activeSession) {
      this.activeSession.rejectSuggestion();
      this.activeSession.dispose();
      this.activeSession = undefined;
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

class InlineChatSession {
  private editor: vscode.TextEditor;
  private ollamaService: OllamaService;
  private fileManager: FileManager;
  private originalPosition: vscode.Position;
  private suggestionRange: vscode.Range | undefined;
  private suggestionDecoration: vscode.TextEditorDecorationType;
  private cursorDecoration: vscode.TextEditorDecorationType;
  private conversationIndicator: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];
  private isProcessing = false;
  private chatHistory: { role: "user" | "assistant"; content: string }[] = [];
  private isContinuingConversation = false;

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
    });

    // Create decoration type for cursor indicator
    this.cursorDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: "💬",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        margin: "0 0 0 5px",
      },
    });

    // Create decoration type for conversation continuation indicator
    this.conversationIndicator = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: "🔄",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        margin: "0 0 0 3px",
      },
    });
  }

  /**
   * Start the inline chat session
   */
  public async start(): Promise<void> {
    const editor = this.editor;
    const document = editor.document;
    const line = document.lineAt(this.originalPosition.line).text;

    // Position where we'll insert our AI trigger indicator
    const lineStartPos = new vscode.Position(this.originalPosition.line, 0);

    // Check if this is a continuation of an existing conversation
    const hasChatHistory = this.chatHistory.length > 0;
    const continuationOptions = hasChatHistory
      ? ["New conversation", "Continue previous conversation"]
      : undefined;

    let userInput: string;
    let shouldContinue = false;

    // If there's previous chat history, ask if user wants to continue or start fresh
    if (hasChatHistory) {
      const selection = await vscode.window.showQuickPick(
        continuationOptions!,
        {
          placeHolder: "Would you like to continue the previous conversation?",
        },
      );

      if (!selection) {
        return; // User cancelled
      }

      shouldContinue = selection === "Continue previous conversation";
      this.isContinuingConversation = shouldContinue;

      if (!shouldContinue) {
        // Clear chat history for a new conversation
        this.chatHistory = [];
      }
    }

    // If line is empty or just whitespace, prompt for input
    // Otherwise use the current line as input
    if (!line.trim()) {
      // Show input box for user request
      const inputPrompt = shouldContinue
        ? "Continue your conversation with AI..."
        : "What would you like the AI to help with?";

      const userInputResult = await vscode.window.showInputBox({
        placeHolder: inputPrompt,
        prompt: "Enter your request",
      });

      if (!userInputResult) {
        return; // User cancelled
      }

      userInput = userInputResult;

      // Add visual indicator during processing
      editor.setDecorations(this.cursorDecoration, [
        {
          range: new vscode.Range(lineStartPos, lineStartPos),
          hoverMessage: "Processing your request...",
        },
      ]);

      if (shouldContinue) {
        // Add continuation indicator
        editor.setDecorations(this.conversationIndicator, [
          {
            range: new vscode.Range(lineStartPos, lineStartPos),
            hoverMessage: "Continuing conversation",
          },
        ]);
      }
    } else {
      userInput = line.trim();

      // Add visual indicator during processing
      const endOfLine = new vscode.Position(
        this.originalPosition.line,
        line.length,
      );
      editor.setDecorations(this.cursorDecoration, [
        {
          range: new vscode.Range(endOfLine, endOfLine),
          hoverMessage: "Processing your request...",
        },
      ]);
    }

    // Process the user's input
    await this.processUserInput(userInput);
  }

  /**
   * Process user input and generate suggestion
   */
  private async processUserInput(userInput: string): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    // Add user message to chat history
    this.chatHistory.push({ role: "user", content: userInput });

    // Get context from current file and selection
    const document = this.editor.document;
    const selection = this.editor.selection;

    let contextCode = "";
    if (!selection.isEmpty) {
      contextCode = document.getText(selection);
    } else {
      // Get surrounding context (20 lines before and after cursor)
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

    // Prepare prompt with context and chat history
    const prompt = this.createPrompt(
      userInput,
      contextCode,
      document.languageId,
    );

    try {
      // Show progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "AI Assistant is thinking...",
          cancellable: false,
        },
        async (progress) => {
          // Get AI response
          const response = await this.ollamaService.generateResponse(prompt);

          // Add AI response to chat history
          this.chatHistory.push({ role: "assistant", content: response });

          // Extract code from response if it contains code blocks
          const codeMatch = response.match(/```(?:\w+)?\n?([\s\S]*?)```/);
          const suggestion = codeMatch ? codeMatch[1].trim() : response.trim();

          if (suggestion) {
            await this.showSuggestion(suggestion);
          } else {
            vscode.window.showInformationMessage("AI Assistant: " + response);
          }
        },
      );
    } catch (error) {
      console.error("[InlineChat] Error getting AI response:", error);
      vscode.window.showErrorMessage(`Failed to get AI response: ${error}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Create prompt with context and chat history
   */
  private createPrompt(
    userInput: string,
    contextCode: string,
    languageId: string,
  ): string {
    let historyText = "";

    // Include chat history if continuing a conversation
    if (this.isContinuingConversation && this.chatHistory.length > 1) {
      // Get previous exchanges but exclude the latest user message (which we'll add explicitly)
      const previousHistory = this.chatHistory.slice(0, -1);
      historyText = previousHistory
        .map(
          (msg) =>
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
        )
        .join("\n\n");

      historyText = `\nPrevious conversation:\n${historyText}\n\n`;
    }

    return `You are an AI coding assistant. The user is working in a ${languageId} file and has asked: "${userInput}"

Current code context:
\`\`\`${languageId}
${contextCode}
\`\`\`
${historyText}
Please provide a helpful response. If you're suggesting code changes, provide only the code that should be inserted or replace the selected text. Keep your response concise and focused.`;
  }

  /**
   * Show suggestion inline in the editor
   */
  private async showSuggestion(suggestion: string): Promise<void> {
    const selection = this.editor.selection;

    if (selection.isEmpty) {
      // Insert at cursor position
      const position = this.originalPosition;
      await this.editor.edit((editBuilder) => {
        editBuilder.insert(position, suggestion);
      });

      // Create range for the inserted text
      const endPosition = position.translate(0, suggestion.length);
      this.suggestionRange = new vscode.Range(position, endPosition);
    } else {
      // Replace selected text
      await this.editor.edit((editBuilder) => {
        editBuilder.replace(selection, suggestion);
      });

      // Create range for the replaced text
      const endPosition = selection.start.translate(0, suggestion.length);
      this.suggestionRange = new vscode.Range(selection.start, endPosition);
    }

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
      "Accept",
      "Reject",
      "Regenerate",
      "Continue to iterate?",
    );

    if (action === "Accept") {
      await this.acceptSuggestion();
    } else if (action === "Reject") {
      this.rejectSuggestion();
    } else if (action === "Regenerate") {
      this.rejectSuggestion();
      // Remove the last user and assistant messages
      if (this.chatHistory.length >= 2) {
        this.chatHistory = this.chatHistory.slice(0, -2);
      }
      // Start new session for regeneration
      setTimeout(() => {
        vscode.commands.executeCommand("ai-assistant.startInlineChat");
      }, 100);
    } else if (action === "Continue to iterate?") {
      // Accept the current suggestion
      await this.acceptSuggestion();

      // Set flag to continue conversation
      this.isContinuingConversation = true;

      // Show input box for follow-up question
      const followUp = await vscode.window.showInputBox({
        prompt: "Follow-up question:",
        placeHolder: "Enter your follow-up...",
      });

      if (followUp) {
        await this.processUserInput(followUp);
      }
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
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    // Clear any decorations
    this.editor.setDecorations(this.suggestionDecoration, []);
    this.editor.setDecorations(this.cursorDecoration, []);

    // Dispose decoration types
    this.suggestionDecoration.dispose();
    this.cursorDecoration.dispose();

    // Dispose all other resources
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

/**
 * Register inline completion provider for AI chat suggestions
 */
export function registerInlineCompletions(
  context: vscode.ExtensionContext,
  ollamaService: OllamaService,
  fileManager: FileManager,
) {
  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      _context: vscode.InlineCompletionContext,
      _token: vscode.CancellationToken,
    ) {
      // No longer trigger based on "// ai:" prefix
      // Instead, trigger when the user presses the assigned keyboard shortcut

      // Assemble context code (10 lines before and after)
      const startLine = Math.max(0, position.line - 10);
      const endLine = Math.min(document.lineCount - 1, position.line + 10);
      const contextRange = new vscode.Range(
        startLine,
        0,
        endLine,
        document.lineAt(endLine).text.length,
      );
      const contextCode = document.getText(contextRange);

      // Get current line as the user input
      const lineText = document.lineAt(position.line).text.trim();

      if (!lineText) {
        return { items: [] };
      }

      // Prepare prompt
      const prompt =
        `You are an AI coding assistant. The user has asked: "${lineText}"\n\n` +
        `Context around line ${position.line + 1}:\n` +
        "```" +
        document.languageId +
        "\n" +
        contextCode +
        "\n```";

      let suggestionText = "";
      try {
        const response = await ollamaService.generateResponse(prompt);
        const codeMatch = response.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        suggestionText = (codeMatch ? codeMatch[1] : response).trim();
      } catch (error) {
        console.error("InlineCompletions error:", error);
        return { items: [] };
      }

      if (!suggestionText) {
        return { items: [] };
      }

      const item = new vscode.InlineCompletionItem(
        suggestionText,
        new vscode.Range(position, position),
      );
      return { items: [item] };
    },
  };
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      provider,
    ),
  );
}
