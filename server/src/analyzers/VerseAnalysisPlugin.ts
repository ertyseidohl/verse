import { Diagnostic } from "vscode-languageserver";
import { ParsedPoem } from "../PoemParser";

export abstract class VerseAnalysisPlugin {
  public abstract getDiagnostics(parsedPoem: ParsedPoem): Promise<Diagnostic[]>;
}