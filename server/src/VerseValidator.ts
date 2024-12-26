import { Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

export class VerseValidator {
  private settings: any;

  constructor(settings: any) {
    this.settings = settings;
  }

  public async validate(textDocument: TextDocument): Promise<Diagnostic[]> {
    const diagnostics = []; // TODO
    return this.validateDiagnostics(diagnostics);
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
