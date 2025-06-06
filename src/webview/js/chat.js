/**
 * VS Code Chat Webview Script
 * Handles communication between the webview and VS Code extension for AI chat functionality
 * Supports drag-and-drop file attachments from various sources
 *
 * @fileoverview Main script for the AI Code Assistant chat webview
 * @author SRIDHARAN THILLAIYAPPAN
 * @version 1.0.0
 */

// VS Code API instance for communication with the extension
const vscode = acquireVsCodeApi();

// Chat messages array - stores all conversation history
let messages = [];

// Staged files array - files waiting to be sent with user message
let stagedFiles = [];

// DOM element references (cached for performance)
let messagesContainer,
  messageInput,
  sendBtn,
  attachBtn,
  clearChatBtn,
  clearStagedBtn,
  stagedFilesContainer,
  stagedFilesList,
  dropZone;

/**
 * Initialize DOM element references
 * Called once when the page loads to cache frequently used elements
 */
function initializeDOMReferences() {
  messagesContainer = document.getElementById("messagesContainer");
  messageInput = document.getElementById("messageInput");
  sendBtn = document.getElementById("sendBtn");
  attachBtn = document.getElementById("attachBtn");
  clearChatBtn = document.getElementById("clearChatBtn");
  clearStagedBtn = document.getElementById("clearStagedBtn");
  stagedFilesContainer = document.getElementById("stagedFilesContainer");
  stagedFilesList = document.getElementById("stagedFilesList");
  dropZone = document.getElementById("dropZone");
}

/**
 * Handle dragover events to enable file dropping
 */
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  showDropZone();
}

/**
 * Handle dragleave events
 */
function handleDragLeave(e) {
  if (e.clientX === 0 && e.clientY === 0) {
    hideDropZone();
  }
}

/**
 * Show the drop zone
 */
function showDropZone() {
  if (dropZone) {
    dropZone.style.display = "flex";
  }
}

/**
 * Hide the drop zone
 */
function hideDropZone() {
  if (dropZone) {
    dropZone.style.display = "none";
  }
}

/**
 * Handle file drop events
 */
function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  console.log("[Webview] Drop event triggered");
  hideDropZone();

  const dataTransfer = e.dataTransfer;
  console.log(
    "[Webview] Available data types:",
    Array.from(dataTransfer.types),
  );

  // Process different data transfer formats
  if (
    processVSCodeUriList(dataTransfer) ||
    processResourceUrls(dataTransfer) ||
    processCodeEditors(dataTransfer) ||
    processUriList(dataTransfer) ||
    processPlainText(dataTransfer) ||
    processOSFiles(dataTransfer)
  ) {
    return;
  }

  handleDropFailure(dataTransfer);
}

/**
 * Process VS Code URI list format
 */
function processVSCodeUriList(dataTransfer) {
  const data = dataTransfer.getData("application/vnd.code.uri-list");
  if (!data?.trim()) return false;

  console.log("[Webview] VS Code URI list found:", data);
  const files = data.split(/[\r\n]+/).filter((uri) => uri.trim());

  if (files.length > 0) {
    sendMessage({
      type: "filesDropped", // Changed to camelCase
      files: files,
    });
    return true;
  }
  return false;
}

/**
 * Process resource URLs format
 */
function processResourceUrls(dataTransfer) {
  const data = dataTransfer.getData("resourceurls");
  if (!data?.trim()) return false;

  console.log("[Webview] Resource URLs found:", data);
  const files = data.split(/[\r\n]+/).filter((uri) => uri.trim());

  if (files.length > 0) {
    sendMessage({
      type: "filesDropped", // Changed to camelCase
      files: files,
    });
    return true;
  }
  return false;
}

/**
 * Process code editors format
 */
function processCodeEditors(dataTransfer) {
  const data = dataTransfer.getData("codeeditors");
  if (!data?.trim()) return false;

  console.log("[Webview] Code editors data found:", data);

  try {
    const editorData = JSON.parse(data);

    if (editorData?.resource) {
      sendMessage({
        type: "filesDropped", // Changed to camelCase
        files: [editorData.resource],
      });
      return true;
    }

    if (Array.isArray(editorData)) {
      const files = editorData.map((item) => item.resource).filter(Boolean);
      if (files.length > 0) {
        sendMessage({
          type: "filesDropped", // Changed to camelCase
          files: files,
        });
        return true;
      }
    }
  } catch {
    if (isValidFilePath(data)) {
      sendMessage({
        type: "filesDropped", // Changed to camelCase
        files: [data],
      });
      return true;
    }
  }
  return false;
}

/**
 * Process standard URI list format
 */
function processUriList(dataTransfer) {
  const data = dataTransfer.getData("text/uri-list");
  if (!data?.trim()) return false;

  console.log("[Webview] URI list found:", data);
  const files = data.split(/[\r\n]+/).filter((uri) => uri.trim());

  if (files.length > 0) {
    sendMessage({
      type: "filesDropped", // Changed to camelCase
      files: files,
    });
    return true;
  }
  return false;
}

/**
 * Process plain text format
 */
function processPlainText(dataTransfer) {
  const data = dataTransfer.getData("text/plain");
  if (!data?.trim()) return false;

  console.log("[Webview] Plain text found:", data);

  if (isValidFilePath(data)) {
    sendMessage({
      type: "filesDropped", // Changed to camelCase
      files: [data],
    });
    return true;
  } else {
    sendMessage({
      type: "textDropped", // Changed to camelCase
      text: data,
    });
    return true;
  }
}

/**
 * Process OS file objects
 */
function processOSFiles(dataTransfer) {
  if (dataTransfer.files.length === 0) return false;

  console.log("[Webview] OS files detected");
  const filePaths = Array.from(dataTransfer.files).map((file) => file.name);

  sendMessage({
    type: "filesDropped", // Changed to camelCase
    files: filePaths,
  });
  return true;
}

/**
 * Handle drop failure
 */
function handleDropFailure(dataTransfer) {
  console.log("[Webview] No supported drop data found");

  const typeInfo = Array.from(dataTransfer.types).map((type) => {
    const data = dataTransfer.getData(type);
    console.log(`[Webview] Type "${type}":`, data);
    return `${type}: ${data ? data.substring(0, 50) + "..." : "empty"}`;
  });

  vscode.postMessage({
    type: "DROP_FAILED",
    message: `No supported files found. Available types: ${dataTransfer.types.join(", ")}`,
    debugInfo: typeInfo,
  });
}

/**
 * Check if text is a valid file path
 */
function isValidFilePath(text) {
  return (
    text.startsWith("file://") ||
    text.includes("/") ||
    text.match(/^[a-zA-Z]:\\/)
  );
}

/**
 * Update staged files display
 */
function updateStagedFilesDisplay() {
  if (!stagedFilesContainer || !stagedFilesList) return;

  if (stagedFiles.length > 0) {
    stagedFilesContainer.style.display = "block";

    // Create more detailed file display with language detection and better styling
    stagedFilesList.innerHTML = stagedFiles
      .map((file, index) => {
        const languageIcon = getLanguageIcon(file.language || "plaintext");
        const fileExtension = getFileExtension(file.fileName);

        return `
                <div class="staged-file-item" data-index="${index}">
                    <div class="file-info-main">
                        <span class="file-icon">${languageIcon}</span>
                        <div class="file-details">
                            <span class="file-name" title="${file.filePath || file.fileName}">${file.fileName}</span>
                            <div class="file-meta">
                                <span class="file-language">${file.language || fileExtension}</span>
                                <span class="file-size">${formatFileSize(file.size || 0)}</span>
                                ${file.lineCount ? `<span class="file-lines">${file.lineCount} lines</span>` : ""}
                            </div>
                        </div>
                        <button class="remove-file-btn" onclick="removeStagedFile(${index})" title="Remove file">✕</button>
                    </div>
                    ${file.content ? `<div class="file-preview">${getFilePreview(file.content, file.language)}</div>` : ""}
                </div>
            `;
      })
      .join("");

    // Update the input placeholder to indicate files are attached
    if (messageInput) {
      const fileNames = stagedFiles.map((f) => f.fileName).join(", ");
      messageInput.placeholder = `Ask about ${fileNames}...`;
    }

    // Show success notification
    showFileAttachedNotification(stagedFiles.length);
  } else {
    stagedFilesContainer.style.display = "none";

    // Reset input placeholder
    if (messageInput) {
      messageInput.placeholder = "Ask me anything about your code...";
    }
  }
}

/**
 * Get language-specific icon
 */
function getLanguageIcon(language) {
  const icons = {
    javascript: "🟨",
    typescript: "🔷",
    python: "🐍",
    java: "☕",
    cpp: "⚙️",
    c: "⚙️",
    csharp: "🔵",
    php: "🐘",
    ruby: "💎",
    go: "🐹",
    rust: "🦀",
    swift: "🍎",
    kotlin: "🎯",
    dart: "🎯",
    vue: "💚",
    html: "🌐",
    css: "🎨",
    scss: "🎨",
    json: "📋",
    xml: "📄",
    yaml: "📝",
    markdown: "📖",
    txt: "📄",
    plaintext: "📄",
  };

  return icons[language.toLowerCase()] || "📄";
}

/**
 * Get file extension from filename
 */
function getFileExtension(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? `.${ext}` : "";
}

/**
 * Get a preview of file content
 */
function getFilePreview(content, language) {
  if (!content) return "";

  // Show first 3 lines as preview
  const lines = content.split("\n").slice(0, 3);
  const preview = lines.join("\n");
  const truncated =
    preview.length > 150 ? preview.substring(0, 147) + "..." : preview;

  return `<pre><code class="language-${language}">${escapeHtml(truncated)}</code></pre>`;
}

/**
 * Escape HTML characters
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Remove a staged file by index
 */
function removeStagedFile(index) {
  if (index >= 0 && index < stagedFiles.length) {
    stagedFiles.splice(index, 1);
    updateStagedFilesDisplay();

    // Notify extension about the change
    sendMessage({
      type: "updateStagedFiles",
      stagedFiles: stagedFiles,
    });
  }
}

/**
 * Show file attached notification
 */
function showFileAttachedNotification(count) {
  // Create or update notification
  let notification = document.getElementById("fileAttachedNotification");

  if (!notification) {
    notification = document.createElement("div");
    notification.id = "fileAttachedNotification";
    notification.className = "file-attached-notification";
    document.body.appendChild(notification);
  }

  notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">📎</span>
            <span class="notification-text">${count} file${count > 1 ? "s" : ""} attached</span>
            <button class="notification-close" onclick="hideFileAttachedNotification()">✕</button>
        </div>
    `;

  notification.style.display = "block";
  notification.classList.add("show");

  // Auto-hide after 3 seconds
  setTimeout(() => {
    hideFileAttachedNotification();
  }, 3000);
}

/**
 * Hide file attached notification
 */
function hideFileAttachedNotification() {
  const notification = document.getElementById("fileAttachedNotification");
  if (notification) {
    notification.classList.remove("show");
    setTimeout(() => {
      notification.style.display = "none";
    }, 300);
  }
}

/**
 * Render all messages
 */
function renderMessages() {
  if (!messagesContainer) return;

  // Store the welcome message before clearing
  const welcomeMessage = messagesContainer.querySelector(".welcome-message");
  let welcomeHTML = "";
  if (welcomeMessage) {
    welcomeHTML = welcomeMessage.outerHTML;
  }

  // Clear the container
  messagesContainer.innerHTML = "";

  // If there are no messages, show the welcome message
  if (messages.length === 0) {
    if (welcomeHTML) {
      messagesContainer.innerHTML = welcomeHTML;
    }
  } else {
    // Render all messages
    messages.forEach((message) => {
      const messageElement = createMessageElement(message);
      messagesContainer.appendChild(messageElement);
    });
  }

  // Auto-scroll to bottom after a short delay to ensure DOM is updated
  setTimeout(() => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, 10);
}

/**
 * Create a message element
 */
function createMessageElement(message) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${message.sender === "user" ? "user-message" : "assistant-message"}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.innerHTML = formatMessageContent(message.content);
  messageDiv.appendChild(contentDiv);

  if (message.fileReference) {
    const fileDiv = createFileAttachmentElement(message.fileReference);
    messageDiv.appendChild(fileDiv);
  }

  // Add timestamp
  const timestampDiv = document.createElement("div");
  timestampDiv.className = "message-timestamp";
  timestampDiv.textContent = new Date(message.timestamp).toLocaleTimeString();
  messageDiv.appendChild(timestampDiv);

  return messageDiv;
}

/**
 * Create file attachment element
 */
function createFileAttachmentElement(fileReference) {
  const fileDiv = document.createElement("div");
  fileDiv.className = "file-attachment";
  fileDiv.innerHTML = `📎 ${fileReference.fileName}`;
  return fileDiv;
}

/**
 * Format message content
 */
function formatMessageContent(content) {
  return content
    .replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      '<pre><code class="language-$1">$2</code></pre>',
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

/**
 * Send user message
 */
function sendUserMessage() {
  const text = messageInput.value.trim();

  if (!text) {
    return;
  }

  // Add immediate visual feedback - show the message locally first
  console.log("[Webview] Sending message:", text);

  sendMessage({
    type: "sendMessage", // Changed from 'SEND_MESSAGE' to match WebviewMessageType enum
    text: text,
  });

  messageInput.value = "";
}

/**
 * Send message to extension
 */
function sendMessage(message) {
  try {
    vscode.postMessage(message);
  } catch (error) {
    console.error("[Webview] Error sending message:", error);
  }
}

/**
 * Handle keyboard events in message input
 */
function handleMessageInputKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendUserMessage();
  }
}

/**
 * Handle attach button click
 */
function handleAttachButtonClick() {
  sendMessage({ type: "attachFile" }); // Changed from 'ATTACH_FILE'
}

/**
 * Handle clear chat button click
 */
function handleClearChatClick() {
  sendMessage({ type: "clearChat" }); // New message type for clear
}

/**
 * Handle clear staged files button click
 */
function handleClearStagedClick() {
  sendMessage({ type: "clearStagedFile" }); // Changed from 'CLEAR_STAGED_FILE'
}

/**
 * Handle messages from extension
 */
function handleExtensionMessage(event) {
  const message = event.data;

  console.log("[Webview] Received message from extension:", message.type);

  switch (message.type) {
    case "updateMessages": // Changed from 'UPDATE_MESSAGES' to camelCase
      messages = message.messages || [];
      renderMessages();
      break;

    case "updateStagedFile": // Changed from 'UPDATE_STAGED_FILE' to camelCase
      stagedFiles = message.stagedFiles || [];
      updateStagedFilesDisplay();
      break;

    case "dropFailed": // Changed from 'DROP_FAILED' to camelCase
      console.error("[Webview] Drop failed:", message.error);
      break;

    default:
      console.log("[Webview] Unknown message type:", message.type);
  }
}

/**
 * Initialize the chat interface
 */
function initializeChat() {
  console.log("[Webview] Initializing chat interface...");

  // Cache DOM references
  initializeDOMReferences();

  // Verify critical elements exist
  if (!messagesContainer || !messageInput || !sendBtn) {
    console.error("[Webview] Critical DOM elements not found");
    return;
  }

  // Set up drag and drop event listeners
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", handleDrop);

  // Set up UI event listeners
  if (sendBtn) {
    sendBtn.addEventListener("click", sendUserMessage);
  }

  if (attachBtn) {
    attachBtn.addEventListener("click", handleAttachButtonClick);
  }

  if (clearChatBtn) {
    clearChatBtn.addEventListener("click", handleClearChatClick);
  }

  if (clearStagedBtn) {
    clearStagedBtn.addEventListener("click", handleClearStagedClick);
  }

  if (messageInput) {
    messageInput.addEventListener("keydown", handleMessageInputKeydown);
  }

  // Set up extension message listener
  window.addEventListener("message", handleExtensionMessage);

  // Initial render
  renderMessages();
  updateStagedFilesDisplay();

  console.log("[Webview] Chat interface initialized successfully");
}

// Initialize when the page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeChat);
} else {
  initializeChat();
}
