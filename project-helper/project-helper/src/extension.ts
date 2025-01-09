import * as vscode from "vscode";
import * as path from "path";
import { exec } from "child_process";  // For Git suggestions

/**
 * Represents a simple comment object with the file it belongs to
 * and the actual comment text.
 */
interface ProjectComment {
  file: string;
  comment: string;
}

/**
 * Represents a log statement found by the search logs feature.
 */
interface ProjectLog {
  file: string;
  log: string;
}

/**
 * Represents the note object we store/retrieve from globalState.
 */
interface NoteData {
  content: string;
}

/**
 * Represents a Java dependency object (naive representation).
 */
interface JavaDependency {
  groupId: string;
  artifactId: string;
  version: string;
  notation?: string; // e.g., "com.example:my-lib:1.2.3"
}

export function activate(context: vscode.ExtensionContext): void {
  // 1) Gather Comments
  const gatherCommentsCommand = vscode.commands.registerCommand(
    "projectHelper.gatherComments",
    async () => {
      try {
        const files = await vscode.workspace.findFiles(
          "**/*.{js,ts,jsx,tsx,java,py,html,css,cpp,c,cs,php,rb,go}",
          "**/node_modules/**"
        );

        const commentRegexList = [
          /\/\/.*/g,           
          /\/\*[\s\S]*?\*\//g,
          /#.*/g,              
          /(\"\"\"[\s\S]*?\"\"\")|(\'\'\'[\s\S]*?\'\'\')/g 
        ];

        const comments: ProjectComment[] = [];

        for (const file of files) {
          const document = await vscode.workspace.openTextDocument(file);
          const text = document.getText();

          commentRegexList.forEach(regex => {
            const found = text.match(regex);
            if (found) {
              found.forEach(c => {
                if (c.trim()) {
                  comments.push({ file: file.fsPath, comment: c.trim() });
                }
              });
            }
          });
        }

        if (comments.length === 0) {
          vscode.window.showInformationMessage("No comments found in the project.");
          return;
        }

        const panel = vscode.window.createWebviewPanel(
          "comments",
          "Project Comments",
          vscode.ViewColumn.One,
          { enableScripts: true, retainContextWhenHidden: true }
        );

        panel.webview.html = getCommentsWebviewContent(comments);
      } catch (error) {
        vscode.window.showErrorMessage(`Error gathering comments: ${error}`);
      }
    }
  );

  // 2) Floating Notes
  const openNotesCommand = vscode.commands.registerCommand(
    "projectHelper.openFloatingNotes",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found!");
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        "floatingNotes",
        "Floating Notes",
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );

      const existingNote = context.globalState.get<NoteData>("floatingNote") || { content: "" };
      panel.webview.html = getFloatingNotesHTML(existingNote.content);

      // Handle messages from the WebView
      panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
          case "saveNote":
            await context.globalState.update("floatingNote", { content: message.content });
            vscode.window.showInformationMessage("Your note was saved!");
            break;
          case "clearNote":
            await context.globalState.update("floatingNote", { content: "" });
            vscode.window.showInformationMessage("Your note was cleared.");
            break;
        }
      });
    }
  );

  // 3) Search Logs
  const searchLogsCommand = vscode.commands.registerCommand(
    "projectHelper.searchLogs",
    async () => {
      try {
        const files = await vscode.workspace.findFiles(
          "**/*.{js,ts,jsx,tsx,java,py,html,css,cpp,c,cs,php,rb,go}",
          "**/node_modules/**"
        );

        const logRegexList = [
          /console\.log\(.*?\)/g,
          /System\.out\.println\(.*?\)/g,
          /logger\.info\(.*?\)/gi,
          /logger\.debug\(.*?\)/gi,
          /logger\.error\(.*?\)/gi,
          /print\(.*?\)/g
        ];

        const logsFound: ProjectLog[] = [];

        for (const file of files) {
          const document = await vscode.workspace.openTextDocument(file);
          const text = document.getText();

          logRegexList.forEach(regex => {
            const matches = text.match(regex);
            if (matches) {
              matches.forEach(log => {
                if (log.trim()) {
                  logsFound.push({ file: file.fsPath, log: log.trim() });
                }
              });
            }
          });
        }

        if (logsFound.length === 0) {
          vscode.window.showInformationMessage("No log statements found in the project.");
          return;
        }

        const panel = vscode.window.createWebviewPanel(
          "logs",
          "Project Logs",
          vscode.ViewColumn.One,
          { enableScripts: true, retainContextWhenHidden: true }
        );

        panel.webview.html = getLogsWebviewContent(logsFound);
      } catch (error) {
        vscode.window.showErrorMessage(`Error searching logs: ${error}`);
      }
    }
  );

  // 4) Insert Log Snippet
  const insertLogSnippetCommand = vscode.commands.registerCommand(
    "projectHelper.insertLogSnippet",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found!");
        return;
      }
      const snippet = new vscode.SnippetString(`console.log("LOG:", $1);\n`);
      editor.insertSnippet(snippet).then(() => {
        vscode.window.showInformationMessage("Inserted a console.log snippet!");
      });
    }
  );

  // 5) Search TODOs
  const searchTodosCommand = vscode.commands.registerCommand(
    "projectHelper.searchTodos",
    async () => {
      try {
        const files = await vscode.workspace.findFiles(
          "**/*.{js,ts,jsx,tsx,java,py,html,css,cpp,c,cs,php,rb,go}",
          "**/node_modules/**"
        );

        const results: { filePath: string; line: number; text: string }[] = [];
        for (const file of files) {
          const document = await vscode.workspace.openTextDocument(file);
          const lines = document.getText().split(/\r?\n/);

          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toUpperCase().includes("TODO")) {
              results.push({
                filePath: file.fsPath,
                line: i,
                text: lines[i].trim()
              });
            }
          }
        }

        if (results.length === 0) {
          vscode.window.showInformationMessage("No TODO found in the project.");
          return;
        }

        const items: vscode.QuickPickItem[] = results.map(r => ({
          label: `${r.filePath} (Line ${r.line + 1})`,
          description: r.text
        }));

        const selection = await vscode.window.showQuickPick(items, {
          placeHolder: "Select a TODO to open",
          matchOnDescription: true
        });

        if (selection) {
          const chosen = results.find(
            x =>
              `${x.filePath} (Line ${x.line + 1})` === selection.label &&
              x.text === selection.description
          );
          if (chosen) {
            const doc = await vscode.workspace.openTextDocument(chosen.filePath);
            const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            const position = new vscode.Position(chosen.line, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Error searching TODOs: ${err}`);
      }
    }
  );

  // 6) Insert Try/Catch
  const insertTryCatchCommand = vscode.commands.registerCommand(
    "projectHelper.insertTryCatchSnippet",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found!");
        return;
      }
      const snippet = new vscode.SnippetString([
        "try {",
        "\t$1",
        "} catch (error) {",
        "\tconsole.error('Error:', error);",
        "}",
        ""
      ].join("\n"));

      editor.insertSnippet(snippet).then(() => {
        vscode.window.showInformationMessage("Inserted a try/catch snippet!");
      });
    }
  );

  // 7) Format Document
  const formatDocumentCommand = vscode.commands.registerCommand(
    "projectHelper.formatDocument",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found!");
        return;
      }
      await vscode.commands.executeCommand("editor.action.formatDocument");
      vscode.window.showInformationMessage("Document formatted!");
    }
  );

  // 8) Open Docs
  const openDocsCommand = vscode.commands.registerCommand(
    "projectHelper.openDocs",
    async () => {
      const docsLink = "https://code.visualstudio.com/api";
      await vscode.env.openExternal(vscode.Uri.parse(docsLink));
      vscode.window.showInformationMessage(`Opened documentation: ${docsLink}`);
    }
  );

  // 9) Show Quick Tips
  const showQuickTipsCommand = vscode.commands.registerCommand(
    "projectHelper.showQuickTips",
    () => {
      const tips = [
        "Tip #1: Use multiple cursors by pressing Alt+Click to place additional cursors.",
        "Tip #2: Press Ctrl+Shift+L (Cmd+Shift+L on mac) to select all occurrences of a word.",
        "Tip #3: Use the built-in Git tools in VS Code's Source Control panel.",
        "Tip #4: Use 'Go to Definition' (F12) to quickly jump to symbol definitions.",
        "Tip #5: Leverage the built-in debugger for Node.js or Chrome in VS Code!"
      ];
      const randomTip = tips[Math.floor(Math.random() * tips.length)];
      vscode.window.showInformationMessage(randomTip);
    }
  );

  // 10) Java Dependency Graph
  const javaDependencyGraphCommand = vscode.commands.registerCommand(
    "projectHelper.javaDependencyGraph",
    async () => {
      try {
        const pomFiles = await vscode.workspace.findFiles("**/pom.xml", "**/node_modules/**");
        const gradleFiles = await vscode.workspace.findFiles("**/build.gradle", "**/node_modules/**");

        const dependencies: JavaDependency[] = [];

        if (pomFiles.length > 0) {
          const pomDoc = await vscode.workspace.openTextDocument(pomFiles[0]);
          const pomText = pomDoc.getText();

          const depBlocks = pomText.match(/<dependency>[\s\S]*?<\/dependency>/g) || [];
          depBlocks.forEach(block => {
            const groupId = block.match(/<groupId>(.*?)<\/groupId>/)?.[1] || "";
            const artifactId = block.match(/<artifactId>(.*?)<\/artifactId>/)?.[1] || "";
            const version = block.match(/<version>(.*?)<\/version>/)?.[1] || "";
            dependencies.push({ groupId, artifactId, version });
          });

        } else if (gradleFiles.length > 0) {
          const gradleDoc = await vscode.workspace.openTextDocument(gradleFiles[0]);
          const gradleText = gradleDoc.getText();

          const matches = gradleText.match(/implementation\s+['"](.*?)['"]/g) || [];
          matches.forEach(line => {
            const notation = line.match(/['"](.*?)['"]/)?.[1] || "";
            const parts = notation.split(":");
            if (parts.length === 3) {
              dependencies.push({
                groupId: parts[0],
                artifactId: parts[1],
                version: parts[2],
                notation
              });
            }
          });
        } else {
          vscode.window.showWarningMessage(
            "No pom.xml or build.gradle found. (Naive search for Java dependencies.)"
          );
          return;
        }

        if (dependencies.length === 0) {
          vscode.window.showInformationMessage("No dependencies found (naive parse).");
          return;
        }

        const panel = vscode.window.createWebviewPanel(
          "javaDeps",
          "Java Dependency Graph",
          vscode.ViewColumn.One,
          { enableScripts: true }
        );
        panel.webview.html = getJavaDepsWebviewContent(dependencies);
      } catch (err) {
        vscode.window.showErrorMessage(`Error generating dependency graph: ${err}`);
      }
    }
  );

  // 11) Git Commit Suggestions
  const gitSuggestionsCommand = vscode.commands.registerCommand(
    "projectHelper.gitSuggestions",
    () => {
      const panel = vscode.window.createWebviewPanel(
        "gitSuggestions",
        "Git Commit Suggestions",
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = getGitSuggestionsWebviewContent();

      panel.webview.onDidReceiveMessage((message) => {
        if (message.command === "runGitCommand") {
          runGitCommand(message.args);
        }
      });
    }
  );

  // 12) Compare Files
  const compareFilesCommand = vscode.commands.registerCommand(
    "projectHelper.compareFiles",
    async () => {
      try {
        const fileA = await pickFile("Select first file to compare");
        if (!fileA) {
          vscode.window.showErrorMessage("No file selected for the first file.");
          return;
        }
        const fileB = await pickFile("Select second file to compare");
        if (!fileB) {
          vscode.window.showErrorMessage("No file selected for the second file.");
          return;
        }
        await vscode.commands.executeCommand(
          "vscode.diff",
          vscode.Uri.file(fileA),
          vscode.Uri.file(fileB),
          "File Comparison"
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Error comparing files: ${err}`);
      }
    }
  );

  // 13) **Open Dashboard in Right Column** with Fancy Pill-Shaped Buttons
  const openDashboardCommand = vscode.commands.registerCommand(
    "projectHelper.openDashboard",
    () => {
      const panel = vscode.window.createWebviewPanel(
        "codeAssistDashboard",
        "CodeAssist Dashboard",
        vscode.ViewColumn.Beside, // Right column
        { enableScripts: true, retainContextWhenHidden: true }
      );

      panel.webview.html = getCodeAssistDashboardHTML();
      panel.webview.onDidReceiveMessage((message) => {
        vscode.commands.executeCommand(message.command);
      });
    }
  );

  // Register Hover/CodeLens
  initHoverProvider(context);
  initCodeLensProvider(context);

  // Subscribe commands
  context.subscriptions.push(
    gatherCommentsCommand,
    openNotesCommand,
    searchLogsCommand,
    insertLogSnippetCommand,
    searchTodosCommand,
    insertTryCatchCommand,
    formatDocumentCommand,
    openDocsCommand,
    showQuickTipsCommand,
    javaDependencyGraphCommand,
    gitSuggestionsCommand,
    compareFilesCommand,
    openDashboardCommand
  );
}

export function deactivate() {}

/**
 * Returns the fancy "CodeAssist" Dashboard HTML with pill-shaped buttons
 * reminiscent of the screenshot you provided.
 */
function getCodeAssistDashboardHTML(): string {
  const commands = [
    { label: "Gather Comments", cmd: "projectHelper.gatherComments" },
    { label: "Open Floating Notes", cmd: "projectHelper.openFloatingNotes" },
    { label: "Search Logs", cmd: "projectHelper.searchLogs" },
    { label: "Insert Log Snippet", cmd: "projectHelper.insertLogSnippet" },
    { label: "Search TODOs", cmd: "projectHelper.searchTodos" },
    { label: "Insert Try/Catch Snippet", cmd: "projectHelper.insertTryCatchSnippet" },
    { label: "Format Document", cmd: "projectHelper.formatDocument" },
    { label: "Open Docs", cmd: "projectHelper.openDocs" },
    { label: "Show Quick Tips", cmd: "projectHelper.showQuickTips" },
    { label: "Java Dependency Graph", cmd: "projectHelper.javaDependencyGraph" },
    { label: "Git Commit Suggestions", cmd: "projectHelper.gitSuggestions" },
    { label: "Compare Files", cmd: "projectHelper.compareFiles" },
  ];

  // We'll set a bright background with pink shadow for the pill buttons
  return /* html */ `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>CodeAssist Dashboard</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;800&display=swap');

        body {
          margin: 0; padding: 0;
          background-color: #2a2eff; /* A vibrant bluish background */
          font-family: 'Montserrat', sans-serif;
        }
        .header {
          text-align: center;
          color: #fff;
          padding: 2rem;
        }
        .header .logo {
          font-weight: 800;
          font-size: 2.5rem;
          color: #ffffff;
        }
        .header .subtitle {
          font-weight: 600;
          font-size: 1.3rem;
          color: #ff5dc8; /* Pink accent */
        }

        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 2rem auto;
          max-width: 600px;
        }

        .command-btn {
          position: relative;
          width: 260px;
          height: 60px;
          margin: 1rem 0;
          font-size: 1rem;
          font-weight: 600;
          text-align: center;
          background-color: #0B0E2F; /* Dark navy for the button face */
          color: #fff;
          border: none;
          cursor: pointer;
          border-radius: 30px; /* pill shape */
          box-shadow: 0 6px 0 #ff5dc8; /* Pink "shadow" behind */
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .command-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 6px 10px rgba(0,0,0,0.2);
        }
        .command-btn:active {
          transform: translateY(2px);
          box-shadow: 0 3px 0 #ff5dc8;
        }

        .command-btn span {
          position: relative;
          top: 50%;
          transform: translateY(-50%);
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">CodeAssist</div>
        <div class="subtitle">Enhance Your Coding Workflow</div>
      </div>
      <div class="container">
        ${commands
          .map(
            (c) => `
          <button class="command-btn" onclick="sendCommand('${c.cmd}')">
            <span>${c.label}</span>
          </button>
        `
          )
          .join("")}
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        function sendCommand(cmd) {
          vscode.postMessage({ command: cmd });
        }
      </script>
    </body>
  </html>
  `;
}

/** Comments WebView */
function getCommentsWebviewContent(comments: ProjectComment[]): string {
  const commentsJson = JSON.stringify(comments);
  return /* html */ `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8"/>
      <title>Project Comments</title>
      <style>
        body {
          margin: 0; padding: 0; background: #f8f8fb;
          font-family: Arial, sans-serif;
        }
        header {
          background-color: #6200ea; color: white;
          padding: 1rem; text-align: center;
        }
        .search-container {
          margin: 1rem; display: flex; justify-content: center;
        }
        .search-container input {
          width: 50%; padding: 0.5rem; font-size: 1rem;
        }
        .comments-wrapper {
          display: flex; flex-direction: column; gap: 1rem; padding: 1rem; max-width: 1200px; margin: 0 auto;
        }
        .comment-card {
          background: #fff; padding: 1rem; border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .comment-header { font-weight: bold; color: #6200ea; margin-bottom: 0.5rem; }
        .comment-file { font-size: 0.9rem; color: #555; margin-bottom: 0.5rem; }
        .comment-text { font-size: 1rem; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <header><h1>Project Comments</h1></header>
      <div class="search-container">
        <input id="searchInput" type="text" placeholder="Search comments..."/>
      </div>
      <div class="comments-wrapper" id="commentsWrapper"></div>
      <script>
        const comments = ${commentsJson};
        const searchInput = document.getElementById('searchInput');
        const commentsWrapper = document.getElementById('commentsWrapper');

        function renderComments(list) {
          commentsWrapper.innerHTML = "";
          list.forEach((c, idx) => {
            const card = document.createElement('div');
            card.className = 'comment-card';
            card.innerHTML = \`
              <div class="comment-header">#\${idx+1}</div>
              <div class="comment-file">\${c.file}</div>
              <div class="comment-text">\${c.comment}</div>
            \`;
            commentsWrapper.appendChild(card);
          });
        }

        renderComments(comments);

        searchInput.addEventListener('input', e => {
          const term = e.target.value.toLowerCase();
          const filtered = comments.filter(c =>
            c.file.toLowerCase().includes(term) || c.comment.toLowerCase().includes(term)
          );
          renderComments(filtered);
        });
      </script>
    </body>
  </html>
  `;
}

/** Floating Notes WebView */
function getFloatingNotesHTML(existingNote: string): string {
  const safeNote = existingNote
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return /* html */ `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>Floating Notes</title>
      <style>
        html, body {
          margin: 0; padding: 0; width: 100%; height: 100%;
          background: transparent; overflow: hidden; user-select: none;
        }
        #notes-container {
          position: absolute; top: 50px; left: 50px; width: 300px; height: 250px;
          border: 1px solid #ddd; background: #fff; border-radius: 8px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          display: flex; flex-direction: column;
        }
        #header {
          background-color: #6200ea; color: white; padding: 10px;
          text-align: center; font-size: 16px; cursor: move;
          border-top-left-radius: 8px; border-top-right-radius: 8px;
        }
        #toolbar {
          display: flex; justify-content: flex-end; padding: 5px 10px;
          background: #f4f4f9;
        }
        #editor {
          flex-grow: 1; padding: 10px; overflow: auto;
          font-family: sans-serif; font-size: 14px;
        }
        button {
          border: none; padding: 8px; margin-left: 5px; border-radius: 4px; cursor: pointer;
        }
        .save-button { background-color: #4caf50; color: #fff; }
        .clear-button { background-color: #f44336; color: #fff; }
      </style>
    </head>
    <body>
      <div id="notes-container">
        <div id="header">Floating Notes</div>
        <div id="toolbar">
          <button id="saveBtn" class="save-button">Save</button>
          <button id="clearBtn" class="clear-button">Clear</button>
        </div>
        <div id="editor" contenteditable="true"></div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        const editor = document.getElementById("editor");
        editor.innerText = \`${safeNote}\`;

        const container = document.getElementById("notes-container");
        const header = document.getElementById("header");

        let offsetX=0, offsetY=0, isDragging=false;

        header.addEventListener("mousedown", e => {
          isDragging = true;
          offsetX = e.clientX - container.offsetLeft;
          offsetY = e.clientY - container.offsetTop;
        });

        document.addEventListener("mouseup", () => isDragging = false);
        document.addEventListener("mousemove", e => {
          if(!isDragging) return;
          container.style.left = (e.clientX - offsetX) + "px";
          container.style.top = (e.clientY - offsetY) + "px";
        });

        document.getElementById("saveBtn").addEventListener("click", () => {
          vscode.postMessage({ command: "saveNote", content: editor.innerText });
        });
        document.getElementById("clearBtn").addEventListener("click", () => {
          vscode.postMessage({ command: "clearNote" });
        });
      </script>
    </body>
  </html>
  `;
}

/** Logs WebView */
function getLogsWebviewContent(logs: { file: string; log: string }[]): string {
  const logsJson = JSON.stringify(logs);
  return /* html */ `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>Project Logs</title>
      <style>
        body {
          margin: 0; padding: 0; background: #f8f8fb;
          font-family: Arial, sans-serif;
        }
        header {
          background-color: #007acc; color: white;
          padding: 1rem; text-align: center;
        }
        .logs-wrapper {
          display: flex; flex-direction: column; gap: 1rem; padding: 1rem; max-width: 1200px; margin: 0 auto;
        }
        .log-card {
          background: #fff; padding: 1rem; border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .log-file { font-size: 0.9rem; color: #555; margin-bottom: 0.5rem; }
        .log-text { font-size: 1rem; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <header><h1>Project Log Statements</h1></header>
      <div class="logs-wrapper" id="logsWrapper"></div>

      <script>
        const logs = ${logsJson};
        const logsWrapper = document.getElementById("logsWrapper");

        function renderLogs(list) {
          logsWrapper.innerHTML = "";
          list.forEach(l => {
            const card = document.createElement('div');
            card.className = 'log-card';
            card.innerHTML = \`
              <div class="log-file">\${l.file}</div>
              <div class="log-text">\${l.log}</div>
            \`;
            logsWrapper.appendChild(card);
          });
        }
        renderLogs(logs);
      </script>
    </body>
  </html>
  `;
}

/** Java Dependencies WebView */
function getJavaDepsWebviewContent(deps: JavaDependency[]): string {
  const depsJson = JSON.stringify(deps, null, 2);
  return /* html */ `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8"/>
      <title>Java Dependency Graph</title>
      <style>
        body {
          margin: 0; padding: 0; background: #f8f8fb;
          font-family: Arial, sans-serif;
        }
        header {
          background-color: #4caf50; color: #fff;
          padding: 1rem; text-align: center;
        }
        .deps-wrapper {
          padding: 1rem; max-width: 800px; margin: 0 auto;
        }
        .dep-item {
          background: #fff; border: 1px solid #ddd; border-radius: 8px;
          margin-bottom: 8px; padding: 8px;
        }
        .dep-item strong {
          color: #6200ea;
        }
      </style>
    </head>
    <body>
      <header><h1>Java Dependency Graph</h1></header>
      <div class="deps-wrapper" id="depsWrapper"></div>

      <script>
        const deps = ${depsJson};
        const wrapper = document.getElementById('depsWrapper');

        if (!deps || deps.length === 0) {
          wrapper.innerHTML = "<p>No dependencies found.</p>";
        } else {
          deps.forEach(d => {
            const div = document.createElement('div');
            div.className = 'dep-item';
            if (d.notation) {
              // Gradle style
              div.innerHTML = \`<strong>\${d.notation}</strong>\`;
            } else {
              // Maven style
              div.innerHTML = \`<strong>\${d.groupId}</strong> : \${d.artifactId} : \${d.version}\`;
            }
            wrapper.appendChild(div);
          });
        }
      </script>
    </body>
  </html>
  `;
}

/** Git Suggestions WebView */
function getGitSuggestionsWebviewContent(): string {
  return /* html */ `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8"/>
      <title>Git Commit Suggestions</title>
      <style>
        body {
          margin: 0; padding: 0; background: #2f2f2f; color: #fff;
          font-family: Arial, sans-serif;
        }
        header {
          background-color: #444; color: #fff;
          padding: 1rem; text-align: center;
        }
        .commands {
          display: flex; flex-direction: column; gap: 1rem;
          padding: 1rem; max-width: 600px; margin: 0 auto;
        }
        button {
          padding: 1rem; border: none; border-radius: 8px;
          background: #29b6f6; color: #fff; font-size: 1rem;
          cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(0,0,0,0.3);
        }
        button:active {
          transform: translateY(2px);
          box-shadow: none;
        }
      </style>
    </head>
    <body>
      <header><h1>Git Commit Suggestions</h1></header>
      <div class="commands">
        <button onclick="runGit('git status')">Git Status</button>
        <button onclick="runGit('git add .')">Git Add All</button>
        <button onclick="runGit('git commit -m \\'Sample commit\\'')">Git Commit</button>
        <button onclick="runGit('git push')">Git Push</button>
        <button onclick="runGit('git pull')">Git Pull</button>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        function runGit(cmd) {
          vscode.postMessage({ command: "runGitCommand", args: cmd });
        }
      </script>
    </body>
  </html>
  `;
}

/** Helper: actually run a Git command in the workspace folder */
function runGitCommand(command: string) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const cwd = workspaceFolders && workspaceFolders.length > 0
    ? workspaceFolders[0].uri.fsPath
    : undefined;

  exec(command, { cwd }, (error, stdout, stderr) => {
    if (error) {
      vscode.window.showErrorMessage(`Error running "${command}": ${stderr || error.message}`);
      return;
    }
    vscode.window.showInformationMessage(`Output:\n${stdout}`);
  });
}

/** Helper: pickFile for Compare Files */
async function pickFile(placeHolder: string): Promise<string | undefined> {
  const uri = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: placeHolder
  });
  return uri && uri.length > 0 ? uri[0].fsPath : undefined;
}

/** Hover Provider & CodeLens for "TODO" */
function initHoverProvider(context: vscode.ExtensionContext) {
  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: "file", language: "*" },
    {
      provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position);
        if (!range) return;
        const word = document.getText(range);
        if (word.toUpperCase() === "TODO") {
          return new vscode.Hover(
            new vscode.MarkdownString("**Remember to finish this task!**")
          );
        }
        return;
      },
    }
  );
  context.subscriptions.push(hoverProvider);
}

function initCodeLensProvider(context: vscode.ExtensionContext) {
  const codeLensProvider = vscode.languages.registerCodeLensProvider(
    { scheme: "file", language: "*" },
    new TodoCodeLensProvider()
  );

  const codelensCommand = vscode.commands.registerCommand("projectHelper.todoLensAction", () => {
    vscode.window.showInformationMessage("CodeLens clicked! Possibly handle the TODO or open notes...");
  });

  context.subscriptions.push(codeLensProvider, codelensCommand);
}

class TodoCodeLensProvider implements vscode.CodeLensProvider {
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  public provideCodeLenses(document: vscode.TextDocument) {
    const codeLenses: vscode.CodeLens[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text;
      if (lineText.toUpperCase().includes("TODO")) {
        const pos = new vscode.Position(i, 0);
        const range = new vscode.Range(pos, pos);
        const lens = new vscode.CodeLens(range, {
          title: "Handle TODO",
          command: "projectHelper.todoLensAction"
        });
        codeLenses.push(lens);
      }
    }
    return codeLenses;
  }

  public resolveCodeLens?(codeLens: vscode.CodeLens) {
    return codeLens;
  }
}
