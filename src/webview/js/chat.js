/**
 * VS Code Chat Webview Script - jQuery Optimized Version
 * Handles communication between the webview and VS Code extension for AI chat functionality
 * Supports drag-and-drop file attachments from various sources
 *
 * @fileoverview Main script for the AI Code Assistant chat webview (jQuery optimized)
 * @author SRIDHARAN THILLAIYAPPAN
 * @version 2.0.0
 */

// Load jQuery from CDN for VS Code webview compatibility
const jQueryScript = document.createElement("script");
jQueryScript.src = "https://code.jquery.com/jquery-3.7.1.min.js";
jQueryScript.integrity = "sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=";
jQueryScript.crossOrigin = "anonymous";
document.head.appendChild(jQueryScript);

// Wait for jQuery to load before initializing
jQueryScript.onload = function () {
  initializeChatWithJQuery();
};

function initializeChatWithJQuery() {
  // VS Code API instance for communication with the extension
  const vscode = acquireVsCodeApi();

  // Chat data
  let messages = [];
  let stagedFiles = [];

  // jQuery DOM element cache for performance
  const $elements = {};

  /**
   * Cache DOM elements using jQuery for better performance
   */
  function cacheDOMElements() {
    $elements.messagesContainer = $("#messagesContainer");
    $elements.messageInput = $("#messageInput");
    $elements.sendBtn = $("#sendBtn");
    $elements.attachBtn = $("#attachBtn");
    $elements.clearChatBtn = $("#clearChatBtn");
    $elements.clearStagedBtn = $("#clearStagedBtn");
    $elements.stagedFilesContainer = $("#stagedFilesContainer");
    $elements.stagedFilesList = $("#stagedFilesList");
    $elements.dropZone = $("#dropZone");
    $elements.body = $("body");
    $elements.document = $(document);
  }

  /**
   * Enhanced drag and drop handlers with jQuery
   */
  function setupDragAndDrop() {
    // Prevent default drag behaviors on document
    $elements.document.on("dragover dragenter", function (e) {
      e.preventDefault();
      e.stopPropagation();
      showDropZone();
    });

    $elements.document.on("dragleave", function (e) {
      // Only hide if leaving the window entirely
      if (e.originalEvent.clientX === 0 && e.originalEvent.clientY === 0) {
        hideDropZone();
      }
    });

    $elements.document.on("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      hideDropZone();
      handleDrop(e.originalEvent);
    });

    // Click to hide drop zone
    $elements.dropZone.on("click", hideDropZone);
  }

  /**
   * Setup all event listeners using jQuery's efficient event delegation
   */
  function setupEventListeners() {
    // Button click handlers
    $elements.sendBtn.on("click", sendUserMessage);
    $elements.attachBtn.on("click", handleAttachButtonClick);
    $elements.clearChatBtn.on("click", handleClearChatClick);
    $elements.clearStagedBtn.on("click", handleClearStagedClick);

    // Input handlers
    $elements.messageInput.on("keydown", handleMessageInputKeydown);

    // Auto-resize textarea
    $elements.messageInput.on("input", function () {
      autoResizeTextarea(this);
    });

    // Dynamic event delegation for staged file removal
    $elements.stagedFilesList.on("click", ".remove-file-btn", function (e) {
      e.preventDefault();
      const index = parseInt(
        $(this).closest(".staged-file-item").data("index"),
      );
      removeStagedFile(index);
    });

    // Extension message listener
    window.addEventListener("message", handleExtensionMessage);
  }

  /**
   * Auto-resize textarea based on content
   */
  function autoResizeTextarea(textarea) {
    const $textarea = $(textarea);
    const minHeight = 60;
    const maxHeight = 150;

    $textarea.css("height", "auto");
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    $textarea.css("height", newHeight + "px");
  }

  /**
   * Enhanced drop zone display with jQuery animations
   */
  function showDropZone() {
    $elements.dropZone.fadeIn(200).addClass("drag-active");
    $elements.messagesContainer.addClass("drag-active");
  }

  /**
   * Hide drop zone with smooth animation
   */
  function hideDropZone() {
    $elements.dropZone.fadeOut(200).removeClass("drag-active");
    $elements.messagesContainer.removeClass("drag-active");
  }

  /**
   * Optimized file drop handler
   */
  function handleDrop(e) {
    console.log("[Webview] Drop event triggered");

    const dataTransfer = e.dataTransfer;
    console.log(
      "[Webview] Available data types:",
      Array.from(dataTransfer.types),
    );

    // Process different data transfer formats with priority order
    const processors = [
      () => processVSCodeUriList(dataTransfer),
      () => processResourceUrls(dataTransfer),
      () => processCodeEditors(dataTransfer),
      () => processUriList(dataTransfer),
      () => processPlainText(dataTransfer),
      () => processOSFiles(dataTransfer),
    ];

    for (const processor of processors) {
      if (processor()) {
        return; // Successfully processed
      }
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
   * Enhanced staged files display with jQuery templating and animations
   */
  function updateStagedFilesDisplay() {
    if (
      !$elements.stagedFilesContainer.length ||
      !$elements.stagedFilesList.length
    )
      return;

    if (stagedFiles.length > 0) {
      // Show container with animation
      $elements.stagedFilesContainer.slideDown(300);

      // Generate file items using jQuery
      const $fileItems = stagedFiles.map((file, index) => {
        const languageIcon = getLanguageIcon(file.language || "plaintext");
        const fileExtension = getFileExtension(file.fileName);

        return $(`
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
                            <button class="remove-file-btn" title="Remove file">✕</button>
                        </div>
                        ${file.content ? `<div class="file-preview">${getFilePreview(file.content, file.language)}</div>` : ""}
                    </div>
                `)
          .hide()
          .fadeIn(400); // Add entrance animation
      });

      // Clear and populate with animation
      $elements.stagedFilesList.empty().append($fileItems);

      // Update input placeholder
      const fileNames = stagedFiles.map((f) => f.fileName).join(", ");
      $elements.messageInput.attr("placeholder", `Ask about ${fileNames}...`);

      // Show success notification
      showFileAttachedNotification(stagedFiles.length);
    } else {
      // Hide container with animation
      $elements.stagedFilesContainer.slideUp(300);
      $elements.messageInput.attr(
        "placeholder",
        "Ask me anything about your code...",
      );
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
   * Enhanced notification system with jQuery animations
   */
  function showFileAttachedNotification(count) {
    // Remove existing notification
    $("#fileAttachedNotification").remove();

    const $notification = $(`
            <div id="fileAttachedNotification" class="file-attached-notification">
                <div class="notification-content">
                    <span class="notification-icon">📎</span>
                    <span class="notification-text">${count} file${count > 1 ? "s" : ""} attached</span>
                    <button class="notification-close">✕</button>
                </div>
            </div>
        `);

    // Append to body and animate in
    $elements.body.append($notification);
    $notification.addClass("show");

    // Close button handler
    $notification
      .find(".notification-close")
      .on("click", hideFileAttachedNotification);

    // Auto-hide after 3 seconds
    setTimeout(hideFileAttachedNotification, 3000);
  }

  /**
   * Hide notification with animation
   */
  function hideFileAttachedNotification() {
    $("#fileAttachedNotification")
      .removeClass("show")
      .delay(300)
      .fadeOut(200, function () {
        $(this).remove();
      });
  }

  /**
   * Optimized message rendering with jQuery
   */
  function renderMessages() {
    if (!$elements.messagesContainer.length) return;

    // Store welcome message
    const $welcomeMessage = $elements.messagesContainer
      .find(".welcome-message")
      .detach();

    // Clear container
    $elements.messagesContainer.empty();

    if (messages.length === 0) {
      // Restore welcome message with animation
      if ($welcomeMessage.length) {
        $elements.messagesContainer.append($welcomeMessage.hide().fadeIn(300));
      }
    } else {
      // Render messages with staggered animation
      messages.forEach((message, index) => {
        const $messageElement = createMessageElement(message);
        $messageElement.css("opacity", 0).appendTo($elements.messagesContainer);

        // Staggered animation for better UX
        setTimeout(() => {
          $messageElement.animate({ opacity: 1 }, 200);
        }, index * 50);
      });
    }

    // Smooth scroll to bottom
    setTimeout(() => {
      $elements.messagesContainer.animate(
        {
          scrollTop: $elements.messagesContainer[0].scrollHeight,
        },
        300,
      );
    }, 100);
  }

  /**
   * Create message element with jQuery
   */
  function createMessageElement(message) {
    const messageClass = `message ${message.sender === "user" ? "user-message" : "assistant-message"}`;

    const $messageDiv = $(`<div class="${messageClass}"></div>`);
    const $contentDiv = $('<div class="message-content"></div>').html(
      formatMessageContent(message.content),
    );

    $messageDiv.append($contentDiv);

    if (message.fileReference) {
      const $fileDiv = $(
        `<div class="file-attachment">📎 ${message.fileReference.fileName}</div>`,
      );
      $messageDiv.append($fileDiv);
    }

    // Add timestamp
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    const $timestampDiv = $(
      `<div class="message-timestamp">${timestamp}</div>`,
    );
    $messageDiv.append($timestampDiv);

    return $messageDiv;
  }

  /**
   * Enhanced message sending with validation and feedback
   */
  function sendUserMessage() {
    const text = $elements.messageInput.val().trim();

    if (!text) {
      // Shake animation for empty input
      $elements.messageInput.addClass("shake").on("animationend", function () {
        $(this).removeClass("shake");
      });
      return;
    }

    console.log("[Webview] Sending message:", text);

    // Disable send button temporarily
    $elements.sendBtn.prop("disabled", true).text("Sending...");

    sendMessage({
      type: "sendMessage",
      text: text,
    });

    // Clear input and reset button after short delay
    $elements.messageInput.val("").css("height", "60px");
    setTimeout(() => {
      $elements.sendBtn.prop("disabled", false).text("Send");
    }, 1000);
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
   * Initialize the chat interface with jQuery optimizations
   */
  function initializeChat() {
    console.log("[Webview] Initializing jQuery-optimized chat interface...");

    // Wait for DOM to be ready
    $(document).ready(function () {
      // Cache DOM elements
      cacheDOMElements();

      // Verify critical elements exist
      if (
        !$elements.messagesContainer.length ||
        !$elements.messageInput.length ||
        !$elements.sendBtn.length
      ) {
        console.error("[Webview] Critical DOM elements not found");
        return;
      }

      // Setup all functionality
      setupDragAndDrop();
      setupEventListeners();

      // Initial render
      renderMessages();
      updateStagedFilesDisplay();

      // Add loading state management
      $elements.body.addClass("loaded");

      console.log(
        "[Webview] jQuery-optimized chat interface initialized successfully",
      );
    });
  }

  /**
   * Format file size in human-readable format
   */
  function formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Format message content with enhanced styling
   */
  function formatMessageContent(content) {
    if (!content) return "";

    // Convert markdown-style code blocks to HTML
    content = content.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      (match, lang, code) => {
        return `<div class="code-block"><pre><code class="language-${lang || "text"}">${escapeHtml(code.trim())}</code></pre></div>`;
      },
    );

    // Convert inline code
    content = content.replace(
      /`([^`]+)`/g,
      '<code class="inline-code">$1</code>',
    );

    // Convert URLs to links
    content = content.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>',
    );

    // Convert line breaks
    content = content.replace(/\n/g, "<br>");

    return content;
  }

  // Initialize everything
  initializeChat();
}
