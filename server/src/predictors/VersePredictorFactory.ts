import PredictorGemini from "./PredictorGemini";
import PredictorCMUDict from "./PredictorCMUDict";
import { VersePredictor } from "./VersePredictor";
import { PredictorType } from "./PredictorType";
import { DocumentSettings } from "../DocumentSettings";

export class VersePredictorFactory {
    private cachedVersePredictor: VersePredictor;
    private cachedPredictorType: PredictorType;

    async get(settings: DocumentSettings): Promise<VersePredictor> {
        const predictorType: PredictorType = settings.predictorType;
        if (!this.cachedVersePredictor || this.cachedPredictorType !== predictorType) {
            if (predictorType === "gemini") {
                this.cachedVersePredictor = await PredictorGemini.create(settings);
            } else if (predictorType === "cmudict") {
                this.cachedVersePredictor = await PredictorCMUDict.create(settings);
            } else {
                throw new Error("Invalid predictor type");
            }
        }
        this.cachedPredictorType = predictorType;
        return this.cachedVersePredictor;
    }
  }