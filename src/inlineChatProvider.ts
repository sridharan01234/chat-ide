/**
 * Inline Chat Provider for AI Code Assistant
 * 
 * Provides inline chat experience directly in the editor at cursor position using WebviewEditorInset
 */

import * as vscode from "vscode";
import { AIService } from "./aiService";

// Extend vscode types to include proposed API
declare module 'vscode' {
  export interface WebviewEditorInset {
    readonly editor: vscode.TextEditor;
    readonly line: number;
    readonly height: number;
    readonly webview: vscode.Webview;
    readonly onDidDispose: vscode.Event<void>;
    dispose(): void;
  }

  export namespace window {
    export function createWebviewTextEditorInset(
      editor: vscode.TextEditor, 
      line: number, 
      height: number, 
      options?: vscode.WebviewOptions
    ): WebviewEditorInset;
  }
}

export class InlineChatProvider {
  private static instance: InlineChatProvider;
  private aiService: AIService;
  private activeSession: InlineInputSession | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  public static getInstance(
    aiService: AIService,
  ): InlineChatProvider {
    if (!InlineChatProvider.instance) {
      InlineChatProvider.instance = new InlineChatProvider(
        aiService,
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

    // Dispose any existing session
    this.dispose();

    const position = editor.selection.active;

    try {
      // Create new inline input session using WebviewEditorInset
      this.activeSession = new InlineInputSession(
        editor,
        position,
        this.aiService
      );

      await this.activeSession.start();

    } catch (error) {
      console.error('Error starting inline chat:', error);
      vscode.window.showErrorMessage('Failed to start inline chat');
    }
  }

  /**
   * Accept the current suggestion
   */
  public async acceptSuggestion(): Promise<void> {
    if (this.activeSession) {
      await this.activeSession.acceptSuggestion();
      this.dispose();
    }
  }

  /**
   * Reject the current suggestion
   */
  public async rejectSuggestion(): Promise<void> {
    if (this.activeSession) {
      this.activeSession.rejectSuggestion();
      this.dispose();
    }
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    if (this.activeSession) {
      this.activeSession.dispose();
      this.activeSession = undefined;
    }
    
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}

/**
 * Inline input session that creates a webview inset above the cursor
 */
class InlineInputSession {
  private editor: vscode.TextEditor;
  private position: vscode.Position;
  private aiService: AIService;
  private webviewInset: vscode.WebviewEditorInset | undefined;
  private diffInset: vscode.WebviewEditorInset | undefined;
  private oldDecoration: vscode.TextEditorDecorationType | undefined;
  private newDecoration: vscode.TextEditorDecorationType | undefined;
  private actionDecoration: vscode.TextEditorDecorationType | undefined;
  private disposables: vscode.Disposable[] = [];
  private isProcessing = false;
  private currentSuggestion = "";
  private oldCode: string = "";
  private newCode: string = "";

  constructor(
    editor: vscode.TextEditor,
    position: vscode.Position,
    aiService: AIService
  ) {
    this.editor = editor;
    this.position = position;
    this.aiService = aiService;
  }

  /**
   * Start the inline input session with webview inset
   */
  public async start(): Promise<void> {
    try {

      // Create webview inset for input above the current line
      this.webviewInset = (vscode.window as any).createWebviewTextEditorInset(
        this.editor,
        this.position.line - 1,
        10,
        {
          enableScripts: true,
          localResourceRoots: [],
          enableCommandUris: true,
        }
      );
      if (!this.webviewInset) {
        throw new Error('Failed to create webview inset');
      }
      this.webviewInset.webview.html = this.getInputWebviewContent();
      const messageDisposable = this.webviewInset.webview.onDidReceiveMessage(
        async (message) => {
          await this.handleWebviewMessage(message);
        }
      );
      const disposeDisposable = this.webviewInset.onDidDispose(() => {
        this.dispose();
      });
      this.disposables.push(messageDisposable, disposeDisposable);
      setTimeout(() => {
        this.webviewInset?.webview.postMessage({ type: 'focus' });
      }, 100);

    } catch (error) {
      console.error('Error creating webview inset:', error);
      // Fallback to QuickPick if webview inset is not available
      await this.fallbackToQuickPick();
    }
  }

  /**
   * Generate HTML content for the webview inset
   */
  // Webview for input (simple prompt box)
  private getInputWebviewContent(): string {
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>AI Inline Chat</title>
    <style>
      body { margin: 0; padding: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); background: var(--vscode-editor-background); color: var(--vscode-foreground); min-width: 400px; }
      .input-container { display: flex; gap: 8px; padding: 8px; }
      .input-box { flex: 1; font-size: 1em; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--vscode-widget-border); background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); }
      .send-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; padding: 2px 12px; font-size: 1em; cursor: pointer; }
      .send-btn:hover { background: var(--vscode-button-hoverBackground); }
    </style>
</head>
<body>
  <form class="input-container">
    <input class="input-box" id="userInput" type="text" placeholder="Ask AI..." autofocus />
    <button class="send-btn" id="sendBtn" type="submit">Send</button>
  </form>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const val = document.getElementById('userInput').value;
      vscode.postMessage({ type: 'userInput', text: val });
    };
    window.addEventListener('message', event => {
      if (event.data.type === 'focus') {
        document.getElementById('userInput').focus();
      }
    });
  </script>
</body>
</html>`;
  }

  // Webview for diff (old/new code, action buttons)
  private getDiffWebviewContent(oldCode: string, newCode: string): string {
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>AI Inline Diff</title>
    <style>
      body { margin: 0; padding: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); background: var(--vscode-editor-background); color: var(--vscode-foreground); min-width: 400px; }
      .diff-container { position: relative; border-radius: 8px; background: #23272e; box-shadow: 0 4px 24px rgba(0,0,0,0.18); margin-bottom: 8px; padding: 0 0 8px 0; font-family: 'JetBrains Mono', 'Fira Mono', 'Menlo', 'monospace'; }
      .diff-old { background: #3c1e1e; color: #ffebe9; border-left: 4px solid #e5534b; padding: 12px 20px; margin: 0; white-space: pre; font-size: 1em; border-radius: 0 0 8px 8px; }
      .diff-new { background: #1e3c1e; color: #e6ffed; border-left: 4px solid #34d058; padding: 12px 20px; margin: 0; white-space: pre; font-size: 1em; border-radius: 0 0 8px 8px; }
      .diff-line { font-family: inherit; line-height: 1.6; }
      .diff-action-bar { position: absolute; top: 10px; right: 16px; display: flex; gap: 8px; z-index: 10; }
      .diff-btn { background: #388bfd; border: none; border-radius: 6px; box-shadow: 0 2px 8px rgba(56,139,253,0.18); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.18s, box-shadow 0.18s; outline: none; }
      .diff-btn:hover { background: #2a7ae4; }
    </style>
</head>
<body>
  <div class="diff-container">
    <div class="diff-action-bar">
      <button class="diff-btn accept" id="acceptBtn" title="Accept (Ctrl+Y)">
        <svg width="18" height="18" viewBox="0 0 20 20"><path fill="white" d="M7.5 14.5l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4z"/></svg>
      </button>
      <button class="diff-btn discard" id="rejectBtn" title="Discard (Esc)">
        <svg width="18" height="18" viewBox="0 0 20 20"><path fill="white" d="M6.7 6.7l6.6 6.6m0-6.6l-6.6 6.6" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <pre class="diff-old diff-line" id="oldCode">${oldCode ? oldCode.replace(/</g, '&lt;') : ''}</pre>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('acceptBtn').onclick = () => vscode.postMessage({ type: 'accept' });
    document.getElementById('rejectBtn').onclick = () => vscode.postMessage({ type: 'reject' });
  </script>
</body>
</html>`;
  }

  /**
   * Handle messages from the webview
   */
  private async handleWebviewMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'userInput':
        await this.processUserInput(message.text);
        break;
      case 'accept':
        await this.acceptDiff();
        break;
      case 'reject':
        await this.rejectDiff();
        break;
      case 'cancel':
        this.dispose();
        break;
    }
  }

  /**
   * Process user input and get AI response
   */
  private async processUserInput(userInput: string): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      // Get context from the current document
      const context = this.getContext();
      const prompt = this.createPrompt(userInput, context);
      const response = await this.aiService.generateResponse(prompt);
      if (response) {
        // Save old and new code for diff
        const selection = this.editor.selection;
        if (!selection.isEmpty) {
          this.oldCode = this.editor.document.getText(selection);
        } else {
          this.oldCode = '';
        }
        // Extract code block if present
        const codeMatch = response.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        this.newCode = codeMatch ? codeMatch[1].trim() : response.trim();
        this.currentSuggestion = response;
        // Close input inset
        this.webviewInset?.dispose();
        this.webviewInset = undefined;
        // Show inline diff decorations and actions
        await this.showInlineDiff();
      } else {
        vscode.window.showWarningMessage("No response received from AI");
        this.dispose();
      }
    } catch (error) {
      console.error("Error processing user input:", error);
      vscode.window.showErrorMessage(`AI request failed: ${error}`);
      this.dispose();
    } finally {
      this.isProcessing = false;
    }
  }

  // Show diff in a webview inset with real HTML buttons and color blocks
  private async showInlineDiff(): Promise<void> {
    // Close any previous diff inset
    if (this.diffInset) {
      this.diffInset.dispose();
      this.diffInset = undefined;
    }
    // Remove any previous green decoration
    if (this.newDecoration) {
      this.editor.setDecorations(this.newDecoration, []);
      this.newDecoration.dispose();
      this.newDecoration = undefined;
    }
    // Show webview inset at the affected line (virtual line)
    const selection = this.editor.selection;
    const line = !selection.isEmpty ? selection.start.line : this.position.line;
    // Calculate the number of lines in the old code to set the inset height dynamically
    const oldCodeLines = this.oldCode ? this.oldCode.split('\n').length : 1;
    // Add a few extra lines for action bar and padding
    const insetHeight = Math.max(3, oldCodeLines + 2);
    this.diffInset = (vscode.window as any).createWebviewTextEditorInset(
      this.editor,
      line,
      insetHeight,
      {
        enableScripts: true,
        localResourceRoots: [],
        enableCommandUris: true,
      }
    );
    if (!this.diffInset) {
      throw new Error('Failed to create diff webview inset');
    }
    this.diffInset.webview.html = this.getDiffWebviewContent(this.oldCode, this.newCode);

    // Show new code as a green decoration below the inset
    const newCodeLine = line + 1;
    const decorationType = (require('vscode')).window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: '#1e3c1e',
      after: {
        contentText: '',
      },
    });
    // @ts-ignore
    this.newDecoration = decorationType;
    const newCodeLines = this.newCode.split('\n');
    const decorations = newCodeLines.map((text, idx) => ({
      range: new (require('vscode')).Range(newCodeLine + idx, 0, newCodeLine + idx, 0),
      renderOptions: {
        before: {
          contentText: text,
          color: '#e6ffed',
          fontStyle: 'normal',
          fontWeight: 'normal',
          fontFamily: 'JetBrains Mono, Fira Mono, Menlo, monospace',
        },
      },
    }));
    this.editor.setDecorations(decorationType, decorations);

    const msgDisp = this.diffInset.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'accept' || msg.type === 'reject') {
        // Remove green decoration and close inset
        // @ts-ignore
        if (this.newDecoration) {
          this.editor.setDecorations(this.newDecoration, []);
          this.newDecoration.dispose();
          this.newDecoration = undefined;
        }
        this.diffInset?.dispose();
        this.diffInset = undefined;
        if (msg.type === 'accept') {
          await this.applyNewCode();
        }
      }
    });
    const dispDisp = this.diffInset.onDidDispose(() => {
      // @ts-ignore
      if (this.newDecoration) {
        this.editor.setDecorations(this.newDecoration, []);
        this.newDecoration.dispose();
        this.newDecoration = undefined;
      }
      this.dispose();
    });
    this.disposables.push(msgDisp, dispDisp);
  }

  // Apply the new code in the editor (replace the old code with new code)
  private async applyNewCode(): Promise<void> {
    // Replace the selected range if there is a selection, otherwise use the old logic
    const selection = this.editor.selection;
    if (!selection.isEmpty) {
      await this.editor.edit((editBuilder) => {
        editBuilder.replace(selection, this.newCode);
      });
    } else {
      const edit = new (require('vscode')).WorkspaceEdit();
      const range = new (require('vscode')).Range(this.position, this.position.translate(0, this.oldCode.length));
      edit.replace(this.editor.document.uri, range, this.newCode);
      await (require('vscode')).workspace.applyEdit(edit);
    }
  }

  // Show the diff inset with accept/discard
  // (No longer needed: showDiffInset)

  // Accept: apply new code
  private async acceptDiff(): Promise<void> {
    const selection = this.editor.selection;
    if (!selection.isEmpty) {
      await this.editor.edit((editBuilder) => {
        editBuilder.replace(selection, this.newCode);
      });
    } else {
      await this.editor.edit((editBuilder) => {
        editBuilder.insert(this.position, this.newCode + '\n');
      });
    }
    vscode.window.showInformationMessage("✅ AI suggestion accepted");
    this.clearDiffDecorations();
    if (this.diffInset) {
      this.diffInset.dispose();
      this.diffInset = undefined;
    }
  }

  // Reject: revert to old code
  private async rejectDiff(): Promise<void> {
    const selection = this.editor.selection;
    if (!selection.isEmpty) {
      await this.editor.edit((editBuilder) => {
        editBuilder.replace(selection, this.oldCode);
      });
    } else {
      // If nothing was selected, just do nothing (no change)
    }
    vscode.window.showInformationMessage("❌ AI suggestion rejected");
    this.clearDiffDecorations();
    if (this.diffInset) {
      this.diffInset.dispose();
      this.diffInset = undefined;
    }
  }

  private clearDiffDecorations() {
    if (this.oldDecoration) {
      this.editor.setDecorations(this.oldDecoration, []);
      this.oldDecoration.dispose();
      this.oldDecoration = undefined;
    }
    if (this.newDecoration) {
      this.editor.setDecorations(this.newDecoration, []);
      this.newDecoration.dispose();
      this.newDecoration = undefined;
    }
    if (this.actionDecoration) {
      this.editor.setDecorations(this.actionDecoration, []);
      this.actionDecoration.dispose();
      this.actionDecoration = undefined;
    }
  }

  /**
   * Get context from the current document
   */
  private getContext(): string {
    const document = this.editor.document;
    const selection = this.editor.selection;

    if (!selection.isEmpty) {
      // Use selected text as context
      return document.getText(selection);
    } else {
      // Get surrounding context (10 lines before and after)
      const startLine = Math.max(0, this.position.line - 10);
      const endLine = Math.min(document.lineCount - 1, this.position.line + 10);
      const contextRange = new vscode.Range(
        startLine,
        0,
        endLine,
        document.lineAt(endLine).text.length
      );
      return document.getText(contextRange);
    }
  }

  /**
   * Create prompt with context
   */
  private createPrompt(userInput: string, context: string): string {
    const document = this.editor.document;
    const languageId = document.languageId;

    return `You are an AI coding assistant. The user is working in a ${languageId} file and has asked: "${userInput}"

Current code context:
\`\`\`${languageId}
${context}
\`\`\`

Please provide a helpful response. If you're suggesting code changes, provide only the code that should be inserted or replace the selected text. Keep your response concise and focused.`;
  }

  /**
   * Show AI suggestion with accept/reject options
   */
  private async showSuggestion(response: string): Promise<void> {
    this.currentSuggestion = response;

    // Check if response contains code blocks
    const codeMatch = response.match(/```(?:\w+)?\n?([\s\S]*?)```/);
    const suggestion = codeMatch ? codeMatch[1].trim() : response.trim();

    if (codeMatch && suggestion) {
      // Code suggestion - insert and highlight
      await this.insertCodeSuggestion(suggestion);
    } else {
      // Text response - show as notification or comment
      await this.insertTextResponse(response);
    }
  }

  /**
   * Insert code suggestion with highlighting
   */
  private async insertCodeSuggestion(suggestion: string): Promise<void> {
    const selection = this.editor.selection;
    let suggestionRange: vscode.Range;
    
    if (selection.isEmpty) {
      // Insert at cursor position
      await this.editor.edit((editBuilder) => {
        editBuilder.insert(this.position, suggestion);
      });

      // Calculate suggestion range
      const lines = suggestion.split('\n');
      const endLine = this.position.line + lines.length - 1;
      const endChar = lines.length === 1 
        ? this.position.character + suggestion.length
        : lines[lines.length - 1].length;
      
      suggestionRange = new vscode.Range(
        this.position,
        new vscode.Position(endLine, endChar)
      );
    } else {
      // Replace selected text
      await this.editor.edit((editBuilder) => {
        editBuilder.replace(selection, suggestion);
      });

      // Calculate suggestion range
      const lines = suggestion.split('\n');
      const endLine = selection.start.line + lines.length - 1;
      const endChar = lines.length === 1
        ? selection.start.character + suggestion.length
        : lines[lines.length - 1].length;

      suggestionRange = new vscode.Range(
        selection.start,
        new vscode.Position(endLine, endChar)
      );
    }

    // Highlight the suggestion
    const suggestionDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
      border: "1px solid",
      borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
      borderRadius: "3px",
    });

    this.editor.setDecorations(suggestionDecoration, [suggestionRange]);

    // Show accept/reject notification
    const action = await vscode.window.showInformationMessage(
      "AI code suggestion inserted",
      { modal: false },
      "✅ Accept",
      "❌ Reject"
    );

    // Clean up decoration
    this.editor.setDecorations(suggestionDecoration, []);
    suggestionDecoration.dispose();

    if (action === "✅ Accept") {
      // Move cursor to end of suggestion
      const endPosition = suggestionRange.end;
      this.editor.selection = new vscode.Selection(endPosition, endPosition);
      vscode.window.showInformationMessage("✅ AI suggestion accepted");
    } else {
      // Undo the insertion
      this.editor.edit((editBuilder) => {
        editBuilder.delete(suggestionRange);
      });
      vscode.window.showInformationMessage("❌ AI suggestion rejected");
    }
    
    this.dispose();
  }

  /**
   * Insert text response as comment
   */
  private async insertTextResponse(response: string): Promise<void> {
    const languageId = this.editor.document.languageId;
    const commentPrefix = this.getCommentPrefix(languageId);
    const indentation = this.getIndentation();

    const formattedResponse = response
      .split('\n')
      .map(line => `${indentation}${commentPrefix} ${line}`)
      .join('\n') + '\n';

    await this.editor.edit((editBuilder) => {
      editBuilder.insert(this.position, formattedResponse);
    });

    vscode.window.showInformationMessage("AI response inserted as comment");
    this.dispose();
  }

  /**
   * Get comment prefix for the current language
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
   * Get indentation for the current line
   */
  private getIndentation(): string {
    const document = this.editor.document;
    const lineText = document.lineAt(this.position.line).text;
    const match = lineText.match(/^(\s*)/);
    return match ? match[1] : "";
  }

  /**
   * Fallback to QuickPick if webview inset is not available
   */
  private async fallbackToQuickPick(): Promise<void> {
    const input = await vscode.window.showInputBox({
      prompt: "Ask AI to help with your code...",
      placeHolder: "Type your question here",
    });

    if (input?.trim()) {
      await this.processUserInput(input.trim());
    } else {
      this.dispose();
    }
  }

  /**
   * Generate a nonce for CSP
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Accept the current suggestion
   */
  public async acceptSuggestion(): Promise<void> {
    // Accept: insert/replace code
    const selection = this.editor.selection;
    let suggestion = this.currentSuggestion;
    // Extract code block if present
    const codeMatch = suggestion.match(/```(?:\w+)?\n?([\s\S]*?)```/);
    if (codeMatch) suggestion = codeMatch[1].trim();

    if (!suggestion) return;

    if (!selection.isEmpty) {
      await this.editor.edit((editBuilder) => {
        editBuilder.replace(selection, suggestion);
      });
    } else {
      await this.editor.edit((editBuilder) => {
        editBuilder.insert(this.position, suggestion + '\n');
      });
    }
    this.dispose();
  }

  public rejectSuggestion(): void {
    // Just close the webview inset
    this.dispose();
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    if (this.webviewInset) {
      this.webviewInset.dispose();
      this.webviewInset = undefined;
    }
    if (this.diffInset) {
      this.diffInset.dispose();
      this.diffInset = undefined;
    }
    this.clearDiffDecorations();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}

/**
 * Register inline completion provider for AI chat suggestions
 */
export function registerInlineCompletions(
  context: vscode.ExtensionContext,
  aiService: AIService,
) {
  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      _context: vscode.InlineCompletionContext,
      _token: vscode.CancellationToken,
    ) {
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
        const response = await aiService.generateResponse(prompt);
        const codeMatch = response.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        suggestionText = (codeMatch ? codeMatch[1] : response).trim();
      } catch (error) {
        console.error("Error getting inline completion:", error);
        return { items: [] };
      }

      if (suggestionText) {
        return {
          items: [
            {
              insertText: suggestionText,
              range: new vscode.Range(position, position),
            },
          ],
        };
      }

      return { items: [] };
    },
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      provider,
    ),
  );
}
