import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
const { GoogleGenerativeAI } = require("@google/generative-ai");

import { VersePredictor } from "./VersePredictor";
import { DocumentSettings } from "../DocumentSettings";
import { SchemaType } from "@google/generative-ai";

export default class PredictorGemini extends VersePredictor {
  settings: DocumentSettings;

  public static async create(settings: any): Promise<VersePredictor> {
    console.log("Creating new PredictorGemini with settings", settings);
    return new PredictorGemini(settings);
  }

  public async predict(
    textDocumentPosition: TextDocumentPositionParams,
    textDocument: TextDocument
  ): Promise<CompletionItem[]> {
    if (!this.settings.geminiApiKey) {
      throw new Error("No Gemini API key found in settings");
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

    const schema = {
      description: "List of autocomplete suggestions",
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          completion: {
            type: SchemaType.STRING,
            description:
              "Words (or phrases) that could be used to complete the poem",
            nullable: false,
          },
        },
        required: ["completion"],
      },
    };

    const genAI = new GoogleGenerativeAI(this.settings.geminiApiKey);

    let startingLetterPrompt = "";

    if (prefix[prefix.length - 1] !== " ") {
      const lastWordSoFar = prefix.split(" ").slice(-1)[0];
      startingLetterPrompt = `The last word of the poem so far is "${lastWordSoFar}". Start every possible completion with that prefix.`;
    }

    const analysisModel = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const analyzePrompt = `
    Please analyze the following poem, indicating the rhyme scheme and meter,
    as well as a three sentence synopsis of the poem's topic and tone:

    ${text.slice(-1000)}
    `;

    const analysis = (await analysisModel.generateContent(analyzePrompt)).response.text();

    const recentLines: string[] = [
      lines[line - 3],
      lines[line - 2],
      lines[line - 1],
    ]
      .filter((l) => l)
      .map((l) => l.split(" ").slice(-1)[0])
      .filter((l) => l);

    const rhymesPrompt = `
Provide lists of rhymes for the following words: ${recentLines.join(", ")}.

Return just the words that rhyme with each word, separated by commas. For example:

    "cat: bat, hat, mat"

Provide no other commentary or information.
    `;

    const rhymes = (await analysisModel.generateContent(rhymesPrompt)).response.text();

    const completionsModel = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const prompt = `You are an english teacher who is an expert in poetry.

    A student has provided you with a poem. The ten lines before where you need to work are:

POEM>>>
    ${lines.slice(line - 10, line - 1).join("\n")}
<<<END POEM

The start of the line that you are completing is:

POEM>>>
    ${prefix}
<<<END POEM

    And the end of the line that you are completing is:

POEM>>>
    ${suffix}
<<<END POEM

   ${startingLetterPrompt}

    You are providing feedback on the poem, and you want to suggest some possible completions for the part of the poem where you need to work.

    Please provide some possible completions for the student in JSON format.

    Here is an analysis of the poem. The completions returned must match the rhyme scheme, topic, and meter given:

ANALYSIS>>>
    ${analysis}
<<<END ANALYSIS

    Here are lists of words that rhyme with the last words of the previous three lines of the poem:

RHYMES>>>
    ${rhymes}
<<<END RHYMES

    Completions should be only one word, or a few words. Never more than enough to finish the current line.

    Try to avoid completions that are too similar to any existing poem.

Completion = {'completion': string}
Return: Array<Completion>
    `;

    const result = await completionsModel.generateContent(prompt);

    const responseText = result.response.text();

    try {
      const responseObjects = JSON.parse(responseText);
      return responseObjects.map((item: any, index: number) => {
        return {
          label: item.completion,
          kind: CompletionItemKind.Text,
          data: index
        };
      });
    } catch (err) {
      console.log(
        "Error parsing Gemini response as JSON: ",
        result
      );
      throw err;
    }
  }
}
