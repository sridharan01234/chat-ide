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

    private constructor(
        ollamaService: OllamaService,
        fileManager: FileManager
    ) {
        this.ollamaService = ollamaService;
        this.fileManager = fileManager;
    }

    public static getInstance(
        ollamaService: OllamaService,
        fileManager: FileManager
    ): GhostChatProvider {
        if (!GhostChatProvider.instance) {
            GhostChatProvider.instance = new GhostChatProvider(
                ollamaService,
                fileManager
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
            vscode.window.showWarningMessage('No active editor found');
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
            this.fileManager
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
     * Manually close ghost chat
     */
    public closeGhostChat(): void {
        if (this.activeSession) {
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

class GhostChatSession {
    private editor: vscode.TextEditor;
    private ollamaService: OllamaService;
    private fileManager: FileManager;
    private originalPosition: vscode.Position;
    private suggestionText: string = '';
    private suggestionRange: vscode.Range | undefined;
    
    // Decorations for different states
    private ghostInputDecoration: vscode.TextEditorDecorationType | undefined;
    private suggestionDecoration: vscode.TextEditorDecorationType | undefined;
    private previewDecoration: vscode.TextEditorDecorationType | undefined;
    
    private disposables: vscode.Disposable[] = [];
    private isProcessing = false;
    private isActive = false;
    private currentInput = '';
    private hasActiveSuggestion = false;

    constructor(
        editor: vscode.TextEditor,
        ollamaService: OllamaService,
        fileManager: FileManager
    ) {
        this.editor = editor;
        this.ollamaService = ollamaService;
        this.fileManager = fileManager;
        this.originalPosition = editor.selection.active;
        
        this.createDecorationTypes();
    }

    /**
     * Create decoration types for different UI states
     */
    private createDecorationTypes(): void {
        // Ghost input decoration - floating input box
        this.ghostInputDecoration = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: '',
                backgroundColor: new vscode.ThemeColor('input.background'),
                border: '1px solid',
                borderColor: new vscode.ThemeColor('input.border'),
                color: new vscode.ThemeColor('input.foreground'),
                fontStyle: 'normal',
                margin: '0 0 0 4px',
                height: '20px'
            },
            isWholeLine: false,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });

        // Suggestion preview decoration - similar to inline suggestions
        this.previewDecoration = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: '',
                color: new vscode.ThemeColor('editorGhostText.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 0'
            },
            isWholeLine: false,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });

        // Active suggestion decoration - for accepted suggestions
        this.suggestionDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('diffEditor.insertedTextBorder'),
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
    }

    /**
     * Start the ghost chat session
     */
    public async start(): Promise<void> {
        this.isActive = true;
        
        // Show ghost input
        this.showGhostInput();
        
        // Set up keyboard listeners
        this.setupKeyboardListeners();
        
        // Show helpful status message
        vscode.window.setStatusBarMessage(
            '👻 Ghost Chat: Type your request, Enter to submit, Escape to cancel',
            10000
        );
    }

    /**
     * Show ghost input decoration at cursor position
     */
    private showGhostInput(): void {
        if (!this.ghostInputDecoration) return;

        const position = this.originalPosition;
        const range = new vscode.Range(position, position);
        
        // Update decoration content
        const displayText = this.currentInput || '💬 Ask AI...';
        const isPlaceholder = !this.currentInput;
        
        // Dispose old decoration and create new one with updated content
        this.ghostInputDecoration.dispose();
        this.ghostInputDecoration = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: displayText,
                backgroundColor: new vscode.ThemeColor('input.background'),
                border: '1px solid',
                borderColor: isPlaceholder 
                    ? new vscode.ThemeColor('input.border')
                    : new vscode.ThemeColor('focusBorder'),
                color: isPlaceholder 
                    ? new vscode.ThemeColor('input.placeholderForeground')
                    : new vscode.ThemeColor('input.foreground'),
                fontStyle: isPlaceholder ? 'italic' : 'normal',
                margin: '0 0 0 4px',
                width: `${Math.max(150, displayText.length * 8)}px`,
                height: '20px'
            },
            isWholeLine: false,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        
        // Apply decoration
        this.editor.setDecorations(this.ghostInputDecoration, [range]);
    }

    /**
     * Setup keyboard event listeners
     */
    private setupKeyboardListeners(): void {
        // Register custom type command handler
        const typeListener = vscode.commands.registerCommand('type', async (args) => {
            if (this.isActive && this.editor === vscode.window.activeTextEditor) {
                return await this.handleType(args);
            }
            return vscode.commands.executeCommand('default:type', args);
        });

        // Listen for escape key and other commands
        const escapeListener = vscode.commands.registerCommand('extension.ghostChat.escape', () => {
            this.dispose();
        });

        // Listen for tab/accept shortcut
        const acceptListener = vscode.commands.registerCommand('extension.ghostChat.accept', async () => {
            if (this.hasActiveSuggestion) {
                await this.acceptSuggestion();
            }
        });

        // Listen for reject shortcut
        const rejectListener = vscode.commands.registerCommand('extension.ghostChat.reject', () => {
            if (this.hasActiveSuggestion) {
                this.rejectSuggestion();
            }
        });

        this.disposables.push(typeListener, escapeListener, acceptListener, rejectListener);
    }

    /**
     * Handle typing in ghost input
     */
    private async handleType(args: { text: string }): Promise<void> {
        const text = args.text;
        
        // Handle special keys
        if (text === '\n' || text === '\r\n') {
            // Enter pressed - submit input
            await this.submitInput();
            return;
        }
        
        if (text === '\u001b') {
            // Escape pressed - close ghost chat
            this.dispose();
            return;
        }
        
        if (text === '\b' || text === '\u007f') {
            // Backspace
            this.currentInput = this.currentInput.slice(0, -1);
        } else if (text.length === 1 && text >= ' ') {
            // Regular character
            this.currentInput += text;
        }
        
        // Update display
        this.showGhostInput();
    }

    /**
     * Submit input to AI and show preview
     */
    private async submitInput(): Promise<void> {
        if (!this.currentInput.trim()) {
            this.dispose();
            return;
        }

        const userInput = this.currentInput.trim();
        this.isProcessing = true;
        
        // Clear input and show processing
        this.clearGhostInput();
        this.showProcessingIndicator();

        try {
            // Get context
            const context = this.getContext();
            
            // Create enhanced prompt
            const prompt = this.createPrompt(userInput, context);
            
            // Get AI response
            const response = await this.ollamaService.generateResponse(prompt);
            
            // Process response
            await this.processAIResponse(response, userInput);
            
        } catch (error) {
            console.error('[GhostChat] Error:', error);
            ErrorUtils.logError('GhostChat.submitInput', error);
            vscode.window.showErrorMessage(
                `Ghost Chat Error: ${ErrorUtils.createUserFriendlyError(error)}`
            );
            this.dispose();
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Get context from current editor
     */
    private getContext(): string {
        const document = this.editor.document;
        const selection = this.editor.selection;
        
        if (!selection.isEmpty) {
            return document.getText(selection);
        }
        
        // Get surrounding context
        const startLine = Math.max(0, this.originalPosition.line - 5);
        const endLine = Math.min(document.lineCount - 1, this.originalPosition.line + 5);
        const contextRange = new vscode.Range(
            startLine, 0,
            endLine, document.lineAt(endLine).text.length
        );
        
        return document.getText(contextRange);
    }

    /**
     * Create AI prompt with context
     */
    private createPrompt(userInput: string, context: string): string {
        const document = this.editor.document;
        const languageId = document.languageId;
        
        return `You are an AI coding assistant. The user is working in a ${languageId} file and has requested: "${userInput}"

Current code context around cursor:
\`\`\`${languageId}
${context}
\`\`\`

Provide ONLY the code that should be inserted at the cursor position. Do not include explanations, markdown formatting, or code blocks. Just return the raw code to insert.`;
    }

    /**
     * Process AI response and show preview
     */
    private async processAIResponse(response: string, originalInput: string): Promise<void> {
        // Clean up response
        const suggestion = this.cleanAIResponse(response);
        
        if (!suggestion.trim()) {
            vscode.window.showInformationMessage(`AI: ${response}`);
            this.dispose();
            return;
        }
        
        // Show suggestion as preview (not applied yet)
        this.showSuggestionPreview(suggestion);
        
        // Show accept/reject options
        this.showAcceptRejectOptions(originalInput);
    }

    /**
     * Clean AI response to extract only code
     */
    private cleanAIResponse(response: string): string {
        // Remove code block markers if present
        const codeBlockMatch = response.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }
        
        // Return cleaned response
        return response.trim();
    }

    /**
     * Show suggestion as preview without applying it
     */
    private showSuggestionPreview(suggestion: string): void {
        if (!this.previewDecoration) return;
        
        this.suggestionText = suggestion;
        this.hasActiveSuggestion = true;
        
        const position = this.originalPosition;
        const range = new vscode.Range(position, position);
        
        // Show preview text
        this.previewDecoration.dispose();
        this.previewDecoration = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: suggestion.split('\n')[0] + (suggestion.includes('\n') ? '...' : ''),
                color: new vscode.ThemeColor('editorGhostText.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 0',
                textDecoration: 'none'
            },
            isWholeLine: false,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        
        this.editor.setDecorations(this.previewDecoration, [range]);
    }

    /**
     * Show accept/reject options
     */
    private showAcceptRejectOptions(originalInput: string): void {
        // Update status bar with instructions
        vscode.window.setStatusBarMessage(
            '👻 Preview shown → Tab: Accept | Escape: Reject | Ctrl+Enter: Regenerate',
            15000
        );
        
        // Show notification with options
        vscode.window.showInformationMessage(
            `AI suggestion for "${originalInput}"`,
            'Accept (Tab)', 'Reject (Esc)', 'Regenerate'
        ).then(async (choice) => {
            switch (choice) {
                case 'Accept (Tab)':
                    await this.acceptSuggestion();
                    break;
                case 'Reject (Esc)':
                    this.rejectSuggestion();
                    break;
                case 'Regenerate':
                    this.rejectSuggestion();
                    // Restart with same input
                    this.currentInput = originalInput;
                    this.hasActiveSuggestion = false;
                    await this.submitInput();
                    break;
                default:
                    // Auto-reject after timeout
                    setTimeout(() => {
                        if (this.hasActiveSuggestion) {
                            this.rejectSuggestion();
                        }
                    }, 30000);
            }
        });
    }

    /**
     * Accept the suggestion and apply it
     */
    public async acceptSuggestion(): Promise<void> {
        if (!this.hasActiveSuggestion || !this.suggestionText) {
            return;
        }
        
        // Clear preview
        this.clearPreviews();
        
        // Apply the suggestion
        const selection = this.editor.selection;
        const position = selection.isEmpty ? this.originalPosition : selection.start;
        
        await this.editor.edit(editBuilder => {
            if (selection.isEmpty) {
                editBuilder.insert(position, this.suggestionText);
            } else {
                editBuilder.replace(selection, this.suggestionText);
            }
        });
        
        // Calculate new range and highlight
        const lines = this.suggestionText.split('\n');
        const endLine = position.line + lines.length - 1;
        const endChar = lines.length === 1 
            ? position.character + this.suggestionText.length 
            : lines[lines.length - 1].length;
        const endPosition = new vscode.Position(endLine, endChar);
        this.suggestionRange = new vscode.Range(position, endPosition);
        
        // Highlight applied suggestion briefly
        if (this.suggestionDecoration && this.suggestionRange) {
            this.editor.setDecorations(this.suggestionDecoration, [this.suggestionRange]);
            
            // Remove highlight after 2 seconds
            setTimeout(() => {
                if (this.suggestionDecoration) {
                    this.editor.setDecorations(this.suggestionDecoration, []);
                }
            }, 2000);
        }
        
        // Move cursor to end
        this.editor.selection = new vscode.Selection(endPosition, endPosition);
        
        vscode.window.showInformationMessage('✅ AI suggestion accepted');
        this.dispose();
    }

    /**
     * Reject the suggestion
     */
    public rejectSuggestion(): void {
        if (!this.hasActiveSuggestion) {
            return;
        }
        
        this.clearPreviews();
        vscode.window.showInformationMessage('❌ AI suggestion rejected');
        this.dispose();
    }

    /**
     * Show processing indicator
     */
    private showProcessingIndicator(): void {
        if (!this.ghostInputDecoration) return;
        
        const position = this.originalPosition;
        const range = new vscode.Range(position, position);
        
        this.ghostInputDecoration.dispose();
        this.ghostInputDecoration = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: '⏳ AI is thinking...',
                color: new vscode.ThemeColor('descriptionForeground'),
                fontStyle: 'italic',
                margin: '0 0 0 4px'
            }
        });
        
        this.editor.setDecorations(this.ghostInputDecoration, [range]);
    }

    /**
     * Clear ghost input decoration
     */
    private clearGhostInput(): void {
        if (this.ghostInputDecoration) {
            this.editor.setDecorations(this.ghostInputDecoration, []);
        }
    }

    /**
     * Clear all preview decorations
     */
    private clearPreviews(): void {
        if (this.previewDecoration) {
            this.editor.setDecorations(this.previewDecoration, []);
        }
        if (this.ghostInputDecoration) {
            this.editor.setDecorations(this.ghostInputDecoration, []);
        }
    }

    /**
     * Dispose all resources
     */
    public dispose(): void {
        this.isActive = false;
        this.hasActiveSuggestion = false;
        
        // Clear decorations
        this.clearPreviews();
        if (this.suggestionDecoration) {
            this.editor.setDecorations(this.suggestionDecoration, []);
        }
        
        // Dispose decoration types
        [this.ghostInputDecoration, this.previewDecoration, this.suggestionDecoration]
            .forEach(decoration => decoration?.dispose());
        
        // Dispose other resources
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        
        // Clear status
        vscode.window.setStatusBarMessage('');
    }
}
