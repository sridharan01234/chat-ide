/**
 * Copilot-style input panel implementation
 */
import * as vscode from "vscode";
import { OllamaService } from "./ollamaService";
import { FileManager } from "./fileManager";
import { ErrorUtils } from "./utils";

/**
 * Provides a GitHub Copilot-style input panel at the bottom of the editor
 */
export class CopilotPanel {
  private panel: vscode.InputBox | undefined;
  private ollamaService: OllamaService;
  private fileManager: FileManager;
  private disposables: vscode.Disposable[] = [];
  private static instance: CopilotPanel | null = null;
  private ghostMode = false;
  private ghostDecoration: vscode.TextEditorDecorationType | undefined;
  private currentGhostText = "";
  private originalPosition: vscode.Position | undefined;

  private constructor(ollamaService: OllamaService, fileManager: FileManager) {
    this.ollamaService = ollamaService;
    this.fileManager = fileManager;
  }

  public static getInstance(
    ollamaService: OllamaService,
    fileManager: FileManager,
  ): CopilotPanel {
    if (!CopilotPanel.instance) {
      CopilotPanel.instance = new CopilotPanel(ollamaService, fileManager);
    }
    return CopilotPanel.instance;
  }

  public show(): void {
    if (this.panel) {
      this.panel.show();
      return;
    }

    this.panel = vscode.window.createInputBox();
    this.panel.placeholder = "Ask Copilot";
    this.panel.prompt = "Type your question or request...";

    this.panel.onDidAccept(async () => {
      await this.handleAccept();
    });

    this.panel.onDidHide(() => {
      this.dispose();
    });

    this.panel.show();
  }

  private async handleAccept(): Promise<void> {
    if (!this.panel?.value) {
      return;
    }

    const query = this.panel.value;
    this.panel.busy = true;
    this.panel.enabled = false;

    try {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        // Get context from current file
        const document = editor.document;
        const fileReference =
          this.fileManager.createFileReferenceFromDocument(document);

        // Call LLM service with the query and context
        const response = await this.ollamaService.getCompletion(query, [
          fileReference,
        ]);

        // Insert the response as a comment in the editor
        if (response && editor.selection) {
          const position = editor.selection.active;
          const indentation = this.getIndentation(document, position.line);
          const formattedResponse = this.formatResponse(response, indentation);

          editor.edit((editBuilder) => {
            editBuilder.insert(position, formattedResponse);
          });
        }
      } else {
        vscode.window.showInformationMessage("No active editor found");
      }
    } catch (error) {
      ErrorUtils.logError("CopilotPanel.handleAccept", error);
      vscode.window.showErrorMessage(ErrorUtils.createUserFriendlyError(error));
    } finally {
      this.panel.busy = false;
      this.panel.enabled = true;
      this.panel.value = "";
    }
  }

  private getIndentation(document: vscode.TextDocument, line: number): string {
    const lineText = document.lineAt(line).text;
    const match = lineText.match(/^(\s*)/);
    return match ? match[1] : "";
  }

  private formatResponse(response: string, indentation: string): string {
    // Format the response as code or comments based on content
    return response
      .split("\n")
      .map((line) => indentation + line)
      .join("\n");
  }

  public dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }

    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  public static registerCommands(
    context: vscode.ExtensionContext,
    copilotPanel: CopilotPanel,
  ): void {
    const commands = [
      vscode.commands.registerCommand("ai-assistant.showCopilotPanel", () => {
        copilotPanel.show();
      }),
      vscode.commands.registerCommand(
        "ai-assistant.showCopilotGhostMode",
        () => {
          copilotPanel.showGhostMode();
        },
      ),
    ];

    context.subscriptions.push(...commands);
  }

  /**
   * Show ghost mode input at the current cursor position
   */
  public showGhostMode(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor found");
      return;
    }

    this.ghostMode = true;
    this.originalPosition = editor.selection.active;
    this.currentGhostText = "";

    // Create ghost decoration
    this.createGhostDecoration();
    this.showGhostInput();

    // Set up keyboard listeners
    this.setupGhostKeyboardListeners();
  }

  /**
   * Create ghost decoration style
   */
  private createGhostDecoration(): void {
    this.ghostDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: "",
        backgroundColor: new vscode.ThemeColor("editor.background"),
        border: "1px solid",
        borderColor: new vscode.ThemeColor("editor.foreground"),
        color: new vscode.ThemeColor("editor.foreground"),
        fontStyle: "normal",
        margin: "0 0 0 4px",
      },
      isWholeLine: false,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }

  /**
   * Show ghost input at cursor position
   */
  private showGhostInput(): void {
    if (!this.originalPosition || !this.ghostDecoration) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const position = this.originalPosition;
    const range = new vscode.Range(position, position);

    // Update decoration with current input
    const displayText = this.currentGhostText || "💬 Ask AI...";
    const isPlaceholder = !this.currentGhostText;

    const ghostDecorationUpdated = vscode.window.createTextEditorDecorationType(
      {
        after: {
          contentText: displayText,
          backgroundColor: new vscode.ThemeColor("editor.background"),
          border: "1px solid",
          borderColor: new vscode.ThemeColor("editor.foreground"),
          color: isPlaceholder
            ? new vscode.ThemeColor("descriptionForeground")
            : new vscode.ThemeColor("editor.foreground"),
          fontStyle: isPlaceholder ? "italic" : "normal",
          margin: "0 0 0 4px",
          width: `${Math.max(150, displayText.length * 8)}px`,
          height: "18px",
        },
        isWholeLine: false,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      },
    );

    // Clean up old decoration
    if (this.ghostDecoration) {
      this.ghostDecoration.dispose();
    }
    this.ghostDecoration = ghostDecorationUpdated;

    // Apply decoration
    editor.setDecorations(this.ghostDecoration, [range]);
  }

  /**
   * Setup keyboard listeners for ghost mode
   */
  private setupGhostKeyboardListeners(): void {
    // Listen for key presses in ghost mode
    const typeListener = vscode.commands.registerCommand(
      "type",
      async (args) => {
        if (this.ghostMode && vscode.window.activeTextEditor) {
          return await this.handleGhostType(args);
        }
        return vscode.commands.executeCommand("default:type", args);
      },
    );

    this.disposables.push(typeListener);
  }

  /**
   * Handle typing in ghost mode
   */
  private async handleGhostType(args: { text: string }): Promise<void> {
    const text = args.text;

    if (text === "\n" || text === "\r\n") {
      // Enter pressed - submit the input
      await this.submitGhostInput();
      return;
    }

    if (text === "\u001b") {
      // Escape pressed - cancel ghost mode
      this.exitGhostMode();
      return;
    }

    if (text === "\b" || text === "\u007f") {
      // Backspace pressed
      this.currentGhostText = this.currentGhostText.slice(0, -1);
    } else if (text.length === 1 && text >= " ") {
      // Regular character
      this.currentGhostText += text;
    }

    // Update ghost decoration
    this.showGhostInput();
  }

  /**
   * Submit ghost input to AI
   */
  private async submitGhostInput(): Promise<void> {
    if (!this.currentGhostText.trim()) {
      this.exitGhostMode();
      return;
    }

    const query = this.currentGhostText.trim();
    this.clearGhostInput();
    this.showProcessingIndicator();

    try {
      const editor = vscode.window.activeTextEditor;
      if (editor && this.originalPosition) {
        // Get context from current file
        const document = editor.document;
        const fileReference =
          this.fileManager.createFileReferenceFromDocument(document);

        // Get surrounding context for better AI responses
        const contextLines = 10;
        const startLine = Math.max(
          0,
          this.originalPosition.line - contextLines,
        );
        const endLine = Math.min(
          document.lineCount - 1,
          this.originalPosition.line + contextLines,
        );
        const contextRange = new vscode.Range(
          startLine,
          0,
          endLine,
          document.lineAt(endLine).text.length,
        );
        const contextCode = document.getText(contextRange);

        // Enhanced prompt with context
        const enhancedQuery = `Context: ${document.languageId} file\nSurrounding code:\n\`\`\`\n${contextCode}\n\`\`\`\n\nUser request: ${query}\n\nPlease provide a helpful response. If suggesting code, provide only the code that should be inserted at line ${this.originalPosition.line + 1}.`;

        // Call LLM service with enhanced context
        const response = await this.ollamaService.getCompletion(enhancedQuery, [
          fileReference,
        ]);

        if (response) {
          // Check if response contains code blocks
          const codeMatch = response.match(/```(?:\w+)?\n?([\s\S]*?)```/);
          const suggestion = codeMatch ? codeMatch[1].trim() : response.trim();

          if (codeMatch && suggestion) {
            // Insert code suggestion at original position
            await this.insertCodeSuggestion(suggestion);
          } else {
            // Insert response as comment or show as notification
            await this.insertTextResponse(response);
          }
        } else {
          vscode.window.showWarningMessage("No response received from AI");
        }
      }
    } catch (error) {
      ErrorUtils.logError("CopilotPanel.submitGhostInput", error);
      vscode.window.showErrorMessage(ErrorUtils.createUserFriendlyError(error));
    } finally {
      this.exitGhostMode();
    }
  }

  /**
   * Insert code suggestion with highlighting
   */
  private async insertCodeSuggestion(suggestion: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.originalPosition) {
      return;
    }

    const position = this.originalPosition;
    const indentation = this.getIndentation(editor.document, position.line);
    const formattedSuggestion = suggestion
      .split("\n")
      .map((line, index) => (index === 0 ? line : indentation + line))
      .join("\n");

    await editor.edit((editBuilder) => {
      editBuilder.insert(position, formattedSuggestion);
    });

    // Highlight the inserted code
    const lines = formattedSuggestion.split("\n");
    const endLine = position.line + lines.length - 1;
    const endChar =
      lines.length === 1
        ? position.character + formattedSuggestion.length
        : lines[lines.length - 1].length;
    const endPosition = new vscode.Position(endLine, endChar);
    const suggestionRange = new vscode.Range(position, endPosition);

    // Create highlight decoration
    const highlightDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor(
        "editor.findMatchHighlightBackground",
      ),
      border: "1px solid",
      borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
    });

    editor.setDecorations(highlightDecoration, [suggestionRange]);

    // Show action notification
    const action = await vscode.window.showInformationMessage(
      "AI code inserted at cursor",
      "Keep",
      "Undo",
    );

    if (action === "Undo") {
      await vscode.commands.executeCommand("undo");
    }

    // Clean up highlight after some time
    setTimeout(() => {
      editor.setDecorations(highlightDecoration, []);
      highlightDecoration.dispose();
    }, 5000);
  }

  /**
   * Insert text response as formatted comment
   */
  private async insertTextResponse(response: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.originalPosition) {
      return;
    }

    const position = this.originalPosition;
    const indentation = this.getIndentation(editor.document, position.line);

    // Format as comment based on language
    const languageId = editor.document.languageId;
    const commentPrefix = this.getCommentPrefix(languageId);
    const formattedResponse =
      response
        .split("\n")
        .map((line) => `${indentation}${commentPrefix} ${line}`)
        .join("\n") + "\n";

    await editor.edit((editBuilder) => {
      editBuilder.insert(position, formattedResponse);
    });

    vscode.window.showInformationMessage("AI response inserted as comment");
  }

  /**
   * Get comment prefix for different languages
   */
  private getCommentPrefix(languageId: string): string {
    const commentMap: { [key: string]: string } = {
      javascript: "//",
      typescript: "//",
      java: "//",
      cpp: "//",
      c: "//",
      csharp: "//",
      go: "//",
      rust: "//",
      python: "#",
      ruby: "#",
      bash: "#",
      shell: "#",
      yaml: "#",
      sql: "--",
      html: "<!--",
      xml: "<!--",
      css: "/*",
    };

    return commentMap[languageId] || "//";
  }

  /**
   * Show processing indicator in ghost mode
   */
  private showProcessingIndicator(): void {
    if (!this.originalPosition || !this.ghostDecoration) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

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

    // Clean up old decoration
    if (this.ghostDecoration) {
      this.ghostDecoration.dispose();
    }
    this.ghostDecoration = processingDecoration;

    editor.setDecorations(this.ghostDecoration, [range]);
  }

  /**
   * Clear ghost input decoration
   */
  private clearGhostInput(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor && this.ghostDecoration) {
      editor.setDecorations(this.ghostDecoration, []);
    }
  }

  /**
   * Exit ghost mode and cleanup
   */
  private exitGhostMode(): void {
    this.ghostMode = false;
    this.currentGhostText = "";
    this.clearGhostInput();

    if (this.ghostDecoration) {
      this.ghostDecoration.dispose();
      this.ghostDecoration = undefined;
    }

    this.originalPosition = undefined;
  }
}
