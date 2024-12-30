import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { VersePredictor } from "./VersePredictor";
import { RhymeDict, ExistingDbBehavior } from "../RhymeDict";

export default class PredictorCMUDict extends VersePredictor{
  settings: any;
  rhymeDict: RhymeDict;

  public static async create(settings: any): Promise<VersePredictor> {
    const cmuDict = new PredictorCMUDict(settings);
    await cmuDict.populateRhymeDict();
    return cmuDict;
  }

  private async populateRhymeDict() {
    this.rhymeDict = await RhymeDict.get();
  }

  public async predict(
    textDocumentPosition: TextDocumentPositionParams,
    textDocument: TextDocument
  ): Promise<CompletionItem[]> {
    if (this.rhymeDict === undefined) {
      await this.populateRhymeDict();
    }
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

    const recentLines: string[] = [
      lines[line - 3],
      lines[line - 2],
      lines[line - 1],
    ]
      .filter((l) => l)
      .map((l) => l.split(" ").slice(-1)[0])
      .filter((l) => l);

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
