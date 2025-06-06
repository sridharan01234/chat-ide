# AI Code Assistant - Enhanced Drag & Drop Extension

A powerful VS Code extension that provides GitHub Copilot Chat-like functionality with comprehensive drag-and-drop support for seamless code interaction.

## 🚀 Features

### Enhanced Drag & Drop Capabilities
- **File Explorer Integration** - Drag files directly from VS Code's file explorer
- **External File Support** - Drop files from your operating system's file manager
- **Multi-file Selection** - Attach multiple files at once
- **Smart Content Detection** - Automatic language detection and syntax highlighting
- **Visual Feedback** - Animated drop zones and progress indicators

### Smart Context Management
- **Active File Attachment** - Quick attach currently open file
- **Selection Support** - Attach only selected code snippets
- **Smart Context Discovery** - Automatically find related files
- **File Statistics** - Line counts, language detection, and file size info

### Interactive Chat Interface
- **Real-time Messaging** - Instant AI responses with typing indicators
- **File Previews** - Embedded file content with syntax highlighting
- **Keyboard Shortcuts** - Efficient workflow with hotkeys
- **Theme Integration** - Seamless VS Code theme support

## 🎯 Installation & Setup

1. **Compile the Extension**
   ```bash
   npm run compile
   ```

2. **Open in VS Code**
   - Press `F5` to launch Extension Development Host
   - Or package with `vsce package` and install the .vsix file

3. **Activate the Extension**
   - Look for the robot icon (🤖) in the Activity Bar
   - Or use `Ctrl+Shift+A` to open the chat

## 📖 Usage Guide

### Opening the Chat
- **Activity Bar**: Click the robot icon (🤖)
- **Keyboard**: `Ctrl+Shift+A` (Windows/Linux) or `Cmd+Shift+A` (Mac)
- **Command Palette**: "Open AI Assistant"

### Drag & Drop Methods

#### 1. From File Explorer
- Drag any file from VS Code's Explorer panel directly into the chat
- Multiple files can be selected and dragged together
- Folders will show a context menu to attach all files

#### 2. From External File Manager
- Drag files from Windows Explorer, macOS Finder, or Linux file managers
- Supports files up to 1MB in size
- Automatic language detection based on file extensions

#### 3. Using Toolbar Buttons
- **📎 Attach Active File** - Add currently open file
- **📁 Browse Files** - File picker dialog
- **✂️ Attach Selection** - Add selected code only
- **🧠 Smart Context** - Auto-discover related files

### Keyboard Shortcuts
- `Ctrl+Shift+A` - Open AI Assistant
- `Ctrl+Shift+F` - Attach Active File
- `Ctrl+Shift+S` - Attach Selection (when text is selected)
- `Ctrl+Shift+M` - Attach Multiple Files
- `Ctrl+Enter` - Send message in chat

### Context Menu Integration
- **Explorer**: Right-click files/folders → "Attach to AI Chat"
- **Editor**: Right-click → "Attach Active File" or "Attach Selection"
- **Editor Tab**: Right-click tab → "Attach Active File"

## 🔧 Supported File Types

| Extension | Language | Support |
|-----------|----------|---------|
| .js, .jsx | JavaScript | ✅ Full |
| .ts, .tsx | TypeScript | ✅ Full |
| .py | Python | ✅ Full |
| .html | HTML | ✅ Full |
| .css, .scss | CSS/SCSS | ✅ Full |
| .json | JSON | ✅ Full |
| .md | Markdown | ✅ Full |
| .txt | Plain Text | ✅ Full |
| .xml, .yml | Config Files | ✅ Basic |

## 🎨 Visual Features

### Drop Zone Animation
- Appears when dragging files over the chat
- Smooth fade-in/out transitions
- Clear visual feedback for successful drops

### File Previews
- Syntax-highlighted code snippets
- File metadata (language, line count, size)
- Collapsible content for large files
- Smart truncation with "..." indicators

### Responsive Design
- Adapts to VS Code themes (dark/light)
- Auto-resizing message input
- Scrollable chat history
- Mobile-friendly touch interactions

## 🛠️ Advanced Configuration

### File Size Limits
- External files: 1MB maximum
- Internal VS Code files: No limit (handled by VS Code)
- Large files are automatically truncated in previews

### Language Detection
The extension automatically detects programming languages based on file extensions and applies appropriate syntax highlighting.

### Smart Context Discovery
When using "Smart Context", the extension analyzes:
- Import/export statements
- File references
- Project structure
- Related files in the same directory

## 🐛 Troubleshooting

### Common Issues

**Files not dropping properly:**
- Ensure files are under 1MB for external drops
- Check that the file format is supported
- Try using the toolbar buttons as an alternative

**Chat not opening:**
- Reload VS Code window (`Ctrl+R`)
- Check that the extension is activated
- Use Command Palette: "Open AI Assistant"

**Keyboard shortcuts not working:**
- Check for conflicting keybindings in VS Code settings
- Use the Command Palette as an alternative

### Debug Mode
Enable detailed logging in VS Code Developer Tools:
1. Help → Toggle Developer Tools
2. Check Console for extension logs
3. Look for messages starting with "AI Assistant:"

## 🔄 Development

### Building from Source
```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Package extension
vsce package
```

### Testing
1. Open the Extension Development Host (`F5`)
2. Create test files in the workspace
3. Test drag-and-drop from various sources
4. Verify chat functionality and file attachments

## 📝 Changelog

### v0.0.1 (Current)
- ✅ Complete drag-and-drop implementation
- ✅ Multi-source file support (Explorer, external, selection)
- ✅ Visual feedback and animations
- ✅ Comprehensive keyboard shortcuts
- ✅ Context menu integration
- ✅ Smart file detection and previews
- ✅ VS Code theme integration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

---

**Enjoy coding with your new AI assistant! 🤖✨**