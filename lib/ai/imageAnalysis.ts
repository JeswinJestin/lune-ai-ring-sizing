
import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult } from '../../types';
import { calculateRingSizeFromAI } from './sizeCalculation';
import { diameterToSize } from '../sizeConversion';
import { IMAGE_ANALYSIS_PROMPT, RESPONSE_JSON_SCHEMA } from "./prompts";

/**
 * Main orchestration function for the NEW, AI-powered image analysis pipeline.
 * It takes an image blob, sends it to the Gemini model with a sophisticated prompt,
 * parses the structured JSON response, and calculates the final ring size.
 * This replaces all previous client-side and landmark-based approaches for a more
 * robust, accurate, and flexible measurement system.
 */
export const analyzeImage = async (
    imageBlob: Blob,
): Promise<AnalysisResult> => {
    const canCallGemini = typeof process.env.API_KEY === 'string' && process.env.API_KEY.length > 0 && location.protocol === 'https:';
    if (!canCallGemini) {
        const fallbackSize = diameterToSize(18.1);
        return {
            size: fallbackSize!,
            confidence: 30,
            method: 'no_reference_fallback',
            debugInfo: { fingerWidthPx: 0 }
        };
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const imageBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(imageBlob);
        });

        const imagePart = {
            inlineData: {
                mimeType: imageBlob.type,
                data: imageBase64,
            },
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, { text: IMAGE_ANALYSIS_PROMPT }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: RESPONSE_JSON_SCHEMA,
            },
        });
        
        const jsonText = response.text.trim();
        const aiResponse = JSON.parse(jsonText);

        

        if (!aiResponse.isMeasurementPossible) {
            throw new Error(aiResponse.analysisNotes || "AI analysis determined that a measurement is not possible from the image. Please ensure the finger and reference object are clear.");
        }

        const result = calculateRingSizeFromAI(aiResponse);
        return result;

    } catch (error: any) {
        const fallbackSize = diameterToSize(18.1);
        return {
            size: fallbackSize!,
            confidence: 25,
            method: 'no_reference_fallback',
            debugInfo: { fingerWidthPx: 0 }
        };
    }
};
