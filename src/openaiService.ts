/**
 * OpenAI Service for AI Code Assistant VS Code Extension
 *
 * This service handles communication with OpenAI API
 * Provides methods for generating responses using OpenAI models
 *
 * @fileoverview OpenAI API service implementation
 * @author SRIDHARAN THILLAIYAPPAN
 * @version 1.0.0
 */

import OpenAI from "openai";
import * as vscode from "vscode";
import { OpenAIMessage, OpenAIResponse } from "./types";

export class OpenAIService {
  private client: OpenAI;
  private defaultModel: string;
  private isConnected: boolean = false;
  private availableModels: string[] = [
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "gpt-4o",
    "gpt-4o-mini"
  ];

  constructor(
    apiKey: string,
    defaultModel: string = "gpt-3.5-turbo",
  ) {
    this.defaultModel = defaultModel;

    this.client = new OpenAI({
      apiKey: apiKey,
    });

    // Initialize connection
    this.checkConnection();
  }

  /**
   * Check if OpenAI API is accessible
   */
  public async checkConnection(): Promise<boolean> {
    try {
      // Test with a simple request
      await this.client.models.list();
      this.isConnected = true;
      console.log("[OpenAIService] Successfully connected to OpenAI API");
      return true;
    } catch (error) {
      this.isConnected = false;
      console.error("[OpenAIService] Failed to connect to OpenAI API:", error);
      return false;
    }
  }

  /**
   * Get the list of available models
   */
  public async getAvailableModels(): Promise<string[]> {
    try {
      const models = await this.client.models.list();
      const modelNames = models.data
        .filter(model => model.id.startsWith('gpt'))
        .map(model => model.id)
        .sort();
      
      if (modelNames.length > 0) {
        this.availableModels = modelNames;
      }
      
      return this.availableModels;
    } catch (error) {
      console.error("[OpenAIService] Error fetching models:", error);
      return this.availableModels; // Return default models if API fails
    }
  }

  /**
   * Validates connection and model before making API calls
   */
  private async validateConnection(model?: string): Promise<string> {
    if (!this.isConnected) {
      const connected = await this.checkConnection();
      if (!connected) {
        throw new Error(
          "Cannot connect to OpenAI API. Please check your API key and internet connection."
        );
      }
    }

    const modelToUse = model || this.defaultModel;

    // For OpenAI, we'll trust the model name as the API will validate it
    return modelToUse;
  }

  /**
   * Common error handling for OpenAI API responses
   */
  private handleOpenAIError(error: any, modelToUse: string): never {
    console.error("[OpenAIService] Error generating response:", error);

    if (error.code === "invalid_api_key") {
      throw new Error("Invalid OpenAI API key. Please check your configuration.");
    } else if (error.code === "model_not_found") {
      throw new Error(
        `Model "${modelToUse}" not found. Please check the model name.`
      );
    } else if (error.code === "insufficient_quota") {
      throw new Error("OpenAI API quota exceeded. Please check your billing.");
    } else if (error.status === 429) {
      throw new Error("OpenAI API rate limit exceeded. Please try again later.");
    } else if (error.message) {
      throw new Error(`OpenAI API error: ${error.message}`);
    } else {
      throw new Error(`Failed to generate response: ${error}`);
    }
  }

  /**
   * Makes the actual API call to OpenAI
   */
  private async makeOpenAIRequest(
    modelToUse: string,
    messages: OpenAIMessage[],
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: modelToUse,
      messages: messages,
      max_completion_tokens: 4000,
    });

    if (response.choices && response.choices[0] && response.choices[0].message) {
      return response.choices[0].message.content?.trim() || "";
    } else {
      throw new Error("Invalid response format from OpenAI");
    }
  }

  /**
   * Generate a response using OpenAI
   */
  public async generateResponse(
    prompt: string,
    context?: string,
    model?: string,
    systemPrompt?: string,
  ): Promise<string> {
    const modelToUse = await this.validateConnection(model);

    try {
      const messages: OpenAIMessage[] = [];

      // Add system prompt if provided
      if (systemPrompt) {
        messages.push({
          role: "system",
          content: systemPrompt,
        });
      }

      // Add context if provided
      if (context) {
        messages.push({
          role: "user",
          content: `Context:\n${context}\n\nUser Question: ${prompt}`,
        });
      } else {
        messages.push({
          role: "user",
          content: prompt,
        });
      }

      return await this.makeOpenAIRequest(modelToUse, messages);
    } catch (error: any) {
      this.handleOpenAIError(error, modelToUse);
    }
  }

  /**
   * Generate a response using OpenAI with conversation history
   */
  public async generateChatResponse(
    messages: OpenAIMessage[],
    model?: string,
  ): Promise<string> {
    const modelToUse = await this.validateConnection(model);

    try {
      return await this.makeOpenAIRequest(modelToUse, messages);
    } catch (error: any) {
      this.handleOpenAIError(error, modelToUse);
    }
  }

  /**
   * Generate a code analysis response
   */
  public async analyzeCode(
    code: string,
    fileName: string,
    language: string,
    userQuestion?: string,
    model?: string,
  ): Promise<string> {
    const systemPrompt = `You are an expert code assistant. Analyze the provided code and provide helpful insights including:
- Code structure and organization
- Potential improvements or optimizations
- Bug detection and security issues
- Best practices and conventions
- Documentation suggestions

Be concise but thorough in your analysis. Use markdown formatting for better readability.`;

    let prompt = `Please analyze this ${language} code from file "${fileName}":\n\n\`\`\`${language}\n${code}\n\`\`\``;

    if (userQuestion) {
      prompt += `\n\nSpecific question: ${userQuestion}`;
    }

    return this.generateResponse(prompt, undefined, model, systemPrompt);
  }

  /**
   * Generate a general coding assistance response
   */
  public async getCodingHelp(
    question: string,
    context?: string,
    model?: string,
  ): Promise<string> {
    const systemPrompt = `You are a helpful coding assistant. Provide clear, accurate, and practical advice for programming questions. 
Include code examples when appropriate and explain concepts clearly. Use markdown formatting for better readability.`;

    return this.generateResponse(question, context, model, systemPrompt);
  }

  /**
   * Get code completion (for inline and panel completions)
   */
  public async getCompletion(
    prompt: string,
    fileReferences: any[],
    model?: string,
  ): Promise<string> {
    // Build context from file references
    let context = "";
    if (fileReferences && fileReferences.length > 0) {
      context = fileReferences
        .map((ref) => {
          const content = ref.selectedText || ref.content;
          return `File: ${ref.fileName}\n\`\`\`${ref.language}\n${content}\n\`\`\``;
        })
        .join("\n\n");
    }

    const systemPrompt = `You are an AI coding assistant. Provide concise, accurate, and helpful code completions or answers to programming questions.
Focus on writing clean, efficient, and well-documented code. When providing code snippets, ensure they are properly formatted and ready to use.`;

    return this.generateResponse(prompt, context, model, systemPrompt);
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): {
    connected: boolean;
    provider: string;
    availableModels: string[];
  } {
    return {
      connected: this.isConnected,
      provider: "OpenAI",
      availableModels: this.availableModels,
    };
  }

  /**
   * Set the default model
   */
  public setDefaultModel(model: string): void {
    this.defaultModel = model;
    console.log(`[OpenAIService] Default model set to: ${model}`);
  }

  /**
   * Update API key
   */
  public updateApiKey(apiKey: string): void {
    this.client = new OpenAI({
      apiKey: apiKey,
    });
    this.checkConnection();
  }
}
