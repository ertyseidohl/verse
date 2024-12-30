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
  CompletionContext,
  CompletionTriggerKind,
  TextDocumentChangeEvent,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { VerseAnalyzer } from "./VerseAnalyzer";
import { VersePredictorFactory } from "./predictors/VersePredictorFactory";
import { DEFAULT_DOCUMENT_SETTINGS, DocumentSettings } from "./DocumentSettings";

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
  private documentSettingsStore: Map<string, Thenable<DocumentSettings>>;
  private documents: TextDocuments<TextDocument>;

  private verseAnalyzer: VerseAnalyzer;

  private versePredictorFactory = new VersePredictorFactory();

  private constructor(private connection: Connection) {
    this.documentSettingsStore = new Map<string, Thenable<DocumentSettings>>();
    this.clientSettings = { ...DEFAULT_CLIENT_SETTINGS };

    this.documents = new TextDocuments(TextDocument);

    this.documents.listen(connection);

    connection.onInitialize(this.onInitialize.bind(this));
    connection.onInitialized(this.onInitialized.bind(this));
  }

  public static async create(connection: Connection): Promise<VerseServer> {
    const verseServer = new VerseServer(connection);
    return verseServer;
  }

  private async onInitialize(
    params: InitializeParams
  ): Promise<InitializeResult> {
    const result = this.initializeClientCapabilities(params.capabilities);

    this.verseAnalyzer = new VerseAnalyzer(this.clientSettings);

    this.documents.onDidChangeContent(this.onDidChangeContent.bind(this));

    // Only keep settings for open documents
    this.documents.onDidClose((e) => {
      this.documentSettingsStore.delete(e.document.uri);
    });

    // all feature related registrations
    this.connection.onDidChangeConfiguration(
      this.onDidChangeConfiguration.bind(this)
    );
    this.connection.onCompletion(this.onCompletion.bind(this));
    return result;
  }

  private onInitialized(_: InitializedParams): void {
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

  private async onCompletion(
    textDocumentPosition: TextDocumentPositionParams,
    context: CompletionContext
  ): Promise<CompletionItem[]> {
    const document = this.documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      console.log("!document");
      return null;
    }

    const triggerKind = context?.triggerKind || CompletionTriggerKind.Invoked;
    if (triggerKind !== CompletionTriggerKind.Invoked) {
      return null;
    }

    const documentSettings = await this.getDocumentSettings(document.uri);
    const versePredictor = await this.versePredictorFactory.get(
      documentSettings
    );
    return versePredictor.predict(textDocumentPosition, document);
  }

  private async sendDiagnostics(document: TextDocument) {
    const diagnostics = await this.verseAnalyzer.analyze(document);

    if (diagnostics.length > 0) {
      this.connection.sendDiagnostics({
        uri: document.uri,
        version: document.version,
        diagnostics: diagnostics,
      });
    }
  }

  private async onDidChangeContent(change: TextDocumentChangeEvent<TextDocument>) {
    this.sendDiagnostics(change.document);
  }

  private async onDidChangeConfiguration(change) {
    if (this.clientSettings.hasConfigurationCapability) {
      // Reset all cached document settings
      this.documentSettingsStore.clear();
    } else {
      this.clientSettings =
        change.settings.verseLanguageServer || DEFAULT_CLIENT_SETTINGS;
    }
    if (this.clientSettings.hasDiagnosticRefreshSupport) {
      this.connection.languages.diagnostics.refresh();
    } else {
      // Manually refresh diagnostics for all open documents
      this.documents.all().forEach(async (document) => {
        this.sendDiagnostics(document);
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
        completionProvider: {
          resolveProvider: false,
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
    let result = this.documentSettingsStore.get(resource);
    if (!result) {
      result = this.connection.workspace.getConfiguration({
        scopeUri: resource,
        section: "verse",
      });
      this.documentSettingsStore.set(resource, result);
    }
    return result;
  }
}
