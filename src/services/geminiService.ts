import { GoogleGenAI } from "@google/genai";

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Please check your AI Studio settings.");
  }
  return new GoogleGenAI({ apiKey });
}

export async function generateLessonNotes(subject: string, topic: string, level: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [{ parts: [{ text: `Generate a detailed lesson note for ${subject} on the topic "${topic}" for ${level} students. Include objectives, introduction, main body, and conclusion.` }] }],
    config: {
      systemInstruction: "You are an expert Nigerian teacher. Provide lesson notes in a structured format suitable for primary/secondary schools. Use Markdown for formatting.",
    },
  });
  return response.text;
}

export async function generateExamQuestions(subject: string, topic: string, count: number = 10) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [{ parts: [{ text: `Generate ${count} multiple-choice exam questions for ${subject} on the topic "${topic}". Include 4 options and the correct answer for each.` }] }],
    config: {
      systemInstruction: "You are an expert examiner. Provide questions in a clear structured list using Markdown.",
    },
  });
  return response.text;
}

export async function suggestGradingComment(score: number, subject: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: [{ parts: [{ text: `Suggest a brief, encouraging grading comment for a student who scored ${score}% in ${subject}.` }] }],
  });
  return response.text;
}
