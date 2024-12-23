import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  DocumentDiagnosticReportKind,
  InitializeParams,
  InitializeResult,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  type DocumentDiagnosticReport,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection: ProposedFeatures.Connection = createConnection(
  ProposedFeatures.all
);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
let hasDiagnosticRefreshSupport = false;

function server_log(message: string, ...args: any[]) {
  connection.console.log("[SERVER] " + message + "\n" + JSON.stringify(args));
}

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );
  hasDiagnosticRefreshSupport =
    !!capabilities.workspace?.diagnostics?.refreshSupport;

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  server_log("Connection Initialized");
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      server_log("Workspace folder change event received.");
    });
  }
});

// The example settings
interface ExampleSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, Thenable<ExampleSettings>>();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = change.settings.verseLanguageServer || defaultSettings;
  }
  if (hasDiagnosticRefreshSupport) {
    connection.languages.diagnostics.refresh();
  } else {
    // Manually refresh diagnostics for all open documents
    documents.all().forEach((document) => {
      validateTextDocument(document).then((diagnostics) => {
        connection.sendDiagnostics({
          uri: document.uri,
          diagnostics,
        });
      });
    });
  }
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "verseLanguageServer",
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
});

connection.languages.diagnostics.on(async (params) => {
  server_log("Received diagnostic request");
  const document = documents.get(params.textDocument.uri);
  if (document !== undefined) {
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: await validateTextDocument(document),
    } satisfies DocumentDiagnosticReport;
  } else {
    // We don't know the document. We can either try to read it from disk
    // or we don't report problems for it.
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: [],
    } satisfies DocumentDiagnosticReport;
  }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async (change) => {
  try {
    server_log("Document change detected", {
      uri: change.document.uri,
      version: change.document.version,
    });

    if (!change.document) {
      server_log("No document in change event");
      return;
    }

    const text = change.document.getText();
    if (text === undefined) {
      server_log("No text content in document");
      return;
    }

    const diagnostics = await validateTextDocument(change.document);

    // Validate diagnostic ranges before sending
    const validDiagnostics = diagnostics.filter((diagnostic) => {
      server_log("Validating diagnostic range", diagnostic);
      const isValid =
        diagnostic.range &&
        diagnostic.range.start &&
        diagnostic.range.end &&
        typeof diagnostic.range.start.line === "number" &&
        typeof diagnostic.range.start.character === "number" &&
        typeof diagnostic.range.end.line === "number" &&
        typeof diagnostic.range.end.character === "number";

      if (!isValid) {
        server_log("Invalid diagnostic range detected", diagnostic);
      }
      return isValid;
    });

    if (validDiagnostics.length > 0) {
      connection.sendDiagnostics({
        uri: change.document.uri,
        version: change.document.version,
        diagnostics: validDiagnostics,
      });
    }
  } catch (error) {
    server_log("Error in didChange handler", error);
  }
});

async function validateTextDocument(
  textDocument: TextDocument
): Promise<Diagnostic[]> {
  server_log("Running validation");
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];
  const pattern = /\b[A-Z]{2,}\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    server_log("Match found", match);
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Warning,
      range: {
        start: textDocument.positionAt(match.index),
        end: textDocument.positionAt(match.index + match[0].length),
      },
      message: `${match[0]} is all uppercase.`,
      source: "ex",
    };

    // Log the diagnostic range for debugging
    server_log(`Diagnostic range: ${JSON.stringify(diagnostic.range)}`);

    if (hasDiagnosticRelatedInformationCapability) {
      diagnostic.relatedInformation = [
        {
          location: {
            uri: textDocument.uri,
            range: Object.assign({}, diagnostic.range),
          },
          message: "Spelling matters",
        },
        {
          location: {
            uri: textDocument.uri,
            range: Object.assign({}, diagnostic.range),
          },
          message: "Particularly for names",
        },
      ];
    }
    diagnostics.push(diagnostic);
  }
  server_log("Diagnostics complete", diagnostics);
  return diagnostics;
}

// This handler provides the initial list of the completion items.
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
      {
        label: "TypeScript",
        kind: CompletionItemKind.Text,
        data: 1,
      },
      {
        label: "JavaScript",
        kind: CompletionItemKind.Text,
        data: 2,
      },
    ];
  }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  if (item.data === 1) {
    item.detail = "TypeScript details";
    item.documentation = "TypeScript documentation";
  } else if (item.data === 2) {
    item.detail = "JavaScript details";
    item.documentation = "JavaScript documentation";
  }
  return item;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
