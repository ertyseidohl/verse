import { CompletionItem, CompletionItemKind, TextDocumentPositionParams } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
const { GoogleGenerativeAI } = require("@google/generative-ai");

import { VersePredictor } from "./VersePredictor";

export default class PredictorGemini extends VersePredictor {
    settings: any;

    public static async create(settings: any): Promise<VersePredictor> {
        console.log("Creating new PredictorGemini with settings", settings);
        return new PredictorGemini(settings);
    }

    public async predict(
        textDocumentPosition: TextDocumentPositionParams,
        textDocument: TextDocument
    ): Promise<CompletionItem[]> {
        const genAI = new GoogleGenerativeAI("YOUR_API_KEY");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = "Return just a single word chosen randomly. No more than one word!";

        const result = await model.generateContent(prompt);

        return [{
            label: result,
            kind: CompletionItemKind.Text,
            data: 0
        }]; // TODO
    }
}