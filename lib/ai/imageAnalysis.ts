
import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult, Landmark } from '../../types';
import { calculateRingSizeFromAI, calculateRingSizeFromLandmarks } from './sizeCalculation';
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
    const tryLandmarksFallback = async (): Promise<AnalysisResult | null> => {
        const Hands: any = (window as any).Hands;
        if (!Hands) return null;
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            const url = URL.createObjectURL(imageBlob);
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = url;
        });
        const offscreen = document.createElement('canvas');
        const maxW = 640;
        const aspect = img.naturalHeight / img.naturalWidth;
        offscreen.width = Math.min(maxW, img.naturalWidth);
        offscreen.height = Math.round(offscreen.width * aspect);
        const octx = offscreen.getContext('2d');
        if (!octx) { URL.revokeObjectURL(img.src); return null; }
        octx.filter = 'contrast(1.1) saturate(1.05) brightness(1.04)';
        octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
        const hands = new Hands({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        const detect = async (complexity: 1 | 2): Promise<Landmark[] | null> => {
            hands.setOptions({ maxNumHands: 1, modelComplexity: complexity, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
            return new Promise<Landmark[] | null>(async (resolve) => {
                hands.onResults((res: any) => {
                    const lm = res.multiHandLandmarks && res.multiHandLandmarks[0] ? res.multiHandLandmarks[0] : null;
                    resolve(lm);
                });
                await hands.send({ image: offscreen });
            });
        };
        let landmarks: Landmark[] | null = await detect(2);
        if (!landmarks) landmarks = await detect(1);
        hands.close();
        URL.revokeObjectURL(img.src);
        if (!landmarks) return null;
        try {
            const result = calculateRingSizeFromLandmarks(landmarks);
            return result;
        } catch {
            return null;
        }
    };
    if (!canCallGemini) {
        const landmarkResult = await tryLandmarksFallback();
        if (landmarkResult) return landmarkResult;
        throw new Error("Could not analyze the image. Please retake with better lighting and a clear view of the ring finger.");
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
        const landmarkResult = await tryLandmarksFallback();
        if (landmarkResult) return landmarkResult;
        throw new Error(error?.message || "AI analysis failed. Please retake the photo with steady framing and good lighting.");
    }
};
