import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { retellService } from "./retellService";
import { isAuthenticated } from "./replitAuth";
import multer from "multer";
import csvParser from "csv-parser";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  insertAgentSchema,
  insertPhoneListSchema,
  insertCampaignSchema,
} from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage() });

function getUserId(req: Request): string {
  const user = req.user as any;
  return user.claims.sub;
}

export function registerRoutes(app: Express) {
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
            phoneNumbers.push({
              listId: id,
              phoneNumber: row.phoneNumber || row.phone || row.number,
              firstName: row.firstName || row.first_name || null,
              lastName: row.lastName || row.last_name || null,
              email: row.email || null,
              metadata: row,
            });
          })
          .on('end', resolve)
          .on('error', reject);
      });

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
      const validatedData = insertCampaignSchema.parse(req.body);
      
      const campaign = await storage.createCampaign(userId, {
        name: validatedData.name,
        description: validatedData.description,
        agentId: validatedData.agentId,
        listId: validatedData.listId,
        fromNumber: validatedData.fromNumber,
        status: 'draft',
        totalCalls: 0,
        completedCalls: 0,
        failedCalls: 0,
        inProgressCalls: 0,
      });
      
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

      // Start making calls (in production, this would be a background job)
      // For now, we'll just create the first few calls as examples
      const callPromises = phoneNumbers.slice(0, 3).map(async (phoneNumber) => {
        try {
          // Create call in Retell AI
          const retellCall = await retellService.createPhoneCall({
            from_number: campaign.fromNumber,
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
            fromNumber: campaign.fromNumber,
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

      await Promise.all(callPromises);

      res.json({ message: "Campaign started successfully" });
    } catch (error: any) {
      console.error("Error starting campaign:", error);
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
