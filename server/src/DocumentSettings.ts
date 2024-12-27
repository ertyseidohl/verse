import { PredictorType } from "./predictors/PredictorType";

export enum CachingStrategy {
  eager,
  lazy,
}

export interface DocumentSettings {
  showAllErrors: boolean;
  maxNumberOfProblems: number;
  caching: CachingStrategy;
  predictorType: PredictorType;
}

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  showAllErrors: false,
  maxNumberOfProblems: 1000,
  caching: CachingStrategy.eager,
  predictorType: "none",
};
