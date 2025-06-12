/**
 * AI Service for AI Code Assistant VS Code Extension
 *
 * This service provides OpenAI integration for the VS Code extension
 *
 * @fileoverview AI service implementation using OpenAI
 * @author SRIDHARAN THILLAIYAPPAN
 * @version 1.0.0
 */

import * as vscode from "vscode";
import { OpenAIService } from "./openaiService";
import { AIProvider, AIServiceConfig, OpenAIMessage } from "./types";

export class AIService {
  private openaiService: OpenAIService;
  private config: AIServiceConfig;

  constructor() {
    this.config = this.loadConfiguration();
    
    const apiKey = this.config.apiKey || "";
    this.openaiService = new OpenAIService(apiKey, this.config.model);
  }

  /**
   * Load configuration from VS Code settings
   */
  private loadConfiguration(): AIServiceConfig {
    const config = vscode.workspace.getConfiguration("ai-assistant");
    
    return {
      provider: "openai",
      model: config.get<string>("model") || "gpt-3.5-turbo",
      apiKey: config.get<string>("openaiApiKey"),
    };
  }

  /**
   * Update configuration
   */
  public updateConfiguration(newConfig: Partial<AIServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.apiKey) {
      this.openaiService.updateApiKey(newConfig.apiKey);
    }
    
    if (newConfig.model) {
      this.openaiService.setDefaultModel(newConfig.model);
    }
  }

  /**
   * Check connection status
   */
  public async checkConnection(): Promise<boolean> {
    return await this.openaiService.checkConnection();
  }

  /**
   * Get available models
   */
  public async getAvailableModels(): Promise<string[]> {
    return await this.openaiService.getAvailableModels();
  }

  /**
   * Generate a response
   */
  public async generateResponse(
    prompt: string,
    context?: string,
    model?: string,
    systemPrompt?: string,
  ): Promise<string> {
    return await this.openaiService.generateResponse(prompt, context, model, systemPrompt);
  }

  /**
   * Generate a chat response with conversation history
   */
  public async generateChatResponse(
    messages: OpenAIMessage[],
    model?: string,
  ): Promise<string> {
    return await this.openaiService.generateChatResponse(messages, model);
  }

  /**
   * Analyze code
   */
  public async analyzeCode(
    code: string,
    fileName: string,
    language: string,
    userQuestion?: string,
    model?: string,
  ): Promise<string> {
    return await this.openaiService.analyzeCode(code, fileName, language, userQuestion, model);
  }

  /**
   * Get coding help
   */
  public async getCodingHelp(
    question: string,
    context?: string,
    model?: string,
  ): Promise<string> {
    return await this.openaiService.getCodingHelp(question, context, model);
  }

  /**
   * Get code completion
   */
  public async getCompletion(
    prompt: string,
    fileReferences: any[],
    model?: string,
  ): Promise<string> {
    return await this.openaiService.getCompletion(prompt, fileReferences, model);
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): {
    connected: boolean;
    provider: AIProvider;
    availableModels: string[];
  } {
    const status = this.openaiService.getConnectionStatus();
    
    return {
      connected: status.connected,
      provider: "openai",
      availableModels: status.availableModels,
    };
  }

  /**
   * Set the default model
   */
  public setDefaultModel(model: string): void {
    this.openaiService.setDefaultModel(model);
    this.config.model = model;
  }

  /**
   * Update API key
   */
  public updateApiKey(apiKey: string): Promise<boolean> {
    this.openaiService.updateApiKey(apiKey);
    this.config.apiKey = apiKey;
    return this.openaiService.checkConnection();
  }

  /**
   * Get current configuration
   */
  public getConfiguration(): AIServiceConfig {
    return { ...this.config };
  }
}
