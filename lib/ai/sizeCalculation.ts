
import type { AnalysisResult, Landmark, ReferenceObject } from '../../types';
import { diameterToSize } from '../sizeConversion';

interface AiResponseData {
    referenceObject?: {
        type: ReferenceObject['type'];
        knownWidthMM: number;
        measuredWidthPX: number;
    };
    finger: {
        measuredWidthPX: number;
        estimatedWidthMM?: number;
    };
}

/**
 * Calculates the ring size from the structured data returned by the Gemini AI.
 * It uses the reference object for a high-confidence calculation if available,
 * otherwise it falls back to a lower-confidence estimation based on the finger alone.
 * @param aiData The parsed JSON response from the Gemini API call.
 * @returns A detailed AnalysisResult object.
 */
export const calculateRingSizeFromAI = (aiData: AiResponseData): AnalysisResult => {
    
    // --- Method 1: High-Confidence Calculation with Reference Object ---
    if (aiData.referenceObject && aiData.referenceObject.knownWidthMM > 0 && aiData.referenceObject.measuredWidthPX > 0) {
        const { knownWidthMM, measuredWidthPX, type } = aiData.referenceObject;
        const fingerWidthPx = aiData.finger.measuredWidthPX;

        const pixelToMmRatio = knownWidthMM / measuredWidthPX;
        const fingerWidthMm = fingerWidthPx * pixelToMmRatio;
        
        const size = diameterToSize(fingerWidthMm);
        if (!size) {
            throw new Error(`Calculated finger size (${fingerWidthMm.toFixed(2)}mm) is outside the standard range. Please retake the photo.`);
        }

        const zoneRatios = [0.95, 1.0, 0.9];
        const zones = zoneRatios.map((r, i) => {
            const w = fingerWidthMm * r;
            return { name: ['Knuckle','Mid','Tip'][i], width_mm: w, circumference_mm: w * Math.PI, confidence: 92, error_mm: 0.4 };
        });
        return { size, confidence: 95, method: 'reference_object', debugInfo: { pixelToMmRatio, fingerWidthPx, referenceObject: type }, zones };
    }
    
    // --- Method 2: Fallback to AI's Direct Estimation ---
    if (aiData.finger.estimatedWidthMM && aiData.finger.estimatedWidthMM > 0) {
        const fingerWidthMm = aiData.finger.estimatedWidthMM;

        const size = diameterToSize(fingerWidthMm);
        if (!size) {
            throw new Error(`AI-estimated finger size (${fingerWidthMm.toFixed(2)}mm) is outside the standard range. Please retake the photo, preferably with a reference object.`);
        }

        const zoneRatios = [0.95, 1.0, 0.9];
        const zones = zoneRatios.map((r, i) => {
            const w = fingerWidthMm * r;
            return { name: ['Knuckle','Mid','Tip'][i], width_mm: w, circumference_mm: w * Math.PI, confidence: 75, error_mm: 0.6 };
        });
        return { size, confidence: 70, method: 'no_reference_fallback', debugInfo: { fingerWidthPx: aiData.finger.measuredWidthPX }, zones };
    }
    
    // --- Final Fallback: If AI provides neither reference nor estimate ---
    throw new Error("Could not determine size. A reference object (like a credit card) is required for an accurate measurement. Please try again.");
};

// --- This function can be kept for other potential uses or future features, but is no longer the primary AI Scan method ---

const getDistance = (p1: Landmark, p2: Landmark): number => {
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2)
    );
};

/**
 * Estimates the ring size using MediaPipe hand landmarks.
 * This method uses the palm width as an internal reference scale.
 * @param landmarks The array of detected hand landmarks from MediaPipe.
 * @returns A detailed AnalysisResult object.
 */
export const calculateRingSizeFromLandmarks = (landmarks: Landmark[]): AnalysisResult => {
    const PALM_INDEX = 5;
    const PALM_PINKY = 17;
    const RING_FINGER_KNUCKLE = 13;
    const RING_FINGER_PIP = 14;
    const RING_FINGER_DIP = 15;
    const RING_FINGER_TIP = 16;

    const palmWidthPx = getDistance(landmarks[PALM_INDEX], landmarks[PALM_PINKY]);
    const AVG_PALM_WIDTH_MM = 79.0;
    
    if (palmWidthPx < 10) {
        throw new Error("Could not determine palm width from landmarks.");
    }

    const pixelToMmRatio = AVG_PALM_WIDTH_MM / palmWidthPx;
    const lenKnucklePx = getDistance(landmarks[RING_FINGER_KNUCKLE], landmarks[RING_FINGER_PIP]);
    const lenMidPx = getDistance(landmarks[RING_FINGER_PIP], landmarks[RING_FINGER_DIP]);
    const lenTipPx = getDistance(landmarks[RING_FINGER_DIP], landmarks[RING_FINGER_TIP]);
    const widthKnucklePx = lenKnucklePx * 0.82;
    const widthMidPx = lenMidPx * 0.78;
    const widthTipPxRaw = lenTipPx * 0.68;
    const widthTipPx = Math.min(widthMidPx * 0.95, widthTipPxRaw);
    const widthKnuckleMm = widthKnucklePx * pixelToMmRatio;
    const widthMidMm = widthMidPx * pixelToMmRatio;
    const widthTipMm = widthTipPx * pixelToMmRatio;
    const fingerWidthMm = Math.max(widthMidMm, widthKnuckleMm);
    
    const size = diameterToSize(fingerWidthMm);
     if (!size) {
        throw new Error("Calculated finger size from hand geometry is outside the standard range.");
    }

    const zones = [
        { name: 'Knuckle', width_mm: widthKnuckleMm, circumference_mm: widthKnuckleMm * Math.PI, confidence: 82, error_mm: 0.7, points: [{ x: landmarks[RING_FINGER_KNUCKLE].x, y: landmarks[RING_FINGER_KNUCKLE].y }, { x: landmarks[RING_FINGER_PIP].x, y: landmarks[RING_FINGER_PIP].y }] },
        { name: 'Mid', width_mm: widthMidMm, circumference_mm: widthMidMm * Math.PI, confidence: 80, error_mm: 0.8, points: [{ x: landmarks[RING_FINGER_PIP].x, y: landmarks[RING_FINGER_PIP].y }, { x: landmarks[RING_FINGER_DIP].x, y: landmarks[RING_FINGER_DIP].y }] },
        { name: 'Tip', width_mm: widthTipMm, circumference_mm: widthTipMm * Math.PI, confidence: 82, error_mm: 0.8, points: [{ x: landmarks[RING_FINGER_DIP].x, y: landmarks[RING_FINGER_DIP].y }, { x: landmarks[RING_FINGER_TIP].x, y: landmarks[RING_FINGER_TIP].y }] },
    ];
    return { size, confidence: 80, method: 'no_reference_fallback', debugInfo: { pixelToMmRatio, fingerWidthPx: widthKnucklePx, exclusions: { nailExcluded: true } }, zones };
};