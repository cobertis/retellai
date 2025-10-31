import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { retellService } from "./retellService";
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
      const { defaultAgentId } = z.object({
        defaultAgentId: z.string().optional(),
      }).parse(req.body);
      
      // Normalize empty string to undefined
      const normalizedAgentId = defaultAgentId?.trim() || undefined;
      const user = await storage.updateUserSettings(userId, { defaultAgentId: normalizedAgentId });
      
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
              phoneNumbers.push({
                listId: id,
                phoneNumber: phoneNumber.toString().trim(),
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
      const { agentId, listId, startImmediately } = req.body;
      
      if (!agentId || !listId) {
        return res.status(400).json({ message: "Agent and phone list are required" });
      }

      // Get agent and list details for campaign name
      const agent = await storage.getAgent(agentId);
      const list = await storage.getPhoneList(listId);
      
      if (!agent || !list) {
        return res.status(404).json({ message: "Agent or phone list not found" });
      }

      // Generate campaign name automatically
      const campaignName = `${agent.name} - ${list.name}`;
      
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

            await storage.createCall({
              id: retellCall.call_id,
              userId,
              campaignId: campaign.id,
              agentId,
              fromNumber: campaign.fromNumber || null,
              toNumber: phoneNumber.phoneNumber,
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
          await storage.createCall({
            id: retellCall.call_id,
            userId,
            campaignId: id,
            agentId: campaign.agentId,
            fromNumber: campaign.fromNumber || null,
            toNumber: phoneNumber.phoneNumber,
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
      const call = await storage.getCall(id);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
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
          }
          break;

        case 'call_analyzed':
          if (event.call) {
            // Update call log with analysis data
            await storage.updateCallLog(event.call.call_id, {
              transcript: event.call.transcript || null,
              recordingUrl: event.call.recording_url || null,
              recordingMultiChannelUrl: event.call.recording_multi_channel_url || null,
              callSummary: event.call.call_summary || null,
              callSuccessful: event.call.call_successful ?? null,
              userSentiment: event.call.user_sentiment || null,
              inVoicemail: event.call.in_voicemail ?? null,
              callCost: event.call.call_cost || null,
              latency: event.call.latency || null,
            });
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
