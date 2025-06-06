/**
 * Ollama Service for AI Code Assistant VS Code Extension
 * 
 * This service handles communication with a local Ollama AI server
 * Provides methods for generating responses using various AI models
 * 
 * @fileoverview Ollama AI service implementation
 * @author AI Code Assistant Extension
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as vscode from 'vscode';

interface OllamaMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface OllamaResponse {
    message: {
        role: string;
        content: string;
    };
    done: boolean;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

interface OllamaModelInfo {
    name: string;
    size: number;
    digest: string;
    details: {
        format: string;
        family: string;
        families: string[];
        parameter_size: string;
        quantization_level: string;
    };
    modified_at: string;
}

export class OllamaService {
    private client: AxiosInstance;
    private baseUrl: string;
    private defaultModel: string;
    private availableModels: string[] = [];
    private isConnected: boolean = false;

    constructor(baseUrl: string = 'http://localhost:11434', defaultModel: string = 'llama3.2') {
        this.baseUrl = baseUrl;
        this.defaultModel = defaultModel;
        
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 60000, // 60 seconds timeout for AI responses
            headers: {
                'Content-Type': 'application/json',
            }
        });

        // Initialize connection
        this.checkConnection();
    }

    /**
     * Check if Ollama server is running and accessible
     */
    public async checkConnection(): Promise<boolean> {
        try {
            const response = await this.client.get('/api/tags', { timeout: 5000 });
            this.isConnected = true;
            
            // Extract available models
            if (response.data && response.data.models) {
                this.availableModels = response.data.models.map((model: OllamaModelInfo) => model.name);
                console.log('[OllamaService] Available models:', this.availableModels);
            }
            
            return true;
        } catch (error) {
            this.isConnected = false;
            console.error('[OllamaService] Failed to connect to Ollama server:', error);
            return false;
        }
    }

    /**
     * Get the list of available models
     */
    public async getAvailableModels(): Promise<string[]> {
        try {
            const response = await this.client.get('/api/tags');
            if (response.data && response.data.models) {
                this.availableModels = response.data.models.map((model: OllamaModelInfo) => model.name);
                return this.availableModels;
            }
            return [];
        } catch (error) {
            console.error('[OllamaService] Error fetching models:', error);
            return [];
        }
    }

    /**
     * Generate a response using Ollama
     */
    public async generateResponse(
        prompt: string, 
        context?: string, 
        model?: string,
        systemPrompt?: string
    ): Promise<string> {
        if (!this.isConnected) {
            const connected = await this.checkConnection();
            if (!connected) {
                throw new Error('Cannot connect to Ollama server. Make sure Ollama is running on ' + this.baseUrl);
            }
        }

        const modelToUse = model || this.defaultModel;
        
        // Verify model is available
        if (this.availableModels.length > 0 && !this.availableModels.includes(modelToUse)) {
            console.warn(`[OllamaService] Model ${modelToUse} not found. Available models:`, this.availableModels);
            // Try to use the first available model as fallback
            if (this.availableModels.length > 0) {
                const fallbackModel = this.availableModels[0];
                console.log(`[OllamaService] Using fallback model: ${fallbackModel}`);
                return this.generateResponse(prompt, context, fallbackModel, systemPrompt);
            }
        }

        try {
            const messages: OllamaMessage[] = [];

            // Add system prompt if provided
            if (systemPrompt) {
                messages.push({
                    role: 'system',
                    content: systemPrompt
                });
            }

            // Add context if provided
            if (context) {
                messages.push({
                    role: 'user',
                    content: `Context:\n${context}\n\nUser Question: ${prompt}`
                });
            } else {
                messages.push({
                    role: 'user',
                    content: prompt
                });
            }

            const response: AxiosResponse<OllamaResponse> = await this.client.post('/api/chat', {
                model: modelToUse,
                messages: messages,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    top_k: 40,
                }
            });

            if (response.data && response.data.message) {
                return response.data.message.content.trim();
            } else {
                throw new Error('Invalid response format from Ollama');
            }

        } catch (error: any) {
            console.error('[OllamaService] Error generating response:', error);
            
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Cannot connect to Ollama server. Make sure Ollama is running.');
            } else if (error.response?.status === 404) {
                throw new Error(`Model "${modelToUse}" not found. Available models: ${this.availableModels.join(', ')}`);
            } else if (error.response?.data?.error) {
                throw new Error(`Ollama error: ${error.response.data.error}`);
            } else {
                throw new Error(`Failed to generate response: ${error.message}`);
            }
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
        model?: string
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
        model?: string
    ): Promise<string> {
        const systemPrompt = `You are a helpful coding assistant. Provide clear, accurate, and practical advice for programming questions. 
Include code examples when appropriate and explain concepts clearly. Use markdown formatting for better readability.`;

        return this.generateResponse(question, context, model, systemPrompt);
    }

    /**
     * Get connection status
     */
    public getConnectionStatus(): { connected: boolean; url: string; availableModels: string[] } {
        return {
            connected: this.isConnected,
            url: this.baseUrl,
            availableModels: this.availableModels
        };
    }

    /**
     * Set the default model
     */
    public setDefaultModel(model: string): void {
        if (this.availableModels.includes(model)) {
            this.defaultModel = model;
            console.log(`[OllamaService] Default model set to: ${model}`);
        } else {
            console.warn(`[OllamaService] Model ${model} not available. Available models:`, this.availableModels);
        }
    }

    /**
     * Update Ollama server URL
     */
    public updateServerUrl(url: string): void {
        this.baseUrl = url;
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json',
            }
        });
        this.checkConnection();
    }
}