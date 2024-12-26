import {
  TextDocuments,
  ClientCapabilities,
  Connection,
  InitializeResult,
  DidChangeConfigurationNotification,
  CompletionItem,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeParams,
  InitializedParams,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { VerseAnalyzer } from "./VerseAnalyzer";
import { VerseValidator } from "./VerseValidator";
import { VersePredictor } from "./VersePredictor";

// The example settings
interface DocumentSettings {
  showAllErrors: boolean;
  maxNumberOfProblems: number;
  caching: CachingStrategy;
}

enum CachingStrategy {
  eager,
  lazy,
}

const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  showAllErrors: false,
  maxNumberOfProblems: 1000,
  caching: CachingStrategy.eager,
};

interface ClientSettings {
  hasConfigurationCapability: boolean;
  hasWorkspaceFolderCapability: boolean;
  hasDiagnosticRelatedInformationCapability: boolean;
  hasDiagnosticRefreshSupport: boolean;
}

const DEFAULT_CLIENT_SETTINGS = {
  hasConfigurationCapability: false,
  hasWorkspaceFolderCapability: false,
  hasDiagnosticRelatedInformationCapability: false,
  hasDiagnosticRefreshSupport: false,
};

export default class VerseServer {
  private clientSettings: ClientSettings;
  private documentSettings: Map<string, Thenable<DocumentSettings>>;
  private documents: TextDocuments<TextDocument>;

  private verseAnalyzer:VerseAnalyzer;
  private verseValidator:VerseValidator;
  private versePredictor:VersePredictor;

  private constructor(
    private connection: Connection,
  ) {
    console.log("VerseServer constructor start");
    this.documentSettings = new Map<string, Thenable<DocumentSettings>>();
    this.clientSettings = { ...DEFAULT_CLIENT_SETTINGS };

    this.documents = new TextDocuments(TextDocument);

    this.documents.listen(connection);

    connection.onInitialize(this.onInitialize.bind(this));
    connection.onInitialized(this.onInitialized.bind(this));
    console.log("VerseServer constructor end");
  }

  public static async create(connection: Connection): Promise<VerseServer> {
    console.log("VerseServer.create start");

    const verseServer = new VerseServer(connection);

    console.log("VerseServer.create end");
    return verseServer;
  }

  private onInitialize(params: InitializeParams): InitializeResult {
    const result = this.initializeClientCapabilities(params.capabilities);

    this.verseAnalyzer = new VerseAnalyzer(this.clientSettings);
    this.verseValidator = new VerseValidator(this.clientSettings);
    this.versePredictor = new VersePredictor(this.clientSettings);

    this.documents.onDidChangeContent(this.onDidChangeContent.bind(this));

    // Only keep settings for open documents
    this.documents.onDidClose((e) => {
      this.documentSettings.delete(e.document.uri);
    });

    // all feature related registrations
    this.connection.onDidChangeConfiguration(
      this.onDidChangeConfiguration.bind(this)
    );
    this.connection.onCompletion(this.onCompletion.bind(this));
    this.connection.onCompletionResolve(this.onCompletionResolve.bind(this));

    return result;
  }

  private onInitialized(_: InitializedParams): void {
    console.log("Connection Initialized");
    if (this.clientSettings.hasConfigurationCapability) {
      // Register for all configuration changes.
      this.connection.client.register(DidChangeConfigurationNotification.type);
    }
    if (this.clientSettings.hasWorkspaceFolderCapability) {
      this.connection.workspace.onDidChangeWorkspaceFolders((_event) => {
        console.log("Workspace folder change event received.");
      });
    }
  }

  private async onCompletionResolve(
    item: CompletionItem
  ): Promise<CompletionItem> {
    item.detail = "TODO detail";
    item.documentation = "TODO documentation";
    return item;
  }

  private async onCompletion(
    textDocumentPosition: TextDocumentPositionParams
  ): Promise<CompletionItem[]> {
    console.log("completion.onCompletion request");
    const document = this.documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      console.log("!document");
      return [];
    }

    return this.versePredictor.predict(textDocumentPosition, document);
  }

  private async onDidChangeContent(change) {
    const diagnostics = await this.verseValidator.validate(change.document);

    if (diagnostics.length > 0) {
      this.connection.sendDiagnostics({
        uri: change.document.uri,
        version: change.document.version,
        diagnostics: diagnostics,
      });
    }
  }

  private async onDidChangeConfiguration(change) {
    if (this.clientSettings.hasConfigurationCapability) {
      // Reset all cached document settings
      this.documentSettings.clear();
    } else {
      this.clientSettings =
        change.settings.verseLanguageServer || DEFAULT_CLIENT_SETTINGS;
    }
    if (this.clientSettings.hasDiagnosticRefreshSupport) {
      this.connection.languages.diagnostics.refresh();
    } else {
      // Manually refresh diagnostics for all open documents
      this.documents.all().forEach(async (document) => {
        const diagnostics = await this.verseValidator.validate(document);
        this.connection.sendDiagnostics({
          uri: document.uri,
          diagnostics,
        });
      });
    }
  }

  private initializeClientCapabilities(
    capabilities: ClientCapabilities
  ): InitializeResult {
    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    this.clientSettings.hasConfigurationCapability = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    this.clientSettings.hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    this.clientSettings.hasDiagnosticRelatedInformationCapability = !!(
      capabilities.textDocument &&
      capabilities.textDocument.publishDiagnostics &&
      capabilities.textDocument.publishDiagnostics.relatedInformation
    );
    this.clientSettings.hasDiagnosticRefreshSupport =
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
    if (this.clientSettings.hasWorkspaceFolderCapability) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: false,
        },
      };
    }
    return result;
  }

  private async getDocumentSettings(
    resource: string
  ): Promise<DocumentSettings> {
    if (!this.clientSettings.hasConfigurationCapability) {
      return DEFAULT_DOCUMENT_SETTINGS;
    }
    let result = this.documentSettings.get(resource);
    if (!result) {
      result = this.connection.workspace.getConfiguration({
        scopeUri: resource,
        section: "verse",
      });
      this.documentSettings.set(resource, result);
    }
    return result;
  }
}
