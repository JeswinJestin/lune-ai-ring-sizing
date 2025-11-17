
import { Type } from "@google/genai";

export const IMAGE_ANALYSIS_PROMPT = `
You are a precision measurement expert specializing in analyzing images to determine ring sizes. Your task is to analyze the provided image and return a structured JSON object with your findings.

Follow these steps precisely:

1.  **Identify Reference Object:** Look for a standard, common object with known dimensions. Prioritize in this order:
    a. A standard credit/debit card (ISO/IEC 7810 ID-1 size).
    b. A specific, identifiable smartphone model (e.g., "iPhone 15 Pro", "Samsung Galaxy S23").
    c. A common, identifiable coin (e.g., "US Quarter", "1 Euro Coin").

2.  **Identify Ring Finger:** Locate the user's hand and identify the ring finger (typically the fourth finger, next to the pinky).

3.  **Perform Measurements:**
    a. If a reference object is found, measure its width in pixels and the finger's knuckle width in pixels.
    b. If NO reference object is found, you MUST still measure the finger in pixels AND use your understanding of human anthropometry and photo perspective to provide a direct estimate of the finger's width in millimeters.

4.  **Format Output:** Return a JSON object strictly adhering to the provided schema.

**CRITICAL RULES:**
- If you can't find a reference object, leave the 'referenceObject' field as null, but YOU MUST provide a value for 'finger.estimatedWidthMM'.
- If you cannot clearly see a finger or the image quality is too poor for any measurement, set 'isMeasurementPossible' to false and provide a reason in 'analysisNotes'.
- Provide all pixel measurements as integers.
- For 'knownWidthMM', use the standard width of the identified object (e.g., a credit card is 85.6mm).
`;

export const RESPONSE_JSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isMeasurementPossible: {
      type: Type.BOOLEAN,
      description: "Set to true if a finger is visible and measurable, otherwise false.",
    },
    referenceObject: {
      type: Type.OBJECT,
      description: "Details of the identified reference object. Null if not found.",
      properties: {
        type: {
          type: Type.STRING,
          description: "Type of object found (e.g., 'Credit Card', 'iPhone 15', 'US Quarter').",
        },
        knownWidthMM: {
          type: Type.NUMBER,
          description: "The standard real-world width of the object in millimeters (e.g., 85.6 for a credit card).",
        },
        measuredWidthPX: {
          type: Type.INTEGER,
          description: "The measured width of the object in the image, in pixels.",
        },
      },
    },
    finger: {
        type: Type.OBJECT,
        description: "Measurement of the user's ring finger.",
        properties: {
             measuredWidthPX: {
                type: Type.INTEGER,
                description: "The measured width of the ring finger knuckle in the image, in pixels.",
            },
             estimatedWidthMM: {
                type: Type.NUMBER,
                description: "The AI's direct estimate of the finger width in millimeters. This should ONLY be provided if no reference object is found.",
            }
        },
        required: ["measuredWidthPX"]
    },
    analysisNotes: {
      type: Type.STRING,
      description: "Any observations or reasons for failure (e.g., 'Image is too blurry', 'No clear reference object found').",
    },
  },
  required: ["isMeasurementPossible", "analysisNotes", "finger"]
};