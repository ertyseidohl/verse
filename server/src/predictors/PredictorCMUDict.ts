import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

export enum ExistingDbBehavior {
  IGNORE,
  REPLACE,
}

import * as sqlite from "sqlite";
import * as path from "path";
import * as fs from "fs";
import * as sqlite3 from "sqlite3";
import { VersePredictor } from "./VersePredictor";

const RHYME_DICT_URL =
  "https://svn.code.sf.net/p/cmusphinx/code/trunk/cmudict/cmudict-0.7b";

async function downloadRhymeDict(): Promise<string> {
  const response = await fetch(RHYME_DICT_URL);
  return response.text();
}

async function deleteFile(path): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    fs.unlink(path, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

class RhymeDict {
  private constructor(
    private db: sqlite.Database,
    private rhymeDictPath: string
  ) {}

  async getSyllables(word: string): Promise<[string]> {
    return this.db.get(`SELECT syllables FROM words WHERE word = ?`, [word]);
  }

  async getRhymes(word: string): Promise<string[]> {
    word = word.toUpperCase().replace(/[^A-Z]/g, "");
    const wordData = await this.db.get(
      `SELECT
        word,
        last_syllable_1,
        last_syllable_2,
        last_syllable_3
      FROM words WHERE word = ?`,
      [word]
    );
    if (!wordData) {
      console.log("!wordData");
      return [];
    }

    const [one, two, three] = await Promise.all([
      this.db.all(`SELECT word FROM words WHERE last_syllable_1 = ? LIMIT 10`, [
        wordData.last_syllable_1,
      ]),
      this.db.all(`SELECT word FROM words WHERE last_syllable_2 = ? LIMIT 3`, [
        wordData.last_syllable_2,
      ]),
      this.db.all(`SELECT word FROM words WHERE last_syllable_3 = ? LIMIT 3`, [
        wordData.last_syllable_3,
      ]),
    ]);

    const toWord = (w) => w.word;
    const result = [
      ...three.map(toWord),
      ...two.map(toWord),
      ...one.map(toWord),
    ]
      .flat()
      .slice(0, 10);

    return result;
  }

  async populate(db: sqlite.Database): Promise<void> {
    console.log("Creating words table ...");
    await db.exec(`
      CREATE TABLE IF NOT EXISTS words (
      word TEXT PRIMARY KEY,
      phonemes TEXT,
      phonemes_with_stress TEXT,
      syllable_count INTEGER,
      last_syllable_1 TEXT,
      last_syllable_2 TEXT,
      last_syllable_3 TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_last_syllable_1 ON words (last_syllable_1);
      CREATE INDEX IF NOT EXISTS idx_last_syllable_2 ON words (last_syllable_2);
      CREATE INDEX IF NOT EXISTS idx_last_syllable_3 ON words (last_syllable_3);
      `);
    console.log("Created words table");

    const rhymeDictText = await downloadRhymeDict();

    const lines = rhymeDictText.split("\n");

    await Promise.all(
      lines.map((line) => {
        try {
          if (line.length === 0 || line[0] === ";") {
            return;
          }
          const [word, allPhonemes] = line.split("  ");
          const phonemes = allPhonemes.split(" ");
          const syllableCount = phonemes.length;
          const phonemesWithStress = [...phonemes];
          const phonemesNoStress = phonemesWithStress.map((p) => {
            return p.replace(/\d/g, "");
          });
          const lastSyllables = [
            phonemesNoStress.slice(-1)[0] || "NULL",
            phonemesNoStress.slice(-2).join(" ") || "NULL",
            phonemesNoStress.slice(-3).join(" ") || "NULL",
          ];

          return db.run(
            `INSERT INTO words (
              word,
              phonemes,
              phonemes_with_stress,
              syllable_count,
              last_syllable_1,
              last_syllable_2,
              last_syllable_3
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              word,
              phonemesNoStress,
              phonemesWithStress,
              syllableCount,
              ...lastSyllables,
            ]
          );
        } catch (err) {
          console.log("Error while processing line: " + line);
          throw err;
        }
      })
    ).then(() => {
      console.log("Populated rhyme dict");
    });
  }

  static async create(
    overwrite: ExistingDbBehavior,
    rhymeDictPath: string = undefined
  ): Promise<RhymeDict> {
    if (!rhymeDictPath) {
      rhymeDictPath = path.join(".", "rhyme_dict", "rhyme_dict.db");
    }

    console.log(`Checking for rhyme dict at ${rhymeDictPath}`);
    try {
      const db_exists = fs.existsSync(rhymeDictPath);

      console.log(`DB Exists: ${db_exists}`);

      if (!db_exists) {
        console.log(`Creating new rhyme dict file at ${rhymeDictPath}`);
        fs.mkdirSync(path.dirname(rhymeDictPath), { recursive: true });
        fs.writeFileSync(rhymeDictPath, "");
      }

      let db: sqlite.Database;

      if (db_exists) {
        if (overwrite) {
          console.log(`Deleting rhyme dict at ${rhymeDictPath}`);
          await deleteFile(rhymeDictPath);
        }
      }

      console.log("Opening rhyme dict ...");

      db = await sqlite.open({
        filename: rhymeDictPath,
        driver: sqlite3.Database,
      });

      console.log("Opened rhyme dict");

      const rhymeDict = new RhymeDict(db, rhymeDictPath);

      if (!db_exists || overwrite) {
        console.log(`Populating rhyme dict at ${rhymeDictPath}`);
        await rhymeDict.populate(db);
      }

      return rhymeDict;
    } catch (err) {
      console.log(err);
      throw err;
    }
  }
}

export default class PredictorCMUDict extends VersePredictor{
  settings: any;
  rhymeDict: RhymeDict;

  public static async create(settings: any): Promise<VersePredictor> {
    const cmuDict = new PredictorCMUDict(settings);
    await cmuDict.populateRhymeDict();
    return cmuDict;
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
