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
  private disposables: vscode.Disposable[] = [];
  private isProcessing = false;
  private currentSuggestion = "";

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
      // Create webview inset above the current line
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

      // Set up the webview content
      this.webviewInset.webview.html = this.getWebviewContent();

      // Handle messages from the webview
      const messageDisposable = this.webviewInset.webview.onDidReceiveMessage(
        async (message) => {
          await this.handleWebviewMessage(message);
        }
      );

      // Handle inset disposal
      const disposeDisposable = this.webviewInset.onDidDispose(() => {
        this.dispose();
      });

      this.disposables.push(messageDisposable, disposeDisposable);

      // Focus the input in the webview
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
  private getWebviewContent(): string {
    const nonce = this.getNonce();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>AI Inline Chat</title>
    <style>
        body {
            margin: 20px;
            padding: 8px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
            height: 44px;
            box-sizing: border-box;
        }
        
        .chat-icon {
            color: var(--vscode-button-background);
            font-size: 16px;
            flex-shrink: 0;
        }
        
        #chatInput {
            flex: 1;
            border: none;
            background: transparent;
            color: var(--vscode-input-foreground);
            font-family: inherit;
            font-size: inherit;
            outline: none;
            padding: 0;
        }
        
        #chatInput::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        
        .send-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 12px;
            flex-shrink: 0;
        }
        
        .send-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .send-btn:disabled {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: not-allowed;
        }
        
        .processing {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="chat-icon">💬</div>
    <input type="text" id="chatInput" placeholder="Ask AI to help with your code..." />
    <button id="sendBtn" class="send-btn">Send</button>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const input = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        
        // Focus input when requested
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'focus') {
                input.focus();
            } else if (message.type === 'processing') {
                input.disabled = true;
                sendBtn.disabled = true;
                input.placeholder = 'AI is thinking...';
                input.classList.add('processing');
            } else if (message.type === 'ready') {
                input.disabled = false;
                sendBtn.disabled = false;
                input.placeholder = 'Ask AI to help with your code...';
                input.classList.remove('processing');
                input.value = '';
                input.focus();
            }
        });
        
        function sendMessage() {
            const text = input.value.trim();
            if (text && !input.disabled) {
                vscode.postMessage({
                    type: 'userInput',
                    text: text
                });
            }
        }
        
        sendBtn.addEventListener('click', sendMessage);
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            } else if (e.key === 'Escape') {
                vscode.postMessage({ type: 'cancel' });
            }
        });
        
        // Auto-focus when created
        setTimeout(() => input.focus(), 50);
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
      case 'cancel':
        this.dispose();
        break;
    }
  }

  /**
   * Process user input and get AI response
   */
  private async processUserInput(userInput: string): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Show processing state
      this.webviewInset?.webview.postMessage({ type: 'processing' });

      // Get context from the current document
      const context = this.getContext();
      
      // Create prompt with context
      const prompt = this.createPrompt(userInput, context);

      // Get AI response
      const response = await this.aiService.generateResponse(prompt);

      if (response) {
        await this.showSuggestion(response);
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
    // Implementation handled in insertCodeSuggestion
    this.dispose();
  }

  /**
   * Reject the current suggestion
   */
  public rejectSuggestion(): void {
    // Implementation handled in insertCodeSuggestion
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
