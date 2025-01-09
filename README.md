# codeassicst-vscode-extension
Extension to assist programmers with different functionalities.

# CodeAssist

**CodeAssist** is a free Visual Studio Code extension that enhances your workflow with the following features:

1. **Gather Comments**  
   - Scans your entire workspace for single-line, multi-line, and other comment formats.  
   - Displays them in a beautiful webview with a search bar.

2. **Floating Notes**  
   - Opens a draggable notes panel (HTML-based) right in your editor column.  
   - Save or clear notes, which persist across sessions.  

3. **Search Logs**  
   - Searches for common logging statements (`console.log`, `logger.info`, etc.)  
   - Displays them in a webview for quick scanning.

4. **Insert Log Snippet**  
   - Quickly insert a `console.log()` snippet at your cursor.

5. **Search TODOs**  
   - Looks for “TODO” in files, opens a Quick Pick to jump directly there.

6. **Insert Try/Catch Snippet**  
   - Inserts a try/catch skeleton in your code for quick error handling.

7. **Format Document**  
   - Calls VS Code’s built-in document formatter on demand.

8. **Open Docs**  
   - Opens the official VS Code API docs in your default browser.

9. **Show Quick Tips**  
   - Displays random coding or editor tips in a VS Code message.

10. **Java Dependency Graph**  
    - (Naive) parse of `pom.xml` or `build.gradle` to show dependencies in a webview.

11. **Git Commit Suggestions**  
    - Interactive webview for common Git commands like `git add .`, `git commit`, etc.

12. **Compare Files**  
    - Prompts you to pick two files from your project, then opens a diff in VS Code.

13. **Dashboard**  
    - A fancy “CodeAssist Dashboard” in the right column with clickable pill-shaped buttons to run all the above commands.

## Installation

- Install via the [VS Code Marketplace](https://marketplace.visualstudio.com/...).  
- (Or) Download the latest `.vsix` from [Releases](https://github.com/.../releases) and install manually (`Extensions > ... > Install from VSIX`).

## Usage

- **Open the Command Palette** (`Ctrl+Shift+P` or `Cmd+Shift+P`) and search for “CodeAssist: Open Dashboard” (or any other command).
- Or **Click** the big buttons in the Dashboard (which can be opened from the command palette or [View → Command Palette → “CodeAssist: Open Dashboard”]).

## License

[MIT License](LICENSE)


