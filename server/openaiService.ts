import OpenAI from 'openai';
import type { CallAnalysisResult } from '@shared/schema';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

  async analyzeNoAppointmentReason(transcript: string, callDuration?: number): Promise<string> {
    if (!transcript || transcript.trim().length === 0) {
      return 'No transcript available to analyze';
    }

    const durationInfo = callDuration 
      ? `\nCall duration: ${Math.floor(callDuration / 1000)} seconds`
      : '';

    const prompt = `Analyze the following phone call transcript where NO appointment was scheduled.${durationInfo}

Transcript:
${transcript}

Please provide a brief summary (2-3 sentences) explaining WHY the customer did not schedule an appointment. Consider these common reasons:
- Customer was not interested
- Customer wanted to think about it / call back later
- Customer already has an appointment
- Call went to voicemail
- Call was disconnected / hung up early
- Customer had questions/objections that weren't resolved
- Wrong number / not the right person
- Customer requested information be sent first
- Other reason (explain)

Provide a clear, concise explanation in Spanish of what happened and why no appointment was scheduled.`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Eres un analista experto de llamadas telefónicas. Proporciona explicaciones claras y concisas en español sobre por qué un cliente no agendó una cita.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return 'No se pudo determinar la razón';
      }

      return response.trim();
    } catch (error: any) {
      console.error('Error analyzing no-appointment reason:', error);
      return 'Error al analizar la llamada';
    }
  }

  async classifyNames(names: string[]): Promise<{ hispanic: boolean; name: string }[]> {
    if (names.length === 0) {
      return [];
    }

    // Process in batches with parallel processing for speed
    const batchSize = 30; // Optimal size to avoid JSON truncation
    const parallelLimit = 15; // Process 15 batches at once for speed
    const totalBatches = Math.ceil(names.length / batchSize);
    
    console.log(`Starting parallel classification: ${names.length} names in ${totalBatches} batches (${parallelLimit} concurrent)`);

    // Helper function to process a single batch
    const processBatch = async (batch: string[], batchNum: number): Promise<{ hispanic: boolean; name: string }[]> => {
      const prompt = `Analyze the following list of names and determine if each person is likely Hispanic/Latino or not. 
      
Consider cultural and linguistic indicators, name origins, and common Hispanic naming patterns. 
DO NOT use simple pattern matching - analyze each name intelligently based on:
- Spanish language origin
- Common Hispanic given names and surnames
- Latin American naming conventions
- Cultural context

Names to analyze:
${batch.map((name, idx) => `${idx + 1}. ${name}`).join('\n')}

Respond with a JSON object containing an array called "classifications" where each element has:
- "name": the original name
- "hispanic": true if likely Hispanic/Latino, false otherwise

Example response format:
{
  "classifications": [
    {"name": "Maria Garcia", "hispanic": true},
    {"name": "John Smith", "hispanic": false}
  ]
}`;

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an expert in onomastics (study of names) with deep knowledge of Hispanic and Latino naming patterns. Analyze each name individually and intelligently, considering cultural and linguistic origins. Always respond with valid JSON in the requested format.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        });

        const response = completion.choices[0]?.message?.content;
        if (!response) {
          throw new Error('No response from OpenAI');
        }

        // Parse JSON response
        let batchResults: { name: string; hispanic: boolean }[] = [];
        try {
          const parsed = JSON.parse(response);
          // Extract from the "classifications" field as specified in prompt
          batchResults = parsed.classifications || [];
          
          console.log(`✓ Batch ${batchNum}: Parsed ${batchResults.length}/${batch.length} results`);
          
          if (batchResults.length === 0) {
            console.log(`⚠️  Batch ${batchNum}: No results found in response, using fallback`);
            batchResults = batch.map(name => ({ name, hispanic: false }));
          }
        } catch (parseError) {
          // If JSON is truncated, try to extract what we can
          console.log(`⚠️  Batch ${batchNum}/${totalBatches}: JSON parse failed (${parseError}), using fallback`);
          batchResults = batch.map(name => ({ name, hispanic: false }));
        }
        
        const percentComplete = Math.round((batchNum / totalBatches) * 100);
        console.log(`✓ Batch ${batchNum}/${totalBatches} complete (${percentComplete}%)`);
        
        return batchResults;
      } catch (error: any) {
        console.error(`✗ Error in batch ${batchNum}/${totalBatches}:`, error.message);
        // On error, mark all names in batch as non-hispanic (safe default)
        return batch.map(name => ({ name, hispanic: false }));
      }
    };

    // Create all batch promises
    const batches: Promise<{ hispanic: boolean; name: string }[]>[] = [];
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      batches.push(processBatch(batch, batchNum));
    }

    // Process batches with parallelism limit
    const results: { hispanic: boolean; name: string }[] = [];
    for (let i = 0; i < batches.length; i += parallelLimit) {
      const chunk = batches.slice(i, i + parallelLimit);
      const chunkResults = await Promise.all(chunk);
      results.push(...chunkResults.flat());
      
      const processedSoFar = Math.min(i + parallelLimit, batches.length);
      console.log(`Progress: ${processedSoFar}/${batches.length} batch groups processed`);
    }

    console.log(`✓ Classification complete: ${results.length} names processed`);
    return results;
  }
}

export const openaiService = new OpenAIService();
