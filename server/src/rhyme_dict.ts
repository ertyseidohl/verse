import * as sqlite from "sqlite";
import * as path from "path";
import * as fs from "fs";
import * as sqlite3 from 'sqlite3';
import { Server } from "http";

const RHYME_DICT_URL =
  "https://svn.code.sf.net/p/cmusphinx/code/trunk/cmudict/cmudict-0.7b";

async function downloadRhymeDict(): Promise<string> {
  const response = await fetch(RHYME_DICT_URL);
  return response.text();
}

export enum ExistingDbBehavior {
  IGNORE,
  REPLACE
}

export class RhymeDict {
  db: sqlite.Database;

  constructor(db: sqlite.Database) {
    this.db = db;
  }

 async getSyllables(word: string): Promise<[string]> {
    return this.db.get(
      `SELECT syllables FROM words WHERE word = ?`,
      [word]
    );
  }

  async getRhymes(word: string): Promise<string[]> {
    word = word.toUpperCase().replace(/[^A-Z]/g, "");
    const wordData = this.db.get(
      `SELECT word FROM words WHERE word = ?`,
      [word]
    );
    if (!wordData) {
      return [];
    }

    const [one, two, three] = await Promise.all([
      this.db.get(
        `SELECT last_syllable_1 FROM words WHERE word = ?`,
        [word]
      ),
      this.db.get(
        `SELECT last_syllable_2 FROM words WHERE word = ?`,
        [word]
      ),
      this.db.get(
        `SELECT last_syllable_3 FROM words WHERE word = ?`,
        [word]
      )
    ]);
    const toWord = (w) => w.word;
    return [
      ...three.slice(0, 3).map(toWord),
      ...two.slice(0, 3).map(toWord),
      ...one.slice(0, 10).map(toWord)
    ].slice(0, 10);
  }
}

async function populateRhymeDict(db: sqlite.Database, server_log: (string) => void): Promise<void> {
  server_log("Creating words table ...");
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
    server_log("Created words table");

  const rhymeDictText = await downloadRhymeDict();

  const lines = rhymeDictText.split("\n");

  await Promise.all(
    lines.map((line) => {
      try {
        if(line.length === 0 || line[0] === ';') {
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
          phonemesNoStress.slice(-3).join(" ") || "NULL"
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
          [word, phonemesNoStress, phonemesWithStress, syllableCount, ...lastSyllables]
        );
      } catch (err) {
        server_log("Error while processing line: " + line);
        throw err;
      }
    })
  ).then(() => {
    server_log("Populated rhyme dict");
  });
}

async function deleteRhymeDict(rhymeDictPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    fs.unlink(rhymeDictPath, (err) => {
      if (err) {
        reject(err);
      }
      else {
        resolve();
      }
    });
  });
}

export async function createRhymeDict(
  server_log: (string) => void,
  overwrite: ExistingDbBehavior
): Promise<RhymeDict> {
  const rhymeDictPath = path.join(".", "rhyme_dict", "rhyme_dict.db");

  server_log(`Checking for rhyme dict at ${rhymeDictPath}`);
  try {
    const db_exists = fs.existsSync(rhymeDictPath);

    server_log(`DB Exists: ${db_exists}`);

    if (!db_exists) {
      server_log(`Creating new rhyme dict file at ${rhymeDictPath}`);
      fs.mkdirSync(path.dirname(rhymeDictPath), { recursive: true });
      fs.writeFileSync(rhymeDictPath, "");
    }

    let db: sqlite.Database;

    if (db_exists) {
      if (overwrite) {
        server_log(`Deleting rhyme dict at ${rhymeDictPath}`);
        await deleteRhymeDict(rhymeDictPath);
      }
    }

    server_log("Opening rhyme dict ...");

    db = await sqlite.open({
      filename: rhymeDictPath,
      driver: sqlite3.Database,
    });

    server_log("Opened rhyme dict");

    if (!db_exists || overwrite) {
      server_log(`Populating rhyme dict at ${rhymeDictPath}`);
      await populateRhymeDict(db, server_log);
    }

    return new RhymeDict(db);
  } catch (err) {
    server_log(err);
    throw err;
  }
}
