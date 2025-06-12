# AI Code Assistant - VS Code Extension

A powerful VS Code extension powered by OpenAI that provides an intelligent chat interface with advanced drag-and-drop file attachment capabilities for seamless code analysis and developer assistance.

## ✨ Features

### 🎯 OpenAI-Powered Chat Interface

- **GPT-4 & GPT-3.5 Support** - Contextual assistance using OpenAI's latest models
- **Real-time Messaging** - Instant chat interface with message history
- **File Context Awareness** - Analyzes attached files to provide targeted insights
- **Markdown Support** - Rich text formatting in messages

### 👻 Ghost Chat (NEW!)

- **Cursor-Positioned Interface** - Floating AI chat that appears directly at your cursor
- **Diff-Style Preview** - See AI suggestions as Monaco Editor-style diff overlays
- **No Direct Application** - Review changes before accepting them
- **Keyboard-Driven Workflow** - `Ctrl+K` to start, `Tab` to accept, `Escape` to reject
- **Context-Aware Suggestions** - Automatically includes surrounding code context
- **Multi-line Support** - Handles complex code suggestions with proper formatting

### � Inline Chat with WebviewEditorInset (LATEST!)

- **True Inline Input** - Input box appears directly above your cursor using VS Code's proposed API
- **Native Integration** - Seamlessly integrated into the editor with proper theming
- **Contextual AI Assistance** - Ask questions about your code without leaving the editor
- **Smart Code Insertion** - AI responses are inserted with syntax highlighting and proper formatting
- **Accept/Reject Workflow** - Preview and choose whether to accept AI suggestions
- **Fallback Support** - Gracefully falls back to input box if WebviewEditorInset API is unavailable
- **Keyboard Navigation** - `Ctrl+I` to start, `Enter` to send, `Escape` to cancel

### �📁 Advanced File Attachment

- **Drag & Drop from VS Code Explorer** - Seamlessly drag files from the file explorer
- **Editor Tab Integration** - Drop files directly from open editor tabs
- **Multi-file Support** - Attach multiple files and folders simultaneously
- **Smart File Browser** - Built-in file picker with language-specific filters
- **Active File Quick Attach** - One-click attachment of currently open files
- **Code Selection Support** - Attach only selected code snippets

### 🔍 Code Analysis Engine

- **Multi-Language Support** - Recognizes 20+ programming languages
- **Function Detection** - Automatically identifies functions and methods
- **Class Extraction** - Finds classes, interfaces, and type definitions
- **Import Analysis** - Tracks dependencies and module imports
- **File Statistics** - Provides line counts, file sizes, and metadata

### 🎨 Enhanced User Experience

- **VS Code Theme Integration** - Seamlessly adapts to your theme
- **Visual Drop Feedback** - Clear indicators when dragging files
- **Tree View Integration** - Organized view of chat history and attached files
- **Command Palette Integration** - Quick access via Command Palette
- **Status Bar Integration** - Easy access from the status bar

## � Requirements

### For Full Feature Support (Including WebviewEditorInset Inline Chat)

- **VS Code**: Version 1.80.0 or higher
- **Proposed API Support**: For the latest inline chat feature using WebviewEditorInset
  - VS Code Insiders (recommended for latest proposed APIs)
  - Or VS Code stable with experimental features enabled

### For Basic Features

- **VS Code**: Version 1.80.0 or higher
- All features except WebviewEditorInset inline chat will work with standard VS Code installation

**Note**: The extension automatically detects API availability and gracefully falls back to compatible alternatives when proposed APIs are not available.

## �🚀 Installation

### From Source (Development)

1. **Clone and Setup**

   ```bash
   git clone <repository-url>
   cd chat-ide
   npm install
   ```

2. **Compile the Extension**

   ```bash
   npm run compile
   ```

3. **Launch Development Environment**
   - Open the project in VS Code
   - Press `F5` to launch Extension Development Host
   - The extension will be available in the new VS Code window

### Package Installation

1. **Build Package**

   ```bash
   npm install -g vsce
   vsce package
   ```

2. **Install Extension**
   - Open VS Code
   - Go to Extensions view (`Ctrl+Shift+X`)
   - Click "..." → "Install from VSIX"
   - Select the generated `.vsix` file

## 📖 Usage Guide

### Getting Started

1. **Open the AI Assistant**

   - Click the robot icon (🤖) in the Activity Bar
   - Or use Command Palette: `AI Assistant: Open Chat`

2. **Start Chatting**
   - Type your questions or requests in the input field
   - Press `Enter` to send (or `Shift+Enter` for new line)

### File Attachment Methods

#### 1. Drag & Drop from Explorer

```
VS Code Explorer → Drag file(s) → Drop into chat area
```

- Supports individual files and folders
- Automatically processes multiple files
- Shows visual feedback during drag operations

#### 2. Editor Tab Drag & Drop

```
Open Editor Tab → Drag tab → Drop into chat area
```

- Works with any open file tab
- Maintains file context and language detection

#### 3. Toolbar Buttons

- **📎** Attach current active file
- **📁** Browse and select files
- **✂️** Attach selected text (when text is selected)

#### 4. Context Menus

- **Explorer**: Right-click file → "Attach to AI Chat"
- **Editor**: Right-click → "Attach to AI Chat"

### Available Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `AI Assistant: Open Chat` | `Ctrl+Shift+A` | Open main chat interface |
| `AI Assistant: Start Inline Chat` | `Ctrl+I` (or `Cmd+I`) | Start inline chat with WebviewEditorInset |
| `AI Assistant: Start Ghost Chat` | `Ctrl+K` (or `Cmd+K`) | Start cursor-positioned AI chat |
| `AI Assistant: Accept Ghost Chat` | `Tab` | Accept AI suggestion (when active) |
| `AI Assistant: Reject Ghost Chat` | `Escape` | Reject AI suggestion (when active) |
| `AI Assistant: Attach Active File` | - | Attach currently open file |
| `AI Assistant: Browse Files` | - | Open file picker |

### Ghost Chat Usage

**Ghost Chat** is a revolutionary feature that brings AI assistance directly to your cursor position, similar to modern editors like Cursor.

#### Quick Start

1. **Position your cursor** where you want assistance
2. **Press `Ctrl+K`** (or `Cmd+K` on Mac)
3. **Type your request** (e.g., "add error handling")
4. **Press `Enter`** to send to AI
5. **Review the preview** (shown as diff-style overlay)
6. **Press `Tab` to accept** or **`Escape` to reject**

#### Example Workflow

```javascript
function fetchData(url) {
    // Place cursor here and press Ctrl+K
    // Type: "Add error handling"
    // AI will show suggestion as preview overlay
    const response = fetch(url);
    return response.json();
}
```

After typing your request and pressing Enter, you'll see a diff-style preview of the suggested changes. The preview uses VS Code's diff editor colors to clearly show what would be added or modified.

#### Ghost Chat Features

- **No Direct Changes**: See suggestions before they're applied
- **Context Aware**: Includes surrounding code for better suggestions
- **Multi-line Support**: Handles complex code transformations
- **Keyboard Driven**: Complete workflow using only keyboard
- **Visual Feedback**: Clear preview with accept/reject buttons

#### Best Practices

- **Be specific**: "Add null checks" vs "fix this"
- **Use selection**: Select code first for targeted changes
- **Review carefully**: Always check suggestions before accepting
- **Context matters**: Position cursor appropriately for best results

Access via Command Palette (`Ctrl+Shift+P`):

- `AI Assistant: Open Chat` - Open the chat interface
- `AI Assistant: Attach Active File` - Attach currently open file
- `AI Assistant: Attach Selection` - Attach selected code
- `AI Assistant: Browse Files` - Open file picker
- `AI Assistant: Clear Chat` - Clear chat history
- `AI Assistant: New Chat` - Start fresh conversation

## 🔧 Supported Languages

The extension recognizes and analyzes these programming languages:

| Language   | Extensions               | Analysis Support                      |
| ---------- | ------------------------ | ------------------------------------- |
| JavaScript | `.js`, `.jsx`            | Functions, classes, imports           |
| TypeScript | `.ts`, `.tsx`            | Functions, classes, interfaces, types |
| Python     | `.py`                    | Functions, classes, imports           |
| Java       | `.java`                  | Classes, methods, imports             |
| C/C++      | `.c`, `.cpp`             | Functions, includes                   |
| C#         | `.cs`                    | Classes, methods, using statements    |
| PHP        | `.php`                   | Functions, classes                    |
| Ruby       | `.rb`                    | Methods, classes                      |
| Go         | `.go`                    | Functions, structs, imports           |
| Rust       | `.rs`                    | Functions, structs, use statements    |
| HTML       | `.html`                  | Basic structure                       |
| CSS/SCSS   | `.css`, `.scss`, `.sass` | Rules and selectors                   |
| JSON       | `.json`                  | Structure validation                  |
| Markdown   | `.md`                    | Content analysis                      |
| YAML       | `.yaml`, `.yml`          | Structure analysis                    |

## 🎯 Key Features in Detail

### Intelligent Code Analysis

When you attach a file, the extension automatically:

1. **Detects Language** - Based on file extension and content
2. **Extracts Functions** - Identifies all function definitions
3. **Finds Classes** - Locates class and interface declarations
4. **Analyzes Imports** - Maps dependencies and modules
5. **Generates Summary** - Provides file statistics and insights

### Advanced Drag & Drop

The extension handles multiple drag sources:

- **VS Code Explorer files** - Standard file tree navigation
- **Editor tabs** - Direct from open file tabs
- **External files** - From OS file managers (limited to 1MB)
- **Folders** - Processes all contained files (up to 10 files)

### Smart Response Generation

The AI assistant provides contextual responses based on:

- **File content** - Analyzes code structure and patterns
- **User questions** - Tailors responses to specific queries
- **Code context** - Understands relationships between files
- **Best practices** - Suggests improvements and optimizations

## 🛠️ Configuration

### File Processing Limits

- **Maximum file size**: 1MB for external files
- **Folder processing**: Up to 10 files per folder
- **Supported encodings**: UTF-8 text files

### Performance Optimization

The extension is optimized for:

- **Memory efficiency** - Caches DOM elements and processes files incrementally
- **Fast response times** - Asynchronous file processing
- **Minimal resource usage** - Efficient event handling and cleanup

## 🤖 OpenAI Configuration

This extension uses OpenAI's GPT models to provide AI assistance.

### Setup Steps

1. **Get OpenAI API Key**
   - Visit [OpenAI Platform](https://platform.openai.com)
   - Create an account and generate an API key

2. **Configure Extension**
   - Method 1: Use VS Code Settings
     ```json
     {
       "ai-assistant.openaiApiKey": "sk-your-api-key-here",
       "ai-assistant.model": "gpt-3.5-turbo"
     }
     ```
   
   - Method 2: Use Command Palette
     - Open Command Palette (`Ctrl+Shift+P`)
     - Run "AI Assistant: Configure OpenAI API Key"
     - Enter your API key when prompted

### Supported Models

**OpenAI Models:**
- gpt-4, gpt-4-turbo, gpt-3.5-turbo, gpt-4o, gpt-4o-mini

### Status Indicator

Check the status bar at the bottom right of VS Code:
- `AI: OPENAI` (connected)
- `AI: OPENAI (disconnected)` (connection issue)

## 🐛 Troubleshooting

### Common Issues

#### Files Not Attaching

**Problem**: Drag and drop doesn't work
**Solutions**:

- Ensure files are under 1MB (for external files)
- Try using the file browser button instead
- Check VS Code Developer Console for errors

#### Chat Interface Not Loading

**Problem**: Webview shows error or doesn't appear
**Solutions**:

- Reload VS Code window (`Ctrl+R`)
- Check that all webview files exist in the extension
- Use Command Palette to open chat

#### Extension Not Activating

**Problem**: Robot icon doesn't appear in Activity Bar
**Solutions**:

- Ensure extension is properly compiled (`npm run compile`)
- Check for TypeScript compilation errors
- Restart VS Code

### Debug Mode

1. **Open Developer Tools**

   - Help → Toggle Developer Tools
   - Check Console tab for extension logs

2. **Enable Verbose Logging**

   - Look for messages prefixed with `[Extension]`, `[ChatProvider]`, or `[Webview]`

3. **Common Log Messages**
   ```
   [Extension] Activating AI Code Assistant...
   [ChatProvider] Processing dropped file: filename.js
   [Webview] Drop event triggered
   ```

## 🔄 Development

### Project Structure

```
src/
├── extension.ts          # Main extension entry point
├── chatProvider.ts       # Core chat and file processing logic
└── webview/
    ├── html/chat.html   # Chat interface template
    ├── css/chat.css     # Styling and themes
    └── js/chat.js       # Client-side interaction logic
```

### Building and Testing

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Compile TypeScript**

   ```bash
   npm run compile
   # Or for continuous compilation:
   npm run watch
   ```

3. **Test Extension**

   - Press `F5` in VS Code to launch Extension Development Host
   - Test all features in the new window

4. **Package Extension**
   ```bash
   vsce package
   ```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Ensure code follows existing patterns and documentation
5. Submit a pull request with detailed description

## 📚 Additional Resources

- **Technical Documentation**: See `DOCUMENTATION.md` for detailed implementation details
- **Architecture Overview**: Complete system design and component interactions
- **API Reference**: Function and class documentation
- **Troubleshooting Guide**: Extended debugging and issue resolution

## 📝 Version History

### v1.0.0 (Current)

- ✅ Complete drag-and-drop implementation
- ✅ Multi-language code analysis
- ✅ VS Code Explorer integration
- ✅ Editor tab drag support
- ✅ File browser with filters
- ✅ Code selection attachment
- ✅ Context menu integration
- ✅ Tree view for chat history
- ✅ Comprehensive documentation
- ✅ Performance optimizations

## 📄 License

This project is licensed under the MIT License. See the LICENSE file for details.

---

**Transform your coding workflow with intelligent AI assistance! 🤖✨**

_For detailed technical documentation and implementation details, see [DOCUMENTATION.md](./DOCUMENTATION.md)_
