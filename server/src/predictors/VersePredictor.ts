import { CompletionItem, TextDocumentPositionParams } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DocumentSettings } from "../DocumentSettings";

export abstract class VersePredictor {
  settings: DocumentSettings;

  protected constructor(settings: DocumentSettings) {
    this.settings = settings;
  }

  static async create(settings: DocumentSettings): Promise<VersePredictor> {
    throw new Error('VersePredictor.create must be implemented by derived class');
  }

  abstract predict(
    textDocumentPosition: TextDocumentPositionParams,
    textDocument: TextDocument
  ): Promise<CompletionItem[]>;
}