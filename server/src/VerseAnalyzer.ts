import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { RhymeDict } from "./RhymeDict";

class Phoneme {
  public text: string;
  public stress: number;

  constructor(phoneme: string) {
    this.text = phoneme.match(/[A-Z]+/)[0];
    this.stress = phoneme.match(/\d+/) ? parseInt(phoneme.match(/\d+/)[0]) : 0;
  }

  toString(): string {
    return `${this.text}${this.stress}`;
  }
}

class Word {
  public constructor(public text: string, public phonemes: Phoneme[]) {}

  public toString(): string {
    return `${this.text} (${this.phonemes})`;
  }
}

class Line {
  private phonemes_: Phoneme[];
  constructor(public text: string, public textNodes: TextNode[]) {}

  public get phonemes(): Phoneme[] {
    if (this.phonemes_) {
      return this.phonemes_;
    }
    this.phonemes_ = this.textNodes
      .filter((w) => w instanceof Word)
      .map((w) => w.phonemes)
      .flat();
    return this.phonemes_;
  }

  public get length(): number {
    return this.text.length;
  }

  public toString() : string {
    return this.textNodes.map(t => t.toString()).join(" ");
  }
}

type TextNode = Word | string;

class ParsedPoem {
  constructor(public lines: Line[]) {}

  public get length() {
    return this.lines.length;
  }
}

class PoemParser {
  private rhymeDict: RhymeDict;

  constructor(rhymeDict: RhymeDict) {
    this.rhymeDict = rhymeDict;
  }

  private async getBufferContent(
    buffer,
    currentlyAlphabetical
  ): Promise<TextNode> {
    const bufferText = buffer.join("");
    if (currentlyAlphabetical) {
      return new Word(
        bufferText,
        await this.rhymeDict.getPhonemes(bufferText).then((s) => {
          return s.map((phoneme) => new Phoneme(phoneme));
        })
      );
    } else {
      return bufferText;
    }
  }

  private async parseLine(line: string): Promise<Line> {
    let index = 0;
    let textNodes: TextNode[] = [];
    let buffer: string[] = [];
    let currentlyAlphabetical = false;
    while (index < line.length) {
      const curr = line[index];
      if (curr.match(/[A-Za-z]/)) {
        if (!currentlyAlphabetical) {
          textNodes.push(
            await this.getBufferContent(buffer, currentlyAlphabetical)
          );
          buffer = [];
          currentlyAlphabetical = true;
        }
        buffer.push(curr);
      } else {
        if (currentlyAlphabetical) {
          textNodes.push(
            await this.getBufferContent(buffer, currentlyAlphabetical)
          );
          buffer = [];
          currentlyAlphabetical = false;
        }
        buffer.push(curr);
      }
      index++;
    }
    if (buffer.length > 0) {
      textNodes.push(
        await this.getBufferContent(buffer, currentlyAlphabetical)
      );
    }
    return new Line(line, textNodes);
  }

  public async parse(text: string): Promise<ParsedPoem> {
    const lines = text.split("\n").map((line) => this.parseLine(line));
    return new ParsedPoem(await Promise.all(lines));
  }
}

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

  private getDiagnostics(parsedPoem: ParsedPoem): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    parsedPoem.lines.forEach((line, lineIndex) => {
      if (line.phonemes[line.phonemes.length - 1].stress > 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: {
            start: { line: lineIndex, character: 0 },
            end: { line: lineIndex, character: line.length },
          },
          message: "Line ends with a stressed syllable",
        });
      }
    });
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
