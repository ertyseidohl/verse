/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from "path";
import {
  workspace as Workspace,
  commands as Commands,
  window as Window,
  ExtensionContext,
  TextDocument,
  OutputChannel,
  WorkspaceFolder,
  Uri,
  TextDocumentChangeEvent,
} from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  TransportKind,
  VersionedTextDocumentIdentifier,
} from "vscode-languageclient/node";

let languageClient: LanguageClient;
const clients = new Map<string, LanguageClient>();

let _sortedWorkspaceFolders: string[] | undefined;
function sortedWorkspaceFolders(): string[] {
  if (_sortedWorkspaceFolders === void 0) {
    _sortedWorkspaceFolders = Workspace.workspaceFolders
      ? Workspace.workspaceFolders
          .map((folder) => {
            let result = folder.uri.toString();
            if (result.charAt(result.length - 1) !== "/") {
              result = result + "/";
            }
            return result;
          })
          .sort((a, b) => {
            return a.length - b.length;
          })
      : [];
  }
  return _sortedWorkspaceFolders;
}
Workspace.onDidChangeWorkspaceFolders(
  () => (_sortedWorkspaceFolders = undefined)
);

function getOuterMostWorkspaceFolder(folder: WorkspaceFolder): WorkspaceFolder {
  const sorted = sortedWorkspaceFolders();
  for (const element of sorted) {
    let uri = folder.uri.toString();
    if (uri.charAt(uri.length - 1) !== "/") {
      uri = uri + "/";
    }
    if (uri.startsWith(element)) {
      return Workspace.getWorkspaceFolder(Uri.parse(element))!;
    }
  }
  return folder;
}

export function activate(context: ExtensionContext) {
  const module = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );

  const outputChannel: OutputChannel = Window.createOutputChannel("Verse", {
    log: true,
  });
  outputChannel.show();
  outputChannel.appendLine("Verse activated.");

  let installRhymingDictionary = Commands.registerCommand(
    "verse.installRhymingDictionary",
    async () => {
      Window.showInformationMessage("Installing Rhyming Dictionary...");
      outputChannel.appendLine("Installing Rhyming Dictionary...");
      await Workspace.fs.createDirectory(context.globalStorageUri);

      outputChannel.appendLine(`Checking for rhyming dictionary database...`);

      if (context.globalState.get("__RhymingDictionaryInstalled__")) {
        Window.showInformationMessage("Rhyming dictionary already installed.");
        outputChannel.appendLine("Rhyming dictionary already installed.");
        return;
      }

      outputChannel.appendLine("Checking for rhyming dictionary...");
      const downloadPath = path.join(
        context.globalStorageUri.fsPath,
        "cmudict-0.7b"
      );
      const downloadExists = await Promise.resolve(
        Workspace.fs.stat(Uri.file(downloadPath))
      )
        .then(() => true)
        .catch(() => false);
      let rhymingDictionaryText: string;
      if (downloadExists) {
        outputChannel.appendLine("Rhyming dictionary already downloaded.");
        try {
          rhymingDictionaryText = (
            await Workspace.fs.readFile(Uri.file(downloadPath))
          ).toString();
        } catch (err) {
          outputChannel.appendLine(`Failed to read rhyming dictionary: ${err}`);
          return;
        }
      } else {
        try {
          outputChannel.appendLine("Downloading CMU Pronouncing Dictionary...");
          const rhymingDictionaryResult = await fetch(
            "https://svn.code.sf.net/p/cmusphinx/code/trunk/cmudict/cmudict-0.7b"
          );
          rhymingDictionaryText = await rhymingDictionaryResult.text();
          await Workspace.fs.writeFile(
            Uri.file(downloadPath),
            Buffer.from(rhymingDictionaryText)
          );
          outputChannel.appendLine(`Downloaded rhyming dictionary... `);
        } catch (err) {
          outputChannel.appendLine(
            `Failed to download rhyming dictionary: ${err}`
          );
          return;
        }
      }

      try {
        outputChannel.appendLine(`Saving rhyming dictionary to database...`);
        for (const line of rhymingDictionaryText.split("\n")) {
          if (line.startsWith(";;;") || !line.trim()) {
            continue;
          }
          const [word, phonemes] = line.split("  ");
          context.globalState.update(word, phonemes);
        }
      } catch (err) {
        outputChannel.appendLine(`Failed to fill database: ${err}`);
      }
      context.globalState.update("__RhymingDictionaryInstalled__", true);
      outputChannel.appendLine(`Rhyming Dictionary installed.`);
      Window.showInformationMessage("Rhyming Dictionary installed.");
    }
  );
  context.subscriptions.push(installRhymingDictionary);

  function didOpenTextDocument(document: TextDocument): void {
    // We are only interested in language mode text
    if (
      document.languageId !== "verse" ||
      (document.uri.scheme !== "file" && document.uri.scheme !== "untitled")
    ) {
      return;
    }
    outputChannel.appendLine(`Document opened: ${document.uri.toString()}`);

    const uri = document.uri;

    outputChannel.appendLine(
      `Starting language server for file: ${uri.toString()}`
    );
    const serverOptions = {
      run: {
        module,
        transport: TransportKind.ipc,
      },
      debug: {
        module,
        transport: TransportKind.ipc,
        options: { execArgv: ["--nolazy", "--inspect=6009"] },
      },
    };
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: "untitled", language: "verse" }],
      diagnosticCollectionName: "verseLanguageServer",
      outputChannel: outputChannel,
      synchronize: {
        fileEvents: [
			Workspace.createFileSystemWatcher("**/*.verse"),
			Workspace.createFileSystemWatcher("**/*.poem")
		]
      },
    };
    languageClient = new LanguageClient(
      "verseLanguageServer",
      "Verse Language Server",
      serverOptions,
      clientOptions
    );
    languageClient.start();
    return;
  }

//   function didChangeTextDocument(change: TextDocumentChangeEvent): void {
//     if (
//       change.document.languageId !== "verse" ||
//       (change.document.uri.scheme !== "file" &&
//         change.document.uri.scheme !== "untitled")
//     ) {
//       return;
//     }
//     if (change.contentChanges.length === 0) {
//       return;
//     }
//     languageClient.sendNotification("textDocument/didChange", {
//       textDocument: VersionedTextDocumentIdentifier.create(
//         change.document.uri.toString(),
//         change.document.version
//       ),
//       contentChanges: change.contentChanges,
//     });
//   }

  Workspace.onDidOpenTextDocument(didOpenTextDocument);
  Workspace.textDocuments.forEach(didOpenTextDocument);
  Workspace.onDidChangeWorkspaceFolders((event) => {
    for (const folder of event.removed) {
      const client = clients.get(folder.uri.toString());
      if (client) {
        clients.delete(folder.uri.toString());
        client.stop();
      }
    }
  });
//   Workspace.onDidChangeTextDocument(didChangeTextDocument);
}

export function deactivate(): Thenable<void> {
  const promises: Thenable<void>[] = [];
  if (languageClient) {
    promises.push(languageClient.stop());
  }
  for (const client of clients.values()) {
    promises.push(client.stop());
  }
  return Promise.all(promises).then(() => undefined);
}
