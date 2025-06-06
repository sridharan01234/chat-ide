/**
 * Inline Chat Provider for VS Code Extension
 * 
 * Provides GitHub Copilot-like inline chat functionality directly in the editor
 * using VS Code's built-in APIs for inline suggestions and input boxes.
 * 
 * @fileoverview Inline chat implementation with VS Code APIs
 * @author SRIDHARAN THILLAIYAPPAN
 * @version 1.0.0
 */

import * as vscode from "vscode";
import { OllamaService } from "./ollamaService";
import { FileManager } from "./fileManager";
import { ErrorUtils } from "./utils";

export class InlineChatProvider {
  private static instance: InlineChatProvider;
  private currentEditor: vscode.TextEditor | undefined;
  private currentPosition: vscode.Position | undefined;
  private currentDecoration: vscode.TextEditorDecorationType | undefined;
  private isVisible: boolean = false;
  private pendingSuggestion: string | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private extensionUri: vscode.Uri,
    private ollamaService: OllamaService,
    private fileManager: FileManager
  ) {}

  public static getInstance(
    extensionUri: vscode.Uri,
    ollamaService: OllamaService,
    fileManager: FileManager
  ): InlineChatProvider {
    if (!InlineChatProvider.instance) {
      InlineChatProvider.instance = new InlineChatProvider(
        extensionUri,
        ollamaService,
        fileManager
      );
    }
    return InlineChatProvider.instance;
  }

  /**
   * Start inline chat at the current cursor position
   */
  public async startInlineChat(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showWarningMessage("No active editor found");
      return;
    }

    this.currentEditor = activeEditor;
    this.currentPosition = activeEditor.selection.active;

    try {
      await this.showInlineChatInput();
      this.setContext(true);
    } catch (error) {
      ErrorUtils.logError("InlineChatProvider.startInlineChat", error);
      vscode.window.showErrorMessage(
        `Failed to start inline chat: ${ErrorUtils.createUserFriendlyError(error)}`
      );
    }
  }

  /**
   * Accept the current inline chat suggestion
   */
  public async acceptSuggestion(): Promise<void> {
    if (!this.pendingSuggestion || !this.currentEditor || !this.currentPosition) {
      return;
    }

    try {
      const workspaceEdit = new vscode.WorkspaceEdit();
      workspaceEdit.insert(
        this.currentEditor.document.uri,
        this.currentPosition,
        this.pendingSuggestion
      );
      
      await vscode.workspace.applyEdit(workspaceEdit);
      await this.hideInlineChat();
      
      vscode.window.showInformationMessage("Suggestion accepted");
    } catch (error) {
      ErrorUtils.logError("InlineChatProvider.acceptSuggestion", error);
      vscode.window.showErrorMessage(
        `Failed to accept suggestion: ${ErrorUtils.createUserFriendlyError(error)}`
      );
    }
  }

  /**
   * Reject the current inline chat suggestion
   */
  public async rejectSuggestion(): Promise<void> {
    await this.hideInlineChat();
    vscode.window.showInformationMessage("Suggestion rejected");
  }

  /**
   * Hide the inline chat widget
   */
  public async hideInlineChat(): Promise<void> {
    if (this.currentDecoration) {
      this.currentDecoration.dispose();
      this.currentDecoration = undefined;
    }

    // Dispose all disposables
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];

    this.isVisible = false;
    this.pendingSuggestion = undefined;
    this.setContext(false);
  }

  /**
   * Check if inline chat is currently visible
   */
  public get visible(): boolean {
    return this.isVisible;
  }

  /**
   * Show inline chat input using VS Code's input box
   */
  private async showInlineChatInput(): Promise<void> {
    if (!this.currentEditor || !this.currentPosition) {
      return;
    }

    try {
      // Show input box for user query
      const userInput = await vscode.window.showInputBox({
        prompt: "What would you like me to help you with?",
        placeHolder: "Ask about the code, request changes, or get suggestions...",
        ignoreFocusOut: true
      });

      if (!userInput) {
        await this.hideInlineChat();
        return;
      }

      this.isVisible = true;

      // Show progress while generating response
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "AI Assistant",
          cancellable: true
        },
        async (progress, token) => {
          progress.report({ message: "Generating response..." });

          // Get context around cursor
          const context = this.getContextAroundCursor();
          
          // Generate AI response
          const response = await this.ollamaService.getCodingHelp(
            userInput,
            context
          );

          if (token.isCancellationRequested) {
            await this.hideInlineChat();
            return;
          }

          // Handle the response
          await this.handleAIResponse(response, userInput);
        }
      );

    } catch (error) {
      ErrorUtils.logError("InlineChatProvider.showInlineChatInput", error);
      await this.hideInlineChat();
      throw error;
    }
  }

  /**
   * Handle AI response - either show as suggestion or insert directly
   */
  private async handleAIResponse(response: string, originalQuery: string): Promise<void> {
    if (!this.currentEditor || !this.currentPosition) {
      return;
    }

    // Check if response looks like code that should be inserted
    const isCodeSuggestion = this.isCodeSuggestion(response, originalQuery);

    if (isCodeSuggestion) {
      // Show as inline suggestion
      await this.showInlineSuggestion(response);
    } else {
      // Show as information/explanation
      await this.showResponseAsInformation(response);
    }
  }

  /**
   * Show response as an inline code suggestion
   */
  private async showInlineSuggestion(suggestion: string): Promise<void> {
    if (!this.currentEditor || !this.currentPosition) {
      return;
    }

    this.pendingSuggestion = suggestion;

    // Create decoration for the suggestion
    this.currentDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` ${suggestion.split('\n')[0]}...`,
        color: new vscode.ThemeColor('editorGhostText.foreground'),
        fontStyle: 'italic'
      }
    });

    // Apply decoration
    const range = new vscode.Range(this.currentPosition, this.currentPosition);
    this.currentEditor.setDecorations(this.currentDecoration, [range]);

    // Show action buttons
    const action = await vscode.window.showInformationMessage(
      "AI suggestion ready",
      { modal: false },
      "Accept",
      "Reject",
      "View Full"
    );

    switch (action) {
      case "Accept":
        await this.acceptSuggestion();
        break;
      case "Reject":
        await this.rejectSuggestion();
        break;
      case "View Full":
        await this.showFullResponse(suggestion);
        break;
      default:
        await this.hideInlineChat();
    }
  }

  /**
   * Show response as information (not code)
   */
  private async showResponseAsInformation(response: string): Promise<void> {
    const action = await vscode.window.showInformationMessage(
      "AI Assistant Response",
      { modal: false },
      "View Response",
      "Dismiss"
    );

    if (action === "View Response") {
      await this.showFullResponse(response);
    }

    await this.hideInlineChat();
  }

  /**
   * Show full AI response in a new document
   */
  private async showFullResponse(response: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      content: response,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    await this.hideInlineChat();
  }

  /**
   * Get context lines around the cursor position
   */
  private getContextAroundCursor(): string {
    if (!this.currentEditor || !this.currentPosition) {
      return '';
    }

    const document = this.currentEditor.document;
    const startLine = Math.max(0, this.currentPosition.line - 10);
    const endLine = Math.min(document.lineCount - 1, this.currentPosition.line + 10);
    
    let context = '';
    for (let i = startLine; i <= endLine; i++) {
      const line = document.lineAt(i);
      const marker = i === this.currentPosition.line ? ' <<< CURSOR HERE' : '';
      context += `${i + 1}: ${line.text}${marker}\n`;
    }
    
    return context;
  }

  /**
   * Determine if response is a code suggestion
   */
  private isCodeSuggestion(response: string, query: string): boolean {
    // Simple heuristics to determine if this is code
    const codeIndicators = [
      'function', 'class', 'const', 'let', 'var', 'if', 'for', 'while',
      'import', 'export', 'def', 'public', 'private', 'return'
    ];
    
    const queryLowerCase = query.toLowerCase();
    const responseLowerCase = response.toLowerCase();
    
    // If query asks for code generation/modification
    const isCodeQuery = queryLowerCase.includes('write') || 
                       queryLowerCase.includes('generate') ||
                       queryLowerCase.includes('create') ||
                       queryLowerCase.includes('add') ||
                       queryLowerCase.includes('implement');
    
    // If response contains code indicators
    const hasCodeIndicators = codeIndicators.some(indicator => 
      responseLowerCase.includes(indicator)
    );
    
    // If response has code blocks
    const hasCodeBlocks = response.includes('```') || response.includes('`');
    
    return isCodeQuery && (hasCodeIndicators || hasCodeBlocks);
  }

  /**
   * Set context for when inline chat is active
   */
  private setContext(active: boolean): void {
    vscode.commands.executeCommand('setContext', 'aiAssistant.inlineChatActive', active);
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.hideInlineChat();
  }
}