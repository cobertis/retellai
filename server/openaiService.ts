import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface CallAnalysisResult {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  keyTopics: string[];
  actionItems: string[];
  customerIntent: string;
  callQuality: 'excellent' | 'good' | 'fair' | 'poor';
  notes: string;
  appointmentScheduled: boolean;
  appointmentDetails?: string;
  customerName?: string;
}

export class OpenAIService {
  async analyzeCall(transcript: string, callDuration?: number): Promise<CallAnalysisResult> {
    if (!transcript || transcript.trim().length === 0) {
      throw new Error('Transcript is required for analysis');
    }

    const durationInfo = callDuration 
      ? `\nCall duration: ${Math.floor(callDuration / 1000)} seconds`
      : '';

    const prompt = `Analyze the following phone call transcript and provide a comprehensive analysis.${durationInfo}

Transcript:
${transcript}

Please provide:
1. A brief summary (2-3 sentences) of what happened in the call
2. The overall sentiment (positive, neutral, or negative)
3. Key topics discussed (list 3-5 main topics)
4. Action items or follow-up tasks identified (if any)
5. Customer's main intent or goal for the call
6. Call quality assessment (excellent, good, fair, or poor)
7. Additional notes or observations
8. **IMPORTANT**: Did the customer schedule an appointment? (true/false)
9. If an appointment was scheduled, provide details (date, time, type of appointment)
10. **IMPORTANT**: Extract the customer's full name (first and last name) if they provided it during the call

Format your response as a JSON object with these fields:
- summary (string)
- sentiment (string: "positive", "neutral", or "negative")
- keyTopics (array of strings)
- actionItems (array of strings)
- customerIntent (string)
- callQuality (string: "excellent", "good", "fair", or "poor")
- notes (string)
- appointmentScheduled (boolean: true if customer scheduled an appointment, false otherwise)
- appointmentDetails (string, optional: details about the appointment if scheduled)
- customerName (string, optional: customer's full name if provided in the call, in format "FirstName LastName")`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert call analyst who provides detailed, actionable insights from phone call transcripts. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const analysis = JSON.parse(response) as CallAnalysisResult;
      
      // Validate the response structure
      if (!analysis.summary || !analysis.sentiment || !analysis.keyTopics) {
        throw new Error('Invalid response structure from OpenAI');
      }

      return analysis;
    } catch (error: any) {
      console.error('Error analyzing call with OpenAI:', error);
      throw new Error(`Failed to analyze call: ${error.message}`);
    }
  }

  async analyzeBatch(transcripts: { callId: string; transcript: string; durationMs?: number }[]): Promise<Map<string, CallAnalysisResult>> {
    const results = new Map<string, CallAnalysisResult>();
    
    // Process in parallel with a concurrency limit
    const batchSize = 5;
    for (let i = 0; i < transcripts.length; i += batchSize) {
      const batch = transcripts.slice(i, i + batchSize);
      const promises = batch.map(async ({ callId, transcript, durationMs }) => {
        try {
          const analysis = await this.analyzeCall(transcript, durationMs);
          results.set(callId, analysis);
        } catch (error) {
          console.error(`Error analyzing call ${callId}:`, error);
        }
      });
      
      await Promise.all(promises);
    }
    
    return results;
  }
}

export const openaiService = new OpenAIService();
