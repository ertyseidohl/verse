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

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    let startingLetterPrompt = "";

    console.log("prefix", prefix);
    console.log("suffix", suffix);
    console.log("lastChar", prefix[prefix.length - 1]);


    if (prefix[prefix.length - 1] !== " ") {
      const lastWordSoFar = prefix.split(" ").slice(-1)[0];
      console.log("lastWordSoFar", lastWordSoFar);
      startingLetterPrompt = `The last word of the poem so far is "${lastWordSoFar}". Start every possible completion with that prefix.`;
    }

    const prompt = `You are an english teacher who is an expert in poetry.

    A student has provided you with a poem. The ten lines before where you need to work are:

POEM>>>
    ${prefix}
<<<END POEM

    And the content following where you need to work is:

POEM>>>
    ${suffix}
<<<END POEM

   ${startingLetterPrompt}

    You are providing feedback on the poem, and you want to suggest some possible completions for the part of the poem where you need to work.

    Please provide some possible completions for the student in JSON format.

    For example, if the poem so far is "Roses are red, violets are blue," consider the following completions:

EXAMPLE>>>
    [
      {completion: "sugar"},
      {completion: "sugar is sweet"},
      {completion: "sugar is sweet, and so are you"}
    ]
<<<END EXAMPLE

    Provide only short completions, matching the topic, rhyme, and meter of the existing poem.

    Completions should be only one word, or a few words. Never more than enough to finish the current line.

    Try to avoid completions that are too similar to any existing poem.

Completion = {'completion': string}
Return: Array<Completion>
    `;

    const result = await model.generateContent(prompt);

    const responseText = result.response.text();

    console.log("responseText", responseText);

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
