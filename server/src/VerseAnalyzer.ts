import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { RhymeDict } from "./RhymeDict";
import { PoemParser } from "./PoemParser";
import * as VerseAnalysisPlugns from "./analyzers/VerseAnalysisPlugins";

export class VerseAnalyzer {
  private settings: any;
  private rhymeDict: RhymeDict;

  constructor(settings: any) {
    this.settings = settings;
    this.createRhymeDict();
  }

  private async createRhymeDict(): Promise<void> {
    this.rhymeDict = await RhymeDict.get();
  }

  public async analyze(document: TextDocument): Promise<Diagnostic[]> {
    if (this.rhymeDict === undefined) {
      await this.createRhymeDict();
    }
    const poemParser = new PoemParser(this.rhymeDict);
    const parsedPoem = await poemParser.parse(document.getText());
    const diagnostics = await this.getDiagnostics(parsedPoem);
    return this.validateDiagnostics(diagnostics);
  }

  private async getDiagnostics(parsedPoem: any): Promise<Diagnostic[]> {
    const diagnostics = [];
    for (const pluginName in VerseAnalysisPlugns) {
      const plugin = new VerseAnalysisPlugns[pluginName]();
      diagnostics.push(... await plugin.getDiagnostics(parsedPoem));
    }
    return diagnostics;
  }

  private validateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    // Validate diagnostic ranges before sending
    return diagnostics.filter((diagnostic) => {
      console.log("Validating diagnostic range", diagnostic);
      const isValid =
        diagnostic.range &&
        diagnostic.range.start &&
        diagnostic.range.end &&
        typeof diagnostic.range.start.line === "number" &&
        typeof diagnostic.range.start.character === "number" &&
        typeof diagnostic.range.end.line === "number" &&
        typeof diagnostic.range.end.character === "number";

      if (!isValid) {
        console.log("Invalid diagnostic range detected", diagnostic);
      }
      return isValid;
    });
  }
}
