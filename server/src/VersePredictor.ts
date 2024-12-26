import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { RhymeDict, ExistingDbBehavior } from "./RhymeDict";

export class VersePredictor {
  private settings: any;
  private rhymeDict: RhymeDict;

  constructor(settings: any) {
    this.settings = settings;
    this.populateRhymeDict();
  }

  private async populateRhymeDict() {
    this.rhymeDict = await RhymeDict.create(ExistingDbBehavior.IGNORE);
  }

  public async predict(
    textDocumentPosition: TextDocumentPositionParams,
    textDocument: TextDocument
  ): Promise<CompletionItem[]> {
    const text = textDocument.getText();
    if (text === undefined) {
      console.log("text === undefined");
      return [];
    }

    const line = textDocumentPosition.position.line;
    const character = textDocumentPosition.position.character;

    const lines = text.split("\n");

    const lineText = lines[line];
    const prefix = lineText.slice(0, character);
    const suffix = lineText.slice(character);

    console.log("Completion request", {
      line,
      character,
      lineText,
      prefix,
      suffix,
    });

    const recentLines: string[] = [
      lines[line - 3],
      lines[line - 2],
      lines[line - 1],
    ]
      .filter((l) => l)
      .map((l) => l.split(" ").slice(-1)[0])
      .filter((l) => l);

    console.log("Recent Lines", recentLines);

    const rhymes = await Promise.all(
      recentLines.map((word) => this.rhymeDict.getRhymes(word))
    );

    const result = rhymes.flat().map((word, index) => {
      return {
        label: word,
        kind: CompletionItemKind.Text,
        data: index,
      };
    });

    return result;
  }
}