import { Diagnostic } from "vscode-languageserver";
import { ParsedPoem } from "../PoemParser";
import { VerseAnalysisPlugin } from "./VerseAnalysisPlugin";

export class LinesOutOfMeter extends VerseAnalysisPlugin {
    public getDiagnostics(parsedPoem: ParsedPoem): Promise<Diagnostic[]> {
        // TODO
        return Promise.resolve([]);
    }
}