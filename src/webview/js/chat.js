const vscode = acquireVsCodeApi();
let messages = [];

// VS Code specific drag and drop handling
document.addEventListener('dragover', function(e) {
    e.preventDefault(); // CRITICAL: Must prevent default to allow drop
    e.stopPropagation();
    
    const container = document.getElementById('chatContainer');
    const indicator = document.getElementById('dropIndicator');
    
    container.classList.add('drag-active');
    indicator.style.display = 'block';
});

document.addEventListener('dragleave', function(e) {
    // Only hide if leaving the document entirely
    if (e.clientX === 0 && e.clientY === 0) {
        const container = document.getElementById('chatContainer');
        const indicator = document.getElementById('dropIndicator');
        
        container.classList.remove('drag-active');
        indicator.style.display = 'none';
    }
});

document.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[Webview] Drop event triggered');
    
    const container = document.getElementById('chatContainer');
    const indicator = document.getElementById('dropIndicator');
    
    container.classList.remove('drag-active');
    indicator.style.display = 'none';
    
    // VS Code specific: Extract data using proper MIME types
    const dataTransfer = e.dataTransfer;
    
    // Log all available types for debugging
    console.log('[Webview] DataTransfer types:', dataTransfer.types);
    console.log('[Webview] DataTransfer items count:', dataTransfer.items.length);
    console.log('[Webview] DataTransfer files count:', dataTransfer.files.length);
    
    // Try all possible data extraction methods
    let foundData = false;
    
    // Method 1: Try application/vnd.code.uri-list (Editor tabs use this)
    const vscodeUriList = dataTransfer.getData('application/vnd.code.uri-list');
    if (vscodeUriList && vscodeUriList.trim()) {
        console.log('[Webview] VS Code URI list found:', vscodeUriList);
        const uris = vscodeUriList.split(/[\r\n]+/).filter(uri => uri.trim());
        if (uris.length > 0) {
            vscode.postMessage({
                type: 'filesDropped',
                source: 'vscode-editor-tab',
                uris: uris
            });
            foundData = true;
        }
    }
    
    // Method 2: Try resourceurls (Editor tabs)
    if (!foundData) {
        const resourceUrls = dataTransfer.getData('resourceurls');
        if (resourceUrls && resourceUrls.trim()) {
            console.log('[Webview] Resource URLs found:', resourceUrls);
            const uris = resourceUrls.split(/[\r\n]+/).filter(uri => uri.trim());
            if (uris.length > 0) {
                vscode.postMessage({
                    type: 'filesDropped',
                    source: 'vscode-editor-tab',
                    uris: uris
                });
                foundData = true;
            }
        }
    }
    
    // Method 3: Try codeeditors (Editor tabs)
    if (!foundData) {
        const codeEditors = dataTransfer.getData('codeeditors');
        if (codeEditors && codeEditors.trim()) {
            console.log('[Webview] Code editors data found:', codeEditors);
            try {
                // Try to parse as JSON in case it contains structured data
                const editorData = JSON.parse(codeEditors);
                if (editorData && editorData.resource) {
                    vscode.postMessage({
                        type: 'filesDropped',
                        source: 'vscode-editor-tab',
                        uris: [editorData.resource]
                    });
                    foundData = true;
                } else if (Array.isArray(editorData)) {
                    const uris = editorData.map(item => item.resource).filter(Boolean);
                    if (uris.length > 0) {
                        vscode.postMessage({
                            type: 'filesDropped',
                            source: 'vscode-editor-tab',
                            uris: uris
                        });
                        foundData = true;
                    }
                }
            } catch {
                // If not JSON, treat as plain text URI
                if (codeEditors.startsWith('file://') || codeEditors.includes('/')) {
                    vscode.postMessage({
                        type: 'filesDropped',
                        source: 'vscode-editor-tab',
                        uris: [codeEditors]
                    });
                    foundData = true;
                }
            }
        }
    }
    
    // Method 4: Try text/uri-list (VS Code Explorer files)
    if (!foundData) {
        const uriList = dataTransfer.getData('text/uri-list');
        if (uriList && uriList.trim()) {
            console.log('[Webview] URI list found:', uriList);
            const uris = uriList.split(/[\r\n]+/).filter(uri => uri.trim());
            if (uris.length > 0) {
                vscode.postMessage({
                    type: 'filesDropped',
                    source: 'vscode-explorer',
                    uris: uris
                });
                foundData = true;
            }
        }
    }
    
    // Method 5: Try text/plain (Sometimes used as fallback)
    if (!foundData) {
        const plainText = dataTransfer.getData('text/plain');
        if (plainText && plainText.trim()) {
            console.log('[Webview] Plain text found:', plainText);
            
            // Check if it's a file URI or path
            if (plainText.startsWith('file://') || plainText.includes('/')) {
                vscode.postMessage({
                    type: 'filesDropped',
                    source: 'vscode-editor-tab',
                    uris: [plainText]
                });
                foundData = true;
            } else {
                // It's just text content
                vscode.postMessage({
                    type: 'textDropped',
                    text: plainText
                });
                foundData = true;
            }
        }
    }
    
    // Method 6: Check for actual File objects (OS drops - limited in webviews)
    if (!foundData && dataTransfer.files.length > 0) {
        console.log('[Webview] OS files detected (limited support)');
        const filePaths = Array.from(dataTransfer.files).map(file => file.name);
        vscode.postMessage({
            type: 'filesDropped',
            source: 'os-files',
            files: filePaths
        });
        foundData = true;
    }
    
    if (!foundData) {
        console.log('[Webview] No supported drop data found');
        console.log('[Webview] Available types:', Array.from(dataTransfer.types));
        
        // Log each type's content for debugging
        for (const type of dataTransfer.types) {
            const data = dataTransfer.getData(type);
            console.log('[Webview] Type "' + type + '":', data);
        }
        
        vscode.postMessage({
            type: 'dropFailed',
            message: 'No supported files found. Available types: ' + Array.from(dataTransfer.types).join(', ')
        });
    }
});

function renderMessages() {
    const container = document.getElementById('chatContainer');
    container.innerHTML = '<div class="drop-indicator" id="dropIndicator">📁 Drop files here to attach them</div>';
    
    messages.forEach(message => {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + (message.sender === 'user' ? 'user-message' : 'assistant-message');
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = formatMessageContent(message.content);
        messageDiv.appendChild(contentDiv);
        
        if (message.fileReference) {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'file-attachment';
            fileDiv.innerHTML = '📎 ' + message.fileReference.fileName;
            messageDiv.appendChild(fileDiv);
        }
        
        container.appendChild(messageDiv);
    });
    
    container.scrollTop = container.scrollHeight;
}

function formatMessageContent(content) {
    return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (message) {
        vscode.postMessage({
            type: 'sendMessage',
            message: message
        });
        input.value = '';
    }
}

// Event listeners
document.getElementById('sendButton').addEventListener('click', sendMessage);
document.getElementById('attachButton').addEventListener('click', () => {
    vscode.postMessage({ type: 'attachFile' });
});

document.getElementById('messageInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Listen for messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'updateMessages':
            messages = message.messages;
            renderMessages();
            break;
    }
});

// Initial render
renderMessages();