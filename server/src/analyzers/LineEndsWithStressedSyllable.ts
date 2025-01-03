import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { ParsedPoem } from "../PoemParser";
import { VerseAnalysisPlugin } from "./VerseAnalysisPlugin";

export default class LineEndsWithStressedSyllable extends VerseAnalysisPlugin {
  public async getDiagnostics(parsedPoem: ParsedPoem): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    parsedPoem.lines.forEach((line, lineIndex) => {
      if (line.phonemes[line.phonemes.length - 1].stress > 0) {
        const lastWord = line.words[line.words.length - 1];
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: {
            start: { line: lineIndex, character: line.length - lastWord.length },
            end: { line: lineIndex, character: line.length },
          },
          message: "Line ends with a stressed syllable",
        });
      }
    });
    return diagnostics;
  }
}
