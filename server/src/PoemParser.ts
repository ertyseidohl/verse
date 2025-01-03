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

  public get length(): number {
    return this.text.length;
  }
}

class Line {
  private phonemes_: Phoneme[];
  private words_: Word[];
  constructor(public text: string, public textNodes: TextNode[]) {}

  public get words(): Word[] {
    if (this.words_) {
      return this.words_;
    }
    this.words_ = this.textNodes.filter((w) => w instanceof Word);
    return this.words_;
  }

  public get phonemes(): Phoneme[] {
    if (this.phonemes_) {
      return this.phonemes_;
    }
    this.phonemes_ = this.words.map((w) => w.phonemes).flat();
    return this.phonemes_;
  }

  public get length(): number {
    return this.text.length;
  }

  public toString(): string {
    return this.textNodes.map((t) => t.toString()).join(" ");
  }
}

type TextNode = Word | string;

export class ParsedPoem {
  constructor(public lines: Line[]) {}

  public get length() {
    return this.lines.length;
  }
}

export class PoemParser {
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
