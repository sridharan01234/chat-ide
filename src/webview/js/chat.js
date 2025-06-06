/**
 * VS Code Chat Webview Script
 * Handles communication between the webview and VS Code extension for AI chat functionality
 * Supports drag-and-drop file attachments from various sources
 * 
 * @fileoverview Main script for the AI Code Assistant chat webview
 * @author AI Code Assistant Extension
 * @version 1.0.0
 */

// VS Code API instance for communication with the extension
const vscode = acquireVsCodeApi();

// Chat messages array - stores all conversation history
let messages = [];

// DOM element references (cached for performance)
let chatContainer, dropIndicator, messageInput, sendButton, attachButton;

/**
 * Initialize DOM element references
 * Called once when the page loads to cache frequently used elements
 */
function initializeDOMReferences() {
    chatContainer = document.getElementById('chatContainer');
    dropIndicator = document.getElementById('dropIndicator');
    messageInput = document.getElementById('messageInput');
    sendButton = document.getElementById('sendButton');
    attachButton = document.getElementById('attachButton');
}

/**
 * Handle dragover events to enable file dropping
 * Shows visual feedback when files are dragged over the chat area
 * 
 * @param {DragEvent} e - The dragover event
 */
function handleDragOver(e) {
    e.preventDefault(); // CRITICAL: Must prevent default to allow drop
    e.stopPropagation();
    
    showDropIndicator();
}

/**
 * Handle dragleave events to hide drop indicator when drag leaves the area
 * Only hides indicator when actually leaving the document (not just moving between elements)
 * 
 * @param {DragEvent} e - The dragleave event
 */
function handleDragLeave(e) {
    // Only hide if leaving the document entirely (coordinates will be 0,0)
    if (e.clientX === 0 && e.clientY === 0) {
        hideDropIndicator();
    }
}

/**
 * Show the drop indicator and add drag-active styling
 */
function showDropIndicator() {
    chatContainer.classList.add('drag-active');
    dropIndicator.style.display = 'block';
}

/**
 * Hide the drop indicator and remove drag-active styling
 */
function hideDropIndicator() {
    chatContainer.classList.remove('drag-active');
    dropIndicator.style.display = 'none';
}

/**
 * Handle file drop events from various sources (VS Code Explorer, Editor tabs, OS files)
 * Processes different data transfer formats and sends appropriate messages to the extension
 * 
 * @param {DragEvent} e - The drop event containing file data
 */
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[Webview] Drop event triggered');
    
    hideDropIndicator();
    
    const dataTransfer = e.dataTransfer;
    
    // Log available types for debugging
    console.log('[Webview] Available data types:', Array.from(dataTransfer.types));
    
    // Process drop data in order of preference
    if (processVSCodeUriList(dataTransfer) ||
        processResourceUrls(dataTransfer) ||
        processCodeEditors(dataTransfer) ||
        processUriList(dataTransfer) ||
        processPlainText(dataTransfer) ||
        processOSFiles(dataTransfer)) {
        return; // Successfully processed
    }
    
    // No supported data found
    handleDropFailure(dataTransfer);
}

/**
 * Process VS Code URI list format (primary method for editor tabs)
 * 
 * @param {DataTransfer} dataTransfer - The drop event's data transfer object
 * @returns {boolean} True if data was processed successfully
 */
function processVSCodeUriList(dataTransfer) {
    const data = dataTransfer.getData('application/vnd.code.uri-list');
    if (!data?.trim()) return false;
    
    console.log('[Webview] VS Code URI list found:', data);
    const uris = data.split(/[\r\n]+/).filter(uri => uri.trim());
    
    if (uris.length > 0) {
        sendMessage({
            type: 'filesDropped',
            source: 'vscode-editor-tab',
            uris: uris
        });
        return true;
    }
    return false;
}

/**
 * Process resource URLs format (alternative for editor tabs)
 * 
 * @param {DataTransfer} dataTransfer - The drop event's data transfer object
 * @returns {boolean} True if data was processed successfully
 */
function processResourceUrls(dataTransfer) {
    const data = dataTransfer.getData('resourceurls');
    if (!data?.trim()) return false;
    
    console.log('[Webview] Resource URLs found:', data);
    const uris = data.split(/[\r\n]+/).filter(uri => uri.trim());
    
    if (uris.length > 0) {
        sendMessage({
            type: 'filesDropped',
            source: 'vscode-editor-tab',
            uris: uris
        });
        return true;
    }
    return false;
}

/**
 * Process code editors format (structured data from editor tabs)
 * Handles both JSON and plain text formats
 * 
 * @param {DataTransfer} dataTransfer - The drop event's data transfer object
 * @returns {boolean} True if data was processed successfully
 */
function processCodeEditors(dataTransfer) {
    const data = dataTransfer.getData('codeeditors');
    if (!data?.trim()) return false;
    
    console.log('[Webview] Code editors data found:', data);
    
    try {
        // Try parsing as JSON
        const editorData = JSON.parse(data);
        
        if (editorData?.resource) {
            sendMessage({
                type: 'filesDropped',
                source: 'vscode-editor-tab',
                uris: [editorData.resource]
            });
            return true;
        }
        
        if (Array.isArray(editorData)) {
            const uris = editorData.map(item => item.resource).filter(Boolean);
            if (uris.length > 0) {
                sendMessage({
                    type: 'filesDropped',
                    source: 'vscode-editor-tab',
                    uris: uris
                });
                return true;
            }
        }
    } catch {
        // If not JSON, treat as plain text URI
        if (isValidFilePath(data)) {
            sendMessage({
                type: 'filesDropped',
                source: 'vscode-editor-tab',
                uris: [data]
            });
            return true;
        }
    }
    return false;
}

/**
 * Process standard URI list format (VS Code Explorer files)
 * 
 * @param {DataTransfer} dataTransfer - The drop event's data transfer object
 * @returns {boolean} True if data was processed successfully
 */
function processUriList(dataTransfer) {
    const data = dataTransfer.getData('text/uri-list');
    if (!data?.trim()) return false;
    
    console.log('[Webview] URI list found:', data);
    const uris = data.split(/[\r\n]+/).filter(uri => uri.trim());
    
    if (uris.length > 0) {
        sendMessage({
            type: 'filesDropped',
            source: 'vscode-explorer',
            uris: uris
        });
        return true;
    }
    return false;
}

/**
 * Process plain text format (fallback for various sources)
 * Distinguishes between file paths and actual text content
 * 
 * @param {DataTransfer} dataTransfer - The drop event's data transfer object
 * @returns {boolean} True if data was processed successfully
 */
function processPlainText(dataTransfer) {
    const data = dataTransfer.getData('text/plain');
    if (!data?.trim()) return false;
    
    console.log('[Webview] Plain text found:', data);
    
    if (isValidFilePath(data)) {
        sendMessage({
            type: 'filesDropped',
            source: 'vscode-editor-tab',
            uris: [data]
        });
        return true;
    } else {
        // It's just text content
        sendMessage({
            type: 'textDropped',
            text: data
        });
        return true;
    }
}

/**
 * Process OS file objects (limited support in webviews)
 * 
 * @param {DataTransfer} dataTransfer - The drop event's data transfer object
 * @returns {boolean} True if data was processed successfully
 */
function processOSFiles(dataTransfer) {
    if (dataTransfer.files.length === 0) return false;
    
    console.log('[Webview] OS files detected (limited support)');
    const filePaths = Array.from(dataTransfer.files).map(file => file.name);
    
    sendMessage({
        type: 'filesDropped',
        source: 'os-files',
        files: filePaths
    });
    return true;
}

/**
 * Handle cases where no supported drop data was found
 * Logs debugging information and notifies the extension
 * 
 * @param {DataTransfer} dataTransfer - The drop event's data transfer object
 */
function handleDropFailure(dataTransfer) {
    console.log('[Webview] No supported drop data found');
    
    // Log each type's content for debugging
    const typeInfo = Array.from(dataTransfer.types).map(type => {
        const data = dataTransfer.getData(type);
        console.log(`[Webview] Type "${type}":`, data);
        return `${type}: ${data ? data.substring(0, 50) + '...' : 'empty'}`;
    });
    
    sendMessage({
        type: 'dropFailed',
        message: `No supported files found. Available types: ${dataTransfer.types.join(', ')}`,
        debugInfo: typeInfo
    });
}

/**
 * Check if a string represents a valid file path or URI
 * 
 * @param {string} text - The text to validate
 * @returns {boolean} True if the text appears to be a file path
 */
function isValidFilePath(text) {
    return text.startsWith('file://') || text.includes('/') || text.match(/^[a-zA-Z]:\\/);
}

/**
 * Render all messages in the chat container
 * Updates the DOM with current message history and maintains scroll position
 */
function renderMessages() {
    chatContainer.innerHTML = '<div class="drop-indicator" id="dropIndicator">📁 Drop files here to attach them</div>';
    
    // Re-cache the drop indicator after innerHTML reset
    dropIndicator = document.getElementById('dropIndicator');
    
    messages.forEach(message => {
        const messageDiv = createMessageElement(message);
        chatContainer.appendChild(messageDiv);
    });
    
    // Auto-scroll to bottom to show latest message
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Create a DOM element for a single message
 * 
 * @param {Object} message - The message object to render
 * @param {string} message.sender - Either 'user' or 'assistant'
 * @param {string} message.content - The message text content
 * @param {Object} [message.fileReference] - Optional file attachment info
 * @returns {HTMLElement} The created message element
 */
function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.sender === 'user' ? 'user-message' : 'assistant-message'}`;
    
    // Add message content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = formatMessageContent(message.content);
    messageDiv.appendChild(contentDiv);
    
    // Add file attachment if present
    if (message.fileReference) {
        const fileDiv = createFileAttachmentElement(message.fileReference);
        messageDiv.appendChild(fileDiv);
    }
    
    return messageDiv;
}

/**
 * Create a DOM element for a file attachment
 * 
 * @param {Object} fileReference - The file reference object
 * @param {string} fileReference.fileName - The name of the attached file
 * @returns {HTMLElement} The created file attachment element
 */
function createFileAttachmentElement(fileReference) {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'file-attachment';
    fileDiv.innerHTML = `📎 ${fileReference.fileName}`;
    return fileDiv;
}

/**
 * Format message content with basic markdown-like styling
 * Converts **bold**, *italic*, and newlines to HTML
 * 
 * @param {string} content - Raw message content
 * @returns {string} HTML-formatted content
 */
function formatMessageContent(content) {
    return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold text
        .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic text
        .replace(/\n/g, '<br>');                           // Line breaks
}

/**
 * Send a message to the chat (user input)
 * Validates input and sends to extension for processing
 */
function sendUserMessage() {
    const message = messageInput.value.trim();
    
    if (message) {
        sendMessage({
            type: 'sendMessage',
            message: message
        });
        messageInput.value = '';
    }
}

/**
 * Send a message to the extension
 * Wrapper function for vscode.postMessage with error handling
 * 
 * @param {Object} message - The message object to send
 */
function sendMessage(message) {
    try {
        vscode.postMessage(message);
    } catch (error) {
        console.error('[Webview] Error sending message:', error);
    }
}

/**
 * Handle keyboard events in the message input
 * Sends message on Enter (without Shift) and allows multi-line with Shift+Enter
 * 
 * @param {KeyboardEvent} e - The keyboard event
 */
function handleMessageInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendUserMessage();
    }
}

/**
 * Handle attach file button click
 * Requests the extension to open file picker
 */
function handleAttachButtonClick() {
    sendMessage({ type: 'attachFile' });
}

/**
 * Listen for messages from the extension
 * Handles updates to the message list and other extension communications
 * 
 * @param {MessageEvent} event - The message event from the extension
 */
function handleExtensionMessage(event) {
    const message = event.data;
    
    switch (message.type) {
        case 'updateMessages':
            messages = message.messages;
            renderMessages();
            break;
        default:
            console.log('[Webview] Unknown message type:', message.type);
    }
}

/**
 * Initialize the chat interface
 * Sets up event listeners and renders initial state
 */
function initializeChat() {
    // Cache DOM references
    initializeDOMReferences();
    
    // Set up drag and drop event listeners
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    
    // Set up UI event listeners
    sendButton.addEventListener('click', sendUserMessage);
    attachButton.addEventListener('click', handleAttachButtonClick);
    messageInput.addEventListener('keydown', handleMessageInputKeydown);
    
    // Set up extension message listener
    window.addEventListener('message', handleExtensionMessage);
    
    // Initial render
    renderMessages();
    
    console.log('[Webview] Chat interface initialized');
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', initializeChat);