import { GoogleGenAI } from "@google/genai";

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Set GEMINI_API_KEY in your environment (.env).");
  }
  return new GoogleGenAI({ apiKey });
}

export async function generateLessonNotes(subject: string, topic: string, level: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: `Generate a detailed lesson note for ${subject} on the topic "${topic}" for ${level} students in Nigeria. Include objectives, introduction, main body, activities, and conclusion.` }] }],
    config: {
      systemInstruction: "You are an expert Nigerian teacher following the NERDC curriculum. Provide lesson notes in a structured format suitable for primary/secondary schools. Use Markdown for formatting.",
    },
  });
  return response.text;
}

export async function generateExamQuestions(subject: string, topic: string, count: number = 10) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: `Generate ${count} multiple-choice exam questions for ${subject} on the topic "${topic}" suitable for Nigerian secondary school students. Include 4 options and the correct answer for each.` }] }],
    config: {
      systemInstruction: "You are an expert examiner following WAEC/NECO standards. Provide questions in a clear structured list using Markdown.",
    },
  });
  return response.text;
}

export async function suggestGradingComment(score: number, subject: string, studentName?: string) {
  const ai = getAI();
  const name = studentName || 'the student';
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{ parts: [{ text: `Write a brief (2-3 sentences), encouraging teacher's comment for ${name} who scored ${score}% in ${subject}. Be specific and constructive, appropriate for a Nigerian school report card.` }] }],
  });
  return response.text;
}

export async function generateReportSummary(
  studentName: string,
  grades: { subject: string; total: number; grade: string }[],
  attendanceRate: number
) {
  const ai = getAI();
  const gradeList = grades.map(g => `${g.subject}: ${g.total}% (${g.grade})`).join(', ');
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{ parts: [{ text: `Write a principal/headteacher's overall comment for ${studentName}'s end-of-term report card. Grades: ${gradeList}. Attendance rate: ${attendanceRate}%. Keep it to 3-4 sentences, professional and encouraging, suitable for a Nigerian school.` }] }],
  });
  return response.text;
}

export async function generatePayrollSummary(
  month: string,
  totalStaff: number,
  totalGross: number,
  totalNet: number,
  totalPension: number,
  totalPaye: number
) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{ parts: [{ text: `Generate a brief payroll summary report for ${month}. Total staff: ${totalStaff}. Total gross pay: ₦${totalGross.toLocaleString()}. Total pension deductions: ₦${totalPension.toLocaleString()}. Total PAYE tax: ₦${totalPaye.toLocaleString()}. Total net pay: ₦${totalNet.toLocaleString()}. Keep it concise and professional for a Nigerian school's finance report.` }] }],
  });
  return response.text;
}

export async function suggestAttendanceAlert(
  studentName: string,
  attendanceRate: number,
  totalAbsent: number
) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{ parts: [{ text: `Draft a brief, professional SMS/notification message to the parent of ${studentName}, who has an attendance rate of ${attendanceRate}% with ${totalAbsent} absences. The message should be polite, concerned, and urge parental involvement. Max 2 sentences.` }] }],
  });
  return response.text;
}

export async function generateCurriculumObjective(subject: string, topic: string, level: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{ parts: [{ text: `Write a clear learning objective for the topic "${topic}" in ${subject} for ${level} students, aligned with the Nigerian NERDC curriculum. One sentence only.` }] }],
  });
  return response.text;
}

export async function generateStudentInsights(
  studentName: string,
  studentClass: string,
  grades: { subject: string; total: number; grade: string }[],
  attendanceRate: number,
  skills?: Record<string, string>
) {
  const ai = getAI();
  const gradeList = grades.map(g => `${g.subject}: ${g.total}% (${g.grade})`).join(', ');
  const skillList = skills ? Object.entries(skills).map(([k, v]) => `${k}: ${v}`).join(', ') : 'Not recorded';
  const prompt = `You are an educational analyst for a Nigerian school. Analyse this student's academic data and provide a structured insight report.

Student: ${studentName}
Class: ${studentClass}
Grades: ${gradeList || 'No grades recorded yet'}
Attendance Rate: ${attendanceRate}%
Skills Assessment: ${skillList}

Provide a JSON response with exactly this structure:
{
  "overallRemark": "2-3 sentence overall performance summary",
  "strengths": ["subject or skill 1", "subject or skill 2"],
  "weaknesses": ["subject or skill 1", "subject or skill 2"],
  "recommendations": ["specific actionable recommendation 1", "specific actionable recommendation 2", "specific actionable recommendation 3"],
  "trend": "improving" | "stable" | "declining",
  "riskLevel": "low" | "medium" | "high"
}

Base riskLevel on attendance + weakest grades. Be specific and constructive, using Nigerian school context.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
    },
  });
  try {
    return JSON.parse(response.text || '{}');
  } catch {
    return null;
  }
}

export async function summarizeCurriculumDocument(
  text: string,
  subject: string,
  level: string
): Promise<{ keyTopics: string[]; learningObjectives: string[]; assessmentFocus: string[]; rawSummary: string }> {
  const ai = getAI();
  const prompt = `You are an expert Nigerian curriculum specialist following the NERDC framework.
Analyse the following curriculum document for ${subject} at ${level} level.

Document content:
---
${text.slice(0, 15000)}
---

Return a JSON object with exactly this structure:
{
  "keyTopics": ["topic 1", "topic 2", "topic 3"],
  "learningObjectives": ["objective 1", "objective 2"],
  "assessmentFocus": ["focus area 1", "focus area 2"],
  "rawSummary": "A 200-300 word plain-text summary of the document content, key themes, and curriculum alignment suitable for injecting into AI prompts."
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' },
  });
  try {
    return JSON.parse(response.text || '{}');
  } catch {
    return { keyTopics: [], learningObjectives: [], assessmentFocus: [], rawSummary: response.text || '' };
  }
}

export async function generateQuestionsFromCurriculum(
  subject: string,
  topic: string,
  count: number,
  level: string,
  curriculumContext: string
): Promise<{ questionText: string; options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[]; correctAnswer: 'A' | 'B' | 'C' | 'D'; difficulty: 'easy' | 'medium' | 'hard' }[]> {
  const ai = getAI();
  const prompt = `You are an expert WAEC/NECO examiner for Nigerian secondary schools.
Using the following curriculum context, generate ${count} multiple-choice questions for ${subject} — topic: "${topic}", class level: ${level}.

Curriculum context:
${curriculumContext}

Return a JSON array with exactly this structure (no extra keys):
[
  {
    "questionText": "Question text here?",
    "options": [
      {"label": "A", "text": "option text"},
      {"label": "B", "text": "option text"},
      {"label": "C", "text": "option text"},
      {"label": "D", "text": "option text"}
    ],
    "correctAnswer": "A",
    "difficulty": "medium"
  }
]`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' },
  });
  try {
    return JSON.parse(response.text || '[]');
  } catch {
    return [];
  }
}

export async function generateQuestionBatch(
  subject: string,
  level: string,
  topics: string[],
  count: number,
  context?: string
): Promise<{ questionText: string; topic: string; options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[]; correctAnswer: 'A' | 'B' | 'C' | 'D'; difficulty: 'easy' | 'medium' | 'hard' }[]> {
  const ai = getAI();
  const topicList = topics.join(', ');
  const contextSection = context ? `\nCurriculum context:\n${context}\n` : '';
  const prompt = `You are an expert WAEC/NECO examiner for Nigerian secondary schools.
Generate ${count} multiple-choice questions for ${subject} at ${level} level, covering these topics: ${topicList}.${contextSection}
Distribute questions across topics. Mix difficulty levels.

Return a JSON array:
[
  {
    "questionText": "...",
    "topic": "topic name",
    "options": [
      {"label": "A", "text": "..."},
      {"label": "B", "text": "..."},
      {"label": "C", "text": "..."},
      {"label": "D", "text": "..."}
    ],
    "correctAnswer": "B",
    "difficulty": "easy"
  }
]`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' },
  });
  try {
    return JSON.parse(response.text || '[]');
  } catch {
    return [];
  }
}

export async function generateFeeReminderDraft(
  studentName: string,
  guardianName: string,
  amount: number,
  description: string,
  dueDate: string,
  daysOverdue?: number
) {
  const ai = getAI();
  const overdueText = daysOverdue && daysOverdue > 0
    ? `This fee is ${daysOverdue} day(s) overdue.`
    : `The due date is ${dueDate}.`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{ parts: [{ text: `Write a professional, firm but respectful fee payment reminder letter for a Nigerian school. 
Details:
- Student: ${studentName}
- Guardian: ${guardianName}
- Fee: ${description}
- Amount: ₦${amount.toLocaleString()}
- ${overdueText}

Write 2–3 short paragraphs. Include a call to action (contact the bursar or make payment within 7 days). Keep a formal, professional tone.` }] }],
  });
  return response.text;
}
