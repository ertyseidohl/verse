import * as path from "path";
import {
  workspace as Workspace,
  window as Window,
  ExtensionContext,
  TextDocument,
  OutputChannel,
  TextDocumentChangeEvent,
} from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  VersionedTextDocumentIdentifier,
} from "vscode-languageclient/node";

let languageClient: LanguageClient;
const clients = new Map<string, LanguageClient>();

export function activate(context: ExtensionContext) {
  const module = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );

  const outputChannel: OutputChannel = Window.createOutputChannel("Verse", {
    log: true,
  });
  outputChannel.show();
  outputChannel.appendLine("Verse activated.");

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
    const serverOptions: ServerOptions = {
      run: {
        module,
        transport: TransportKind.ipc,
      },
      debug: {
        module,
        transport: TransportKind.ipc,
        options: {
          execArgv: ["--nolazy", "--inspect=6009"],
        },
      },
    };
    const clientOptions: LanguageClientOptions = {
      documentSelector: [
        { scheme: "file", language: "verse" },
        { scheme: "untitled", language: "verse" },
      ],
      diagnosticCollectionName: "verseLanguageServer",
      outputChannel: outputChannel,
      traceOutputChannel: Window.createOutputChannel('Verse Language Server Trace', "verseLanguageServer"),
      middleware: {
        // Add middleware to validate document changes
        didChange: (event, next) => {
          if (!event.document || !event.contentChanges) {
            outputChannel.appendLine(
              `Invalid change event: ${JSON.stringify(event)}`
            );
            return;
          }
          // Ensure document has valid content
          if (event.document.getText() === undefined) {
            outputChannel.appendLine("Document has no content");
            return;
          }
          return next(event);
        },
      },
    };
    languageClient = new LanguageClient(
      "verseLanguageServer",
      "Verse Language Server",
      serverOptions,
      clientOptions,
      true // forceDebug
    );
    languageClient.start();
    console.log("languageClient started");
    return;
  }

  function didChangeTextDocument(change: TextDocumentChangeEvent): void {
    if (
      change.document.languageId !== "verse" ||
      (change.document.uri.scheme !== "file" &&
        change.document.uri.scheme !== "untitled")
    ) {
      return;
    }
    // if (change.contentChanges.length === 0) {
    //   return;
    // }
    console.log("Sending textDocument/didChange notification");
    languageClient.sendNotification("textDocument/didChange", {
      textDocument: VersionedTextDocumentIdentifier.create(
        change.document.uri.toString(),
        change.document.version
      ),
      contentChanges: change.contentChanges,
    });
  }

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
  Workspace.onDidChangeTextDocument(didChangeTextDocument);
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
