import * as vscode from "vscode";
import { OllamaService } from "./ollamaService";

/**
 * Provides inline completions when user triggers AI assistance in the editor
 */
export class AIInlineCompletionProvider
  implements vscode.InlineCompletionItemProvider
{
  private ollamaService: OllamaService;

  constructor(ollamaService: OllamaService) {
    this.ollamaService = ollamaService;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<
    vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null
  > {
    // Check if the current line contains content
    const lineText = document.lineAt(position.line).text;

    if (position.character === 0 || !lineText.trim()) {
      return null;
    }

    try {
      // Get context from surrounding code
      const contextRange = this.getContextRange(document, position);
      const contextCode = document.getText(contextRange);

      // The entire line becomes the prompt
      const prompt = lineText.trim();

      // Build the full prompt with context
      const fullPrompt = this.buildPrompt(
        prompt,
        document.languageId,
        contextCode,
      );

      // Get response from the AI model
      const response = await this.ollamaService.generateResponse(fullPrompt);

      // Process the response to create inline completion
      const completionText = this.formatResponseForInlineCompletion(response);

      // Create and return inline completion item
      const range = new vscode.Range(
        position.line,
        0,
        position.line,
        lineText.length,
      );
      const item = new vscode.InlineCompletionItem(
        // Replace the entire line with just the completion (no prefix)
        `${prompt}\n${completionText}`,
        range,
      );

      return [item];
    } catch (error) {
      console.error("Error providing inline completion:", error);
      return null;
    }
  }

  private getContextRange(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Range {
    // Get a few lines before and after the current line
    const startLine = Math.max(0, position.line - 10);
    const endLine = Math.min(document.lineCount - 1, position.line + 5);

    return new vscode.Range(
      startLine,
      0,
      endLine,
      document.lineAt(endLine).text.length,
    );
  }

  private buildPrompt(
    userPrompt: string,
    languageId: string,
    contextCode: string,
  ): string {
    return `You are an AI coding assistant. The user has made a request in their code.
Current file type: ${languageId}
Current context:
\`\`\`${languageId}
${contextCode}
\`\`\`

Based on the context and user request "${userPrompt}", generate an appropriate code response. 
Provide ONLY the code without any explanations or markdown. Don't include any comments in the generated code unless specifically asked.`;
  }

  private formatResponseForInlineCompletion(response: string): string {
    // Extract code blocks if present
    const codeBlockMatch = response.match(/```(?:\w+)?\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Otherwise, return the entire response, trimmed
    return response.trim();
  }
}

/**
 * Register the inline completion provider
 */
export function registerInlineCompletionProvider(
  context: vscode.ExtensionContext,
  ollamaService: OllamaService,
) {
  const provider = new AIInlineCompletionProvider(ollamaService);

  // Register for all language types
  const registration = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    provider,
  );

  context.subscriptions.push(registration);

  return provider;
}
