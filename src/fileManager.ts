/**
 * File Management for AI Code Assistant VS Code Extension
 * 
 * This module handles all file-related operations including reading, processing,
 * attachment management, and drag-and-drop handling.
 * 
 * @fileoverview File management and processing utilities
 * @author AI Code Assistant Extension
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileReference, FileStatistics, DEFAULT_CONFIG, SupportedLanguage } from './types';
import { FileUtils, ValidationUtils, ErrorUtils } from './utils';

/**
 * File Manager class for handling file operations
 */
export class FileManager {
    private readonly maxFileSize: number;
    private readonly maxFilesPerFolder: number;

    constructor(config = DEFAULT_CONFIG) {
        this.maxFileSize = config.maxFileSize;
        this.maxFilesPerFolder = config.maxFilesPerFolder;
    }

    /**
     * Creates a FileReference from a file path
     */
    async createFileReference(filePath: string, content?: string): Promise<FileReference> {
        try {
            const fileName = FileUtils.getFileName(filePath);
            const fileExtension = FileUtils.getFileExtension(filePath);
            const language = FileUtils.getLanguageFromExtension(fileExtension);
            
            // Use provided content or read from file
            const fileContent = content ?? await this.readFileContent(filePath);
            
            // Validate file content
            this.validateFileContent(fileContent, fileName);
            
            const stats = FileUtils.getFileStatistics(fileContent);
            
            return {
                fileName,
                filePath,
                content: fileContent,
                language,
                size: stats.fileSize,
                lineCount: stats.lineCount
            };
        } catch (error) {
            ErrorUtils.logError('FileManager.createFileReference', error);
            throw new Error(`Failed to create file reference for ${filePath}: ${ErrorUtils.createUserFriendlyError(error)}`);
        }
    }

    /**
     * Creates a FileReference from an active VS Code document
     */
    createFileReferenceFromDocument(document: vscode.TextDocument, selectedText?: string): FileReference {
        const content = selectedText || document.getText();
        const fileName = selectedText 
            ? `${path.basename(document.fileName)} (selection)`
            : path.basename(document.fileName);
        
        const stats = FileUtils.getFileStatistics(content);
        
        return {
            fileName,
            filePath: document.fileName,
            content,
            language: document.languageId as SupportedLanguage,
            size: stats.fileSize,
            lineCount: stats.lineCount
        };
    }

    /**
     * Reads file content from a URI
     */
    async readFileFromUri(uri: vscode.Uri): Promise<string> {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(content).toString('utf8');
        } catch (error) {
            ErrorUtils.logError('FileManager.readFileFromUri', error);
            throw new Error(`Failed to read file ${uri.fsPath}: ${ErrorUtils.createUserFriendlyError(error)}`);
        }
    }

    /**
     * Reads file content from a file system path
     */
    private async readFileContent(filePath: string): Promise<string> {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            ErrorUtils.logError('FileManager.readFileContent', error);
            throw new Error(`Failed to read file ${filePath}: ${ErrorUtils.createUserFriendlyError(error)}`);
        }
    }

    /**
     * Validates file content before processing
     */
    private validateFileContent(content: string, fileName: string): void {
        const fileSize = Buffer.byteLength(content, 'utf8');
        
        // Check file size
        if (!ValidationUtils.isValidFileSize(fileSize, this.maxFileSize)) {
            throw new Error(`File ${fileName} is too large (${FileUtils.formatFileSize(fileSize)}). Maximum allowed size is ${FileUtils.formatFileSize(this.maxFileSize)}.`);
        }
        
        // Check if content is binary
        if (ValidationUtils.isBinaryContent(content)) {
            throw new Error(`File ${fileName} appears to be a binary file and cannot be processed.`);
        }
    }

    /**
     * Processes a dropped URI (file or directory)
     */
    async processDroppedUri(uri: vscode.Uri): Promise<FileReference[]> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            
            if (stat.type === vscode.FileType.File) {
                const fileRef = await this.processFile(uri);
                return [fileRef];
            } else if (stat.type === vscode.FileType.Directory) {
                return await this.processDirectory(uri);
            }
            
            throw new Error(`Unsupported file type for ${uri.fsPath}`);
        } catch (error) {
            ErrorUtils.logError('FileManager.processDroppedUri', error);
            throw new Error(`Failed to process ${uri.fsPath}: ${ErrorUtils.createUserFriendlyError(error)}`);
        }
    }

    /**
     * Processes a single file
     */
    private async processFile(uri: vscode.Uri): Promise<FileReference> {
        const content = await this.readFileFromUri(uri);
        return await this.createFileReference(uri.fsPath, content);
    }

    /**
     * Processes a directory and returns files
     */
    private async processDirectory(uri: vscode.Uri): Promise<FileReference[]> {
        try {
            const files = await vscode.workspace.fs.readDirectory(uri);
            const processedFiles: FileReference[] = [];
            let processedCount = 0;
            
            for (const [fileName, fileType] of files) {
                if (processedCount >= this.maxFilesPerFolder) {
                    vscode.window.showWarningMessage(
                        `Only processed first ${this.maxFilesPerFolder} files from folder ${path.basename(uri.fsPath)}`
                    );
                    break;
                }
                
                if (fileType === vscode.FileType.File) {
                    const fileUri = vscode.Uri.joinPath(uri, fileName);
                    const fileExtension = FileUtils.getFileExtension(fileName);
                    
                    // Only process supported file types
                    if (FileUtils.isSupportedFileExtension(fileExtension)) {
                        try {
                            const fileRef = await this.processFile(fileUri);
                            processedFiles.push(fileRef);
                            processedCount++;
                        } catch (error) {
                            ErrorUtils.logError('FileManager.processDirectory', error);
                            console.warn(`Skipping file ${fileName}: ${ErrorUtils.createUserFriendlyError(error)}`);
                        }
                    }
                }
            }
            
            if (processedFiles.length === 0) {
                throw new Error(`No supported files found in folder ${path.basename(uri.fsPath)}`);
            }
            
            return processedFiles;
        } catch (error) {
            ErrorUtils.logError('FileManager.processDirectory', error);
            throw new Error(`Failed to process directory ${uri.fsPath}: ${ErrorUtils.createUserFriendlyError(error)}`);
        }
    }

    /**
     * Gets file information without reading content
     */
    async getFileInfo(uri: vscode.Uri): Promise<{ name: string; size: number; type: vscode.FileType }> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return {
                name: path.basename(uri.fsPath),
                size: stat.size,
                type: stat.type
            };
        } catch (error) {
            ErrorUtils.logError('FileManager.getFileInfo', error);
            throw new Error(`Failed to get file info for ${uri.fsPath}: ${ErrorUtils.createUserFriendlyError(error)}`);
        }
    }

    /**
     * Checks if a file is supported for processing
     */
    isSupportedFile(fileName: string): boolean {
        const extension = FileUtils.getFileExtension(fileName);
        return FileUtils.isSupportedFileExtension(extension);
    }

    /**
     * Gets the maximum file size limit
     */
    getMaxFileSize(): number {
        return this.maxFileSize;
    }

    /**
     * Gets the maximum files per folder limit
     */
    getMaxFilesPerFolder(): number {
        return this.maxFilesPerFolder;
    }
}

/**
 * File attachment manager for handling staged files
 */
export class FileAttachmentManager {
    private stagedFiles: Map<string, FileReference> = new Map();
    private readonly onChangeCallback?: () => void;

    constructor(onChangeCallback?: () => void) {
        this.onChangeCallback = onChangeCallback;
    }

    /**
     * Stages a file for later use
     */
    stageFile(fileReference: FileReference): void {
        const key = this.getFileKey(fileReference);
        this.stagedFiles.set(key, fileReference);
        this.notifyChange();
        
        vscode.window.showInformationMessage(
            `📎 File "${fileReference.fileName}" staged. Type your message and send to analyze the file.`
        );
    }

    /**
     * Stages multiple files
     */
    stageFiles(fileReferences: FileReference[]): void {
        for (const fileRef of fileReferences) {
            const key = this.getFileKey(fileRef);
            this.stagedFiles.set(key, fileRef);
        }
        this.notifyChange();
        
        if (fileReferences.length === 1) {
            this.stageFile(fileReferences[0]);
        } else {
            vscode.window.showInformationMessage(
                `📎 ${fileReferences.length} files staged. Type your message and send to analyze them.`
            );
        }
    }

    /**
     * Removes a staged file
     */
    removeStagedFile(fileReference: FileReference): void {
        const key = this.getFileKey(fileReference);
        this.stagedFiles.delete(key);
        this.notifyChange();
    }

    /**
     * Clears all staged files
     */
    clearStagedFiles(): void {
        this.stagedFiles.clear();
        this.notifyChange();
    }

    /**
     * Gets all staged files
     */
    getStagedFiles(): FileReference[] {
        return Array.from(this.stagedFiles.values());
    }

    /**
     * Gets the first staged file (for single file operations)
     */
    getFirstStagedFile(): FileReference | undefined {
        const files = this.getStagedFiles();
        return files.length > 0 ? files[0] : undefined;
    }

    /**
     * Checks if there are any staged files
     */
    hasStagedFiles(): boolean {
        return this.stagedFiles.size > 0;
    }

    /**
     * Gets the number of staged files
     */
    getStagedFileCount(): number {
        return this.stagedFiles.size;
    }

    /**
     * Consumes (gets and clears) all staged files
     */
    consumeStagedFiles(): FileReference[] {
        const files = this.getStagedFiles();
        this.clearStagedFiles();
        return files;
    }

    /**
     * Creates a unique key for a file reference
     */
    private getFileKey(fileReference: FileReference): string {
        return `${fileReference.filePath}:${fileReference.fileName}`;
    }

    /**
     * Notifies about changes if callback is provided
     */
    private notifyChange(): void {
        if (this.onChangeCallback) {
            this.onChangeCallback();
        }
    }
}