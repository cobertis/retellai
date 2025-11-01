import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { retellService } from "./retellService";
import { openaiService } from "./openaiService";
import { isAuthenticated } from "./auth";
import passport from "passport";
import bcrypt from "bcrypt";
import multer from "multer";
import csvParser from "csv-parser";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  insertAgentSchema,
  insertPhoneListSchema,
  insertPhoneNumberSchema,
  insertCampaignSchema,
  insertUserSchema,
  loginSchema,
} from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage() });

function getUserId(req: Request): string {
  const user = req.user as any;
  return user.id;
}

// Helper function to process calls with concurrency limit
async function processConcurrently<T>(
  items: T[],
  concurrencyLimit: number,
  processor: (item: T) => Promise<void>
): Promise<void> {
  const results: Promise<void>[] = [];
  let index = 0;

  async function processNext(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      await processor(items[currentIndex]);
    }
  }

  // Start initial batch
  for (let i = 0; i < Math.min(concurrencyLimit, items.length); i++) {
    results.push(processNext());
  }

  await Promise.all(results);
}

export function registerRoutes(app: Express) {
  // Auth endpoints
  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = insertUserSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      const user = await storage.createUser(email, hashedPassword, firstName || undefined, lastName || undefined);
      
      // Log them in
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Error logging in" });
        }
        res.status(201).json(user);
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/login", (req: Request, res: Response, next) => {
    try {
      loginSchema.parse(req.body);
    } catch (error: any) {
      return res.status(400).json({ message: "Invalid email or password format" });
    }

    passport.authenticate('local', (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Internal server error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Incorrect email or password" });
      }
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Error logging in" });
        }
        res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Error logging out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // User info endpoint
  app.get("/api/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update user settings
  app.patch("/api/user/settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { defaultAgentId, calcomApiKey, calcomEventTypeId } = z.object({
        defaultAgentId: z.string().nullable().optional(),
        calcomApiKey: z.string().nullable().optional(),
        calcomEventTypeId: z.string().nullable().optional(),
      }).parse(req.body);
      
      // Build settings object with proper null handling
      const settings: any = {};
      
      // For defaultAgentId, keep undefined behavior (empty = don't change)
      if (defaultAgentId !== undefined) {
        settings.defaultAgentId = defaultAgentId?.trim() || undefined;
      }
      
      // For Cal.com fields, allow explicit null to clear values
      if (calcomApiKey !== undefined) {
        if (calcomApiKey === null) {
          settings.calcomApiKey = null;
        } else {
          const trimmed = calcomApiKey.trim();
          settings.calcomApiKey = trimmed === '' ? null : trimmed;
        }
      }
      if (calcomEventTypeId !== undefined) {
        if (calcomEventTypeId === null) {
          settings.calcomEventTypeId = null;
        } else {
          const trimmed = calcomEventTypeId.trim();
          settings.calcomEventTypeId = trimmed === '' ? null : trimmed;
        }
      }
      
      const user = await storage.updateUserSettings(userId, settings);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Agent endpoints
  app.get("/api/agents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const agents = await storage.listAgents(userId);
      res.json(agents);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/agents/connect", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { agentId } = z.object({
        agentId: z.string().min(1),
      }).parse(req.body);

      // Get agent details from Retell AI
      const retellAgent = await retellService.getAgent(agentId);

      // Check if agent already exists in database
      const existingAgent = await storage.getAgent(agentId);
      if (existingAgent) {
        return res.status(400).json({ message: "Agent already connected" });
      }

      // Store in our database
      const agent = await storage.createAgent(userId, {
        id: retellAgent.agent_id,
        name: retellAgent.agent_name || "Unnamed Agent",
        voiceId: retellAgent.voice_id || "default",
        language: retellAgent.language || "en-US",
        responseEngineType: retellAgent.response_engine?.type || "retell-llm",
        generalPrompt: (retellAgent as any).general_prompt || null,
        responsiveness: retellAgent.responsiveness || 1,
        interruptionSensitivity: retellAgent.interruption_sensitivity || 1,
        llmId: (retellAgent as any).llm_id || null,
        generalTools: (retellAgent as any).general_tools || null,
        metadata: (retellAgent as any).metadata || null,
      });

      res.status(201).json(agent);
    } catch (error: any) {
      console.error("Error connecting agent:", error);
      res.status(400).json({ message: error.message || "Failed to connect agent. Make sure the Agent ID is correct." });
    }
  });

  app.post("/api/agents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const validatedData = insertAgentSchema.parse(req.body);

      // Create agent in Retell AI
      const retellAgent = await retellService.createAgent({
        agent_name: validatedData.name,
        voice_id: validatedData.voiceId,
        language: validatedData.language || undefined,
        response_engine: {
          type: validatedData.responseEngineType,
        },
        general_prompt: validatedData.generalPrompt || undefined,
        responsiveness: validatedData.responsiveness || undefined,
        interruption_sensitivity: validatedData.interruptionSensitivity || undefined,
      });

      // Store in our database
      const agent = await storage.createAgent(userId, {
        name: validatedData.name,
        voiceId: validatedData.voiceId,
        language: validatedData.language,
        responseEngineType: validatedData.responseEngineType,
        generalPrompt: validatedData.generalPrompt,
        responsiveness: validatedData.responsiveness,
        interruptionSensitivity: validatedData.interruptionSensitivity,
      });

      res.status(201).json(agent);
    } catch (error: any) {
      console.error("Error creating agent:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/agents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      // Delete from Retell AI
      await retellService.deleteAgent(id);
      
      // Delete from our database
      await storage.deleteAgent(id);
      
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting agent:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Phone List endpoints
  app.get("/api/phone-lists", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const lists = await storage.listPhoneLists(userId);
      res.json(lists);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/phone-lists", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const validatedData = insertPhoneListSchema.parse(req.body);
      
      const list = await storage.createPhoneList(userId, {
        name: validatedData.name,
        description: validatedData.description,
        classification: validatedData.classification,
        tags: validatedData.tags,
        totalNumbers: 0,
      });
      
      res.status(201).json(list);
    } catch (error: any) {
      console.error("Error creating phone list:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/phone-lists/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const list = await storage.getPhoneList(id);
      
      if (!list) {
        return res.status(404).json({ message: "Phone list not found" });
      }
      
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/phone-lists/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validatedData = insertPhoneListSchema.partial().parse(req.body);
      
      const list = await storage.updatePhoneListDetails(id, validatedData);
      
      if (!list) {
        return res.status(404).json({ message: "Phone list not found" });
      }
      
      res.json(list);
    } catch (error: any) {
      console.error("Error updating phone list:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/phone-lists/:id/upload", isAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).send("No file uploaded");
      }

      const list = await storage.getPhoneList(id);
      if (!list) {
        return res.status(404).send("Phone list not found");
      }

      // Parse CSV
      const phoneNumbers: any[] = [];
      const stream = Readable.from(file.buffer);

      await new Promise<void>((resolve, reject) => {
        stream
          .pipe(csvParser())
          .on('data', (row: any) => {
            // Normalize column names to lowercase for case-insensitive matching
            const normalizedRow: any = {};
            Object.keys(row).forEach(key => {
              normalizedRow[key.toLowerCase()] = row[key];
            });
            
            // Try to find phone number in various column names
            const phoneNumber = normalizedRow.phonenumber || 
                              normalizedRow.phone || 
                              normalizedRow.number || 
                              normalizedRow.tel || 
                              normalizedRow.telephone;
            
            // Only add rows with valid phone numbers
            if (phoneNumber && phoneNumber.toString().trim()) {
              // Normalize phone number to E.164 format
              let normalizedPhone = phoneNumber.toString().trim();
              if (!normalizedPhone.startsWith('+')) {
                // Remove all non-numeric characters
                const digitsOnly = normalizedPhone.replace(/[^0-9]/g, '');
                // If it starts with 1, use as is, otherwise add 1 prefix (for US numbers)
                normalizedPhone = digitsOnly.startsWith('1') ? `+${digitsOnly}` : `+1${digitsOnly}`;
              }
              
              phoneNumbers.push({
                listId: id,
                phoneNumber: normalizedPhone,
                firstName: normalizedRow.firstname || 
                          normalizedRow.first_name || 
                          normalizedRow.name || 
                          null,
                lastName: normalizedRow.lastname || 
                         normalizedRow.last_name || 
                         null,
                email: normalizedRow.email || null,
                metadata: row,
              });
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });

      if (phoneNumbers.length === 0) {
        return res.status(400).json({ 
          message: "No valid phone numbers found in the CSV file. Make sure your CSV has a column named 'phoneNumber', 'phone', or 'number'." 
        });
      }

      // Save phone numbers
      await storage.createPhoneNumbers(phoneNumbers);
      
      // Update list total
      await storage.updatePhoneList(id, phoneNumbers.length);

      res.json({ message: `Uploaded ${phoneNumbers.length} phone numbers` });
    } catch (error: any) {
      console.error("Error uploading CSV:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/phone-lists/:id/numbers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const numbers = await storage.getPhoneNumbersByList(id);
      res.json(numbers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/phone-lists/:id/numbers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validatedData = insertPhoneNumberSchema.omit({ listId: true }).parse(req.body);
      
      const number = await storage.createPhoneNumber({
        ...validatedData,
        listId: id,
      });
      
      // Update list total count
      const numbers = await storage.getPhoneNumbersByList(id);
      await storage.updatePhoneList(id, numbers.length);
      
      res.status(201).json(number);
    } catch (error: any) {
      console.error("Error creating phone number:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/phone-lists/:listId/numbers/:numberId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { numberId } = req.params;
      const validatedData = insertPhoneNumberSchema.omit({ listId: true }).partial().parse(req.body);
      
      const number = await storage.updatePhoneNumber(numberId, validatedData);
      
      if (!number) {
        return res.status(404).json({ message: "Phone number not found" });
      }
      
      res.json(number);
    } catch (error: any) {
      console.error("Error updating phone number:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/phone-lists/:listId/numbers/:numberId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { listId, numberId } = req.params;
      
      await storage.deletePhoneNumber(numberId);
      
      // Update list total count
      const numbers = await storage.getPhoneNumbersByList(listId);
      await storage.updatePhoneList(listId, numbers.length);
      
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting phone number:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/phone-lists/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deletePhoneList(id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting phone list:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Campaign endpoints
  app.get("/api/campaigns", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const campaigns = await storage.listCampaigns(userId);
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/campaigns", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { name, agentId, listId, startImmediately } = req.body;
      
      if (!agentId || !listId) {
        return res.status(400).json({ message: "Agent and phone list are required" });
      }

      // Get agent and list details for campaign name
      const agent = await storage.getAgent(agentId);
      const list = await storage.getPhoneList(listId);
      
      if (!agent || !list) {
        return res.status(404).json({ message: "Agent or phone list not found" });
      }

      // Use custom name if provided, otherwise generate automatically
      const campaignName = name?.trim() || `${agent.name} - ${list.name}`;
      
      const campaign = await storage.createCampaign(userId, {
        name: campaignName,
        description: null,
        agentId,
        listId,
        fromNumber: null,
        status: 'draft',
        totalCalls: 0,
        completedCalls: 0,
        failedCalls: 0,
        inProgressCalls: 0,
      });

      // If startImmediately is true, start the campaign right away
      if (startImmediately) {
        const phoneNumbers = await storage.getPhoneNumbersByList(listId);
        
        if (phoneNumbers.length === 0) {
          return res.status(400).json({ message: "No phone numbers in list" });
        }

        await storage.updateCampaignStatus(campaign.id, 'active');
        await storage.updateCampaignStats(campaign.id, {
          totalCalls: phoneNumbers.length,
          startedAt: new Date(),
        });

        // Start making calls with concurrency limit of 20
        await processConcurrently(phoneNumbers, 20, async (phoneNumber) => {
          try {
            const fromNum = campaign.fromNumber || process.env.DEFAULT_FROM_NUMBER || '+18046689791';
            const retellCall = await retellService.createPhoneCall({
              from_number: fromNum,
              to_number: phoneNumber.phoneNumber,
              override_agent_id: agentId,
              metadata: {
                campaignId: campaign.id,
                listId,
                phoneNumberId: phoneNumber.id,
              },
            });

            const toNumber = phoneNumber.phoneNumber.startsWith('+') 
              ? phoneNumber.phoneNumber 
              : `+1${phoneNumber.phoneNumber.replace(/[^0-9]/g, '')}`;
              
            await storage.createCall({
              id: retellCall.call_id,
              userId,
              campaignId: campaign.id,
              agentId,
              fromNumber: fromNum,
              toNumber: toNumber,
              callStatus: retellCall.call_status || 'queued',
              startTimestamp: retellCall.start_timestamp ? new Date(retellCall.start_timestamp) : null,
              endTimestamp: retellCall.end_timestamp ? new Date(retellCall.end_timestamp) : null,
              durationMs: retellCall.duration_ms || null,
              disconnectionReason: retellCall.disconnection_reason || null,
            });

            await storage.createCallLog({
              id: randomUUID(),
              callId: retellCall.call_id,
              transcript: null,
              recordingUrl: null,
              callSummary: null,
              callSuccessful: null,
              userSentiment: null,
              inVoicemail: null,
            });

            // Atomic increment - no race conditions
            await storage.incrementCampaignInProgress(campaign.id);
          } catch (error) {
            console.error("Error creating call:", error);
            // Atomic increment - no race conditions
            await storage.incrementCampaignFailed(campaign.id);
          }
        });
      }
      
      res.status(201).json(campaign);
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/campaigns/:id/start", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);

      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Get phone numbers from the list
      const phoneNumbers = await storage.getPhoneNumbersByList(campaign.listId);
      
      if (phoneNumbers.length === 0) {
        return res.status(400).json({ message: "No phone numbers in list" });
      }

      // Update campaign status
      await storage.updateCampaignStatus(id, 'active');
      await storage.updateCampaignStats(id, {
        totalCalls: phoneNumbers.length,
        startedAt: new Date(),
      });

      // Start making calls with concurrency limit of 20
      await processConcurrently(phoneNumbers, 20, async (phoneNumber) => {
        try {
          // Create call in Retell AI
          const fromNum = campaign.fromNumber || process.env.DEFAULT_FROM_NUMBER || '+18046689791';
          const retellCall = await retellService.createPhoneCall({
            from_number: fromNum,
            to_number: phoneNumber.phoneNumber,
            override_agent_id: campaign.agentId,
            metadata: {
              campaignId: id,
              listId: campaign.listId,
              phoneNumberId: phoneNumber.id,
            },
          });

          // Store call in our database  
          const toNumber = phoneNumber.phoneNumber.startsWith('+') 
            ? phoneNumber.phoneNumber 
            : `+1${phoneNumber.phoneNumber.replace(/[^0-9]/g, '')}`;
            
          await storage.createCall({
            id: retellCall.call_id,
            userId,
            campaignId: id,
            agentId: campaign.agentId,
            fromNumber: fromNum,
            toNumber: toNumber,
            callStatus: retellCall.call_status || 'queued',
            startTimestamp: retellCall.start_timestamp ? new Date(retellCall.start_timestamp) : null,
            endTimestamp: retellCall.end_timestamp ? new Date(retellCall.end_timestamp) : null,
            durationMs: retellCall.duration_ms || null,
            disconnectionReason: retellCall.disconnection_reason || null,
          });

          // Create call log
          await storage.createCallLog({
            id: randomUUID(),
            callId: retellCall.call_id,
            transcript: null,
            recordingUrl: null,
            callSummary: null,
            callSuccessful: null,
            userSentiment: null,
            inVoicemail: null,
          });
        } catch (error) {
          console.error("Error creating call:", error);
        }
      });

      res.json({ message: "Campaign started successfully" });
    } catch (error: any) {
      console.error("Error starting campaign:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Stop/pause a campaign
  app.post("/api/campaigns/:id/stop", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);

      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (campaign.status !== 'active') {
        return res.status(400).json({ message: "Campaign is not active" });
      }

      await storage.stopCampaign(id);

      const updatedCampaign = await storage.getCampaign(id);
      res.json(updatedCampaign);
    } catch (error: any) {
      console.error("Error stopping campaign:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Delete a campaign
  app.delete("/api/campaigns/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);

      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.deleteCampaign(id);

      res.json({ message: "Campaign deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Call endpoints
  app.get("/api/calls", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const calls = await storage.listCalls(userId);
      res.json(calls);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/calls/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      let call = await storage.getCall(id);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      // If call is missing critical data, sync from Retell API
      const needsSync = !call.startTimestamp || !call.endTimestamp || !call.durationMs;
      if (needsSync && call.id) {
        try {
          const retellCall = await retellService.getCall(call.id);
          
          // Update call with data from Retell
          if (retellCall) {
            // Update call status and times
            await storage.updateCall(call.id, {
              callStatus: retellCall.call_status || call.callStatus,
              startTimestamp: retellCall.start_timestamp ? new Date(retellCall.start_timestamp) : call.startTimestamp,
              endTimestamp: retellCall.end_timestamp ? new Date(retellCall.end_timestamp) : call.endTimestamp,
              durationMs: retellCall.duration_ms || call.durationMs,
              disconnectionReason: retellCall.disconnection_reason || call.disconnectionReason,
            });
            
            // Update call log if available
            if (retellCall.transcript || retellCall.call_analysis) {
              await storage.updateCallLog(call.id, {
                transcript: retellCall.transcript || null,
                transcriptObject: retellCall.transcript_object || null,
                transcriptWithToolCalls: retellCall.transcript_with_tool_calls || null,
                recordingUrl: retellCall.recording_url || null,
                recordingMultiChannelUrl: retellCall.recording_multi_channel_url || null,
                publicLogUrl: retellCall.public_log_url || null,
                callAnalysis: retellCall.call_analysis || null,
                callSummary: retellCall.call_analysis?.call_summary || null,
                callSuccessful: retellCall.call_analysis?.call_successful ?? null,
                userSentiment: retellCall.call_analysis?.user_sentiment || null,
                inVoicemail: retellCall.call_analysis?.in_voicemail ?? null,
                customAnalysisData: retellCall.call_analysis?.custom_analysis_data || null,
                callCost: retellCall.call_cost || null,
                llmTokenUsage: retellCall.llm_token_usage || null,
                latency: retellCall.latency || null,
              });
            }
            
            // Fetch updated call
            call = await storage.getCall(id);
          }
        } catch (syncError: any) {
          console.error('Error syncing call from Retell:', syncError);
          // Continue with existing data even if sync fails
        }
      }
      
      res.json(call);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/calls/:id/log", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const log = await storage.getCallLog(id);
      
      if (!log) {
        return res.status(404).json({ message: "Call log not found" });
      }
      
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get complete call details from Retell API
  app.get("/api/calls/:id/retell-details", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      
      // Get local call data
      const localCall = await storage.getCall(id);
      if (!localCall) {
        return res.status(404).json({ message: "Call not found in local database" });
      }

      // Security: Verify call belongs to authenticated user
      if (localCall.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Get data from Retell API
      const retellCall = await retellService.getCall(id);

      // Get all available calls list from Retell (for context)
      const allRetellCalls = await retellService.listCalls();

      // Combine all information
      const completeData = {
        localDatabase: localCall,
        retellApi: retellCall,
        retellCallsList: allRetellCalls,
        metadata: {
          fetchedAt: new Date().toISOString(),
          source: 'Combined from local DB and Retell API'
        }
      };

      res.json(completeData);
    } catch (error: any) {
      console.error('Error fetching complete call details:', error);
      res.status(500).json({ 
        message: error.message,
        error: error.toString()
      });
    }
  });

  // Sync call status from Retell API
  app.post("/api/calls/sync-status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      
      // Get all active/in-progress calls from our database
      const activeCalls = await storage.getActiveCalls(userId);
      
      if (activeCalls.length === 0) {
        return res.json({ message: "No active calls to sync", synced: 0 });
      }

      let synced = 0;
      let errors = 0;

      // Sync each call with Retell API
      for (const call of activeCalls) {
        try {
          const retellCall = await retellService.getCall(call.id);
          
          // Update call status if changed
          if (retellCall.call_status && retellCall.call_status !== call.callStatus) {
            await storage.updateCallStatus(
              call.id,
              retellCall.call_status,
              retellCall.end_timestamp ? new Date(retellCall.end_timestamp) : undefined,
              retellCall.duration_ms,
              retellCall.disconnection_reason
            );
            synced++;
          }
        } catch (error) {
          console.error(`Error syncing call ${call.id}:`, error);
          errors++;
        }
      }

      res.json({ 
        message: `Synced ${synced} calls`,
        synced,
        errors,
        total: activeCalls.length
      });
    } catch (error: any) {
      console.error('Error syncing call status:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Analyze a single call with ChatGPT
  app.post("/api/calls/:id/analyze", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      
      // Get the call
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      // Security check
      if (call.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Get the call log with transcript
      const callLog = await storage.getCallLog(id);
      if (!callLog?.transcript) {
        return res.status(400).json({ message: "No transcript available for this call" });
      }
      
      // Analyze with ChatGPT
      const analysis = await openaiService.analyzeCall(callLog.transcript, call.durationMs || undefined);
      
      // Store the analysis
      await storage.updateCall(id, {
        aiAnalysis: analysis as any,
      });
      
      res.json({
        message: "Call analyzed successfully",
        analysis
      });
    } catch (error: any) {
      console.error('Error analyzing call:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Analyze multiple calls in batch
  app.post("/api/calls/analyze-batch", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { callIds } = req.body;
      
      if (!Array.isArray(callIds) || callIds.length === 0) {
        return res.status(400).json({ message: "callIds must be a non-empty array" });
      }
      
      // Get calls with transcripts
      const callsToAnalyze: { callId: string; transcript: string; durationMs?: number }[] = [];
      
      for (const callId of callIds) {
        const call = await storage.getCall(callId);
        if (!call || call.userId !== userId) {
          continue; // Skip unauthorized or non-existent calls
        }
        
        const callLog = await storage.getCallLog(callId);
        if (callLog?.transcript) {
          callsToAnalyze.push({
            callId,
            transcript: callLog.transcript,
            durationMs: call.durationMs || undefined
          });
        }
      }
      
      if (callsToAnalyze.length === 0) {
        return res.status(400).json({ message: "No calls with transcripts found" });
      }
      
      // Analyze in batch
      const results = await openaiService.analyzeBatch(callsToAnalyze);
      
      // Store analyses
      let stored = 0;
      for (const [callId, analysis] of Array.from(results.entries())) {
        try {
          await storage.updateCall(callId, {
            aiAnalysis: analysis as any,
          });
          stored++;
        } catch (error) {
          console.error(`Error storing analysis for call ${callId}:`, error);
        }
      }
      
      res.json({
        message: `Analyzed ${results.size} calls`,
        analyzed: results.size,
        stored,
        total: callIds.length
      });
    } catch (error: any) {
      console.error('Error analyzing calls in batch:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Dashboard stats endpoint
  app.get("/api/dashboard/stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Analytics endpoint
  app.get("/api/analytics", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const analytics = await storage.getAnalytics(userId);
      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Webhook endpoint for Retell AI
  app.post("/api/webhooks/retell", async (req: Request, res: Response) => {
    try {
      const event = req.body;
      
      // Log the webhook event
      await storage.createWebhookEvent({
        eventType: event.event,
        callId: event.call?.call_id || null,
        payload: event,
        processed: false,
      });

      // Process different event types
      switch (event.event) {
        case 'call_started':
          if (event.call) {
            await storage.updateCallStatus(
              event.call.call_id,
              'in_progress',
              event.call.start_timestamp ? new Date(event.call.start_timestamp) : undefined
            );
          }
          break;

        case 'call_ended':
          if (event.call) {
            await storage.updateCallStatus(
              event.call.call_id,
              event.call.call_status || 'completed',
              event.call.end_timestamp ? new Date(event.call.end_timestamp) : undefined,
              event.call.duration_ms,
              event.call.disconnection_reason
            );

            // Update campaign stats when call ends
            const call = await storage.getCall(event.call.call_id);
            if (call?.campaignId) {
              const callSucceeded = event.call.call_status === 'ended' || event.call.call_status === 'completed';
              await storage.handleCallEnded(call.campaignId, callSucceeded);
            }
          }
          break;

        case 'call_analyzed':
          if (event.call) {
            // Update call log with complete analysis data
            await storage.updateCallLog(event.call.call_id, {
              transcript: event.call.transcript || null,
              transcriptObject: event.call.transcript_object || null,
              transcriptWithToolCalls: event.call.transcript_with_tool_calls || null,
              recordingUrl: event.call.recording_url || null,
              recordingMultiChannelUrl: event.call.recording_multi_channel_url || null,
              publicLogUrl: event.call.public_log_url || null,
              callAnalysis: event.call.call_analysis || null,
              callSummary: event.call.call_analysis?.call_summary || event.call.call_summary || null,
              callSuccessful: event.call.call_analysis?.call_successful ?? event.call.call_successful ?? null,
              userSentiment: event.call.call_analysis?.user_sentiment || event.call.user_sentiment || null,
              inVoicemail: event.call.call_analysis?.in_voicemail ?? event.call.in_voicemail ?? null,
              customAnalysisData: event.call.call_analysis?.custom_analysis_data || null,
              callCost: event.call.call_cost || null,
              llmTokenUsage: event.call.llm_token_usage || null,
              latency: event.call.latency || null,
            });

            // Automatically analyze with ChatGPT if transcript is available
            if (event.call.transcript) {
              try {
                const call = await storage.getCall(event.call.call_id);
                const analysis = await openaiService.analyzeCall(
                  event.call.transcript,
                  event.call.duration_ms || call?.durationMs || undefined
                );
                
                // ALWAYS check Cal.com for appointments (whether ChatGPT detected one or not)
                if (call) {
                  const user = await storage.getUser(call.userId);
                  
                  if (user?.calcomApiKey && user?.calcomEventTypeId) {
                    try {
                      const { createCalcomService } = await import('./calcomService');
                      const calcomService = createCalcomService(user.calcomApiKey, user.calcomEventTypeId);
                      
                      // Use call timestamp for verification window
                      const callTimestamp = call.startTimestamp || call.createdAt || new Date();
                      
                      const verification = await calcomService.verifyAppointment(
                        call.toNumber,
                        analysis.appointmentDetails,
                        callTimestamp
                      );
                      
                      // Store Cal.com verification results
                      analysis.calcomVerification = {
                        verified: verification.verified,
                        bookingId: verification.booking?.id,
                        bookingUid: verification.booking?.uid,
                        bookingStart: verification.booking?.start,
                        bookingEnd: verification.booking?.end,
                        message: verification.message,
                        checkedAt: new Date().toISOString(),
                      };
                      
                      // If Cal.com has a booking, extract customer name from booking
                      if (verification.verified && verification.booking?.attendees) {
                        const attendeeName = verification.booking.attendees.find(a => a.name)?.name;
                        if (attendeeName && !analysis.customerName) {
                          analysis.customerName = attendeeName;
                        }
                      }
                      
                      console.log(`📅 Cal.com verification for ${event.call.call_id}: ${verification.verified ? 'VERIFIED ✅' : 'NOT FOUND ❌'}`);
                    } catch (calcomError) {
                      console.error(`Error verifying with Cal.com for call ${event.call.call_id}:`, calcomError);
                      // Don't fail if Cal.com check fails
                    }
                  }
                }
                
                // If NO appointment was scheduled, analyze WHY
                if (!analysis.appointmentScheduled) {
                  try {
                    const noAppointmentReason = await openaiService.analyzeNoAppointmentReason(
                      event.call.transcript,
                      event.call.duration_ms || call?.durationMs || undefined
                    );
                    
                    // Add the reason to the analysis
                    (analysis as any).noAppointmentReason = noAppointmentReason;
                    
                    console.log(`📝 No appointment reason for ${event.call.call_id}: ${noAppointmentReason.substring(0, 100)}...`);
                  } catch (reasonError) {
                    console.error(`Error analyzing no-appointment reason for call ${event.call.call_id}:`, reasonError);
                    // Don't fail if this analysis fails
                  }
                }
                
                // Store ChatGPT analysis (with Cal.com verification and no-appointment reason if available)
                await storage.updateCall(event.call.call_id, {
                  aiAnalysis: analysis as any,
                });
                
                const appointmentStatus = analysis.appointmentScheduled ? 'YES' : 'NO';
                const calcomStatus = analysis.calcomVerification 
                  ? ` | Cal.com: ${analysis.calcomVerification.verified ? '✅' : '❌'}` 
                  : '';
                const customerName = analysis.customerName ? ` | Cliente: ${analysis.customerName}` : '';
                console.log(`✅ Analyzed call ${event.call.call_id} - Appointment: ${appointmentStatus}${calcomStatus}${customerName}`);
              } catch (aiError) {
                console.error(`Error auto-analyzing call ${event.call.call_id}:`, aiError);
                // Don't fail the webhook if AI analysis fails
              }
            }
          }
          break;
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Error processing webhook:", error);
      res.status(500).json({ message: error.message });
    }
  });
}
