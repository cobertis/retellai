import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { retellService } from "./retellService";
import { openaiService } from "./openaiService";
import { createCalcomService } from "./calcomService";
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

// In-memory progress tracking for lead classification
interface ClassificationProgress {
  status: 'processing' | 'completed' | 'error';
  totalBatches: number;
  completedBatches: number;
  totalNames: number;
  processedNames: number;
  hispanicCount: number;
  nonHispanicCount: number;
  currentBatch: number;
  errorMessage?: string;
  hispanicListId?: string;
  nonHispanicListId?: string;
  hispanicListName?: string;
  nonHispanicListName?: string;
}

const classificationProgress = new Map<string, ClassificationProgress>();

// Global map to track paused campaigns
const pausedCampaigns = new Set<string>();

// Async function to classify a list with AI
async function classifyListAsync(
  userId: string,
  listId: string,
  phoneNumbers: any[],
  originalListName: string
) {
  const progress = classificationProgress.get(listId)!;
  
  try {
    // Extract names
    const contacts = phoneNumbers.map(pn => ({
      id: pn.id,
      phone: pn.phoneNumber,
      firstName: pn.firstName || '',
      lastName: pn.lastName || '',
      email: pn.email || '',
      fullName: `${pn.firstName || ''} ${pn.lastName || ''}`.trim(),
    }));

    const names = contacts.map(c => c.fullName);
    console.log(`🤖 Classifying ${names.length} names...`);

    // Process in batches of 30 names, with 15 concurrent batches
    const BATCH_SIZE = 30;
    const CONCURRENT_BATCHES = 15;
    const batches: string[][] = [];
    
    for (let i = 0; i < names.length; i += BATCH_SIZE) {
      batches.push(names.slice(i, i + BATCH_SIZE));
    }

    progress.totalBatches = batches.length;
    console.log(`📦 Processing ${batches.length} batches (${BATCH_SIZE} names each, ${CONCURRENT_BATCHES} concurrent)`);

    // Process batches concurrently
    const allClassifications: Array<{ name: string; hispanic: boolean }> = [];
    
    for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
      const batchGroup = batches.slice(i, i + CONCURRENT_BATCHES);
      
      const results = await Promise.all(
        batchGroup.map(async (batch, idx) => {
          const batchNum = i + idx + 1;
          progress.currentBatch = batchNum;
          console.log(`⚙️  Processing batch ${batchNum}/${batches.length} (${batch.length} names)...`);
          
          const classifications = await openaiService.classifyNames(batch);
          
          progress.completedBatches = batchNum;
          progress.processedNames = Math.min(batchNum * BATCH_SIZE, names.length);
          
          console.log(`✅ Batch ${batchNum}/${batches.length} complete`);
          return classifications;
        })
      );
      
      // Flatten results and update counters in real-time
      results.forEach(r => {
        allClassifications.push(...r);
        // Update counters as we process each batch
        const hispanicInBatch = r.filter(c => c.hispanic).length;
        const nonHispanicInBatch = r.length - hispanicInBatch;
        progress.hispanicCount += hispanicInBatch;
        progress.nonHispanicCount += nonHispanicInBatch;
      });
      
      console.log(`📊 Progress update: ${progress.hispanicCount} Hispanic, ${progress.nonHispanicCount} Non-Hispanic`);
    }

    console.log(`✅ All classifications complete: ${allClassifications.length} names processed`);

    // Map classifications back to contacts
    const classifiedContacts = contacts.map(contact => {
      const classification = allClassifications.find(c => c.name === contact.fullName);
      return {
        ...contact,
        isHispanic: classification?.hispanic || false
      };
    });

    // Separate into two groups
    const hispanicContacts = classifiedContacts.filter(c => c.isHispanic);
    const nonHispanicContacts = classifiedContacts.filter(c => !c.isHispanic);

    progress.hispanicCount = hispanicContacts.length;
    progress.nonHispanicCount = nonHispanicContacts.length;

    console.log(`📊 Hispanic: ${hispanicContacts.length}, Non-Hispanic: ${nonHispanicContacts.length}`);

    // Create two new lists
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    const hispanicList = await storage.createPhoneList(userId, {
      name: `Español - ${originalListName}`,
      description: `Leads clasificados como Hispanos/Latinos (${today})`,
      classification: 'Hispanic/Latino',
      tags: ['AI-Classified', 'Spanish'],
      totalNumbers: hispanicContacts.length,
    });

    const nonHispanicList = await storage.createPhoneList(userId, {
      name: `Inglés - ${originalListName}`,
      description: `Leads clasificados como No-Hispanos (${today})`,
      classification: 'Non-Hispanic',
      tags: ['AI-Classified', 'English'],
      totalNumbers: nonHispanicContacts.length,
    });

    progress.hispanicListId = hispanicList.id;
    progress.nonHispanicListId = nonHispanicList.id;
    progress.hispanicListName = hispanicList.name;
    progress.nonHispanicListName = nonHispanicList.name;

    console.log(`💾 Saving ${hispanicContacts.length} Hispanic + ${nonHispanicContacts.length} Non-Hispanic contacts using batch insert...`);

    // Use batch insert for MUCH faster performance
    const hispanicBatch = hispanicContacts.map(contact => ({
      listId: hispanicList.id,
      phoneNumber: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
    }));

    const nonHispanicBatch = nonHispanicContacts.map(contact => ({
      listId: nonHispanicList.id,
      phoneNumber: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
    }));

    // Batch insert both lists in parallel
    console.log(`📊 Inserting Hispanic list (${hispanicBatch.length} contacts)...`);
    await storage.createPhoneNumbersBatch(hispanicBatch);
    console.log(`✅ Hispanic list saved`);
    
    console.log(`📊 Inserting Non-Hispanic list (${nonHispanicBatch.length} contacts)...`);
    await storage.createPhoneNumbersBatch(nonHispanicBatch);
    console.log(`✅ Non-Hispanic list saved`)

    // Mark original list as classified (update tags)
    await storage.updatePhoneListDetails(listId, {
      tags: ['Classified'],
      description: `Classified into 2 lists: "${hispanicList.name}" and "${nonHispanicList.name}"`
    });

    progress.status = 'completed';
    console.log(`✅ Classification complete! Created 2 new lists.`);

    // Clean up progress after 5 minutes to prevent memory leaks
    setTimeout(() => {
      classificationProgress.delete(listId);
      console.log(`🧹 Cleaned up classification progress for list ${listId}`);
    }, 5 * 60 * 1000);

  } catch (error: any) {
    console.error('❌ Classification failed:', error);
    progress.status = 'error';
    progress.errorMessage = error.message;
    
    // Clean up progress after 5 minutes even on error
    setTimeout(() => {
      classificationProgress.delete(listId);
      console.log(`🧹 Cleaned up classification progress for list ${listId}`);
    }, 5 * 60 * 1000);
    
    throw error;
  }
}

// Simple batch processor: Launch 20 calls at once, wait for ALL to finish, then next batch
async function processConcurrently<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<{ callId: string } | null>,
  campaignId?: string,
  userId?: string,
  startFromBatch: number = 0
): Promise<void> {
  // Split items into batches of 20
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  console.log(`📦 Processing ${items.length} items in ${batches.length} batches of ${batchSize}`);
  
  // Update campaign state in DB at the start
  if (campaignId) {
    await storage.updateCampaign(campaignId, {
      totalBatches: batches.length,
      currentBatch: startFromBatch,
      isRunning: true
    });
  }

  // Process each batch sequentially, starting from startFromBatch
  for (let batchIndex = startFromBatch; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    // Check if campaign is paused
    if (campaignId && pausedCampaigns.has(campaignId)) {
      console.log(`⏸️  Campaign ${campaignId} is paused. Stopping batch processing.`);
      await storage.updateCampaign(campaignId, { isRunning: false });
      break;
    }

    // Check Retell concurrency limits before launching batch
    const concurrency = await retellService.getConcurrency();
    const batchSize = batch.length;
    
    if (concurrency.availableSlots < batchSize) {
      console.log(`⚠️  CONCURRENCY LIMIT REACHED: ${concurrency.currentConcurrency}/${concurrency.concurrencyLimit} active calls`);
      console.log(`   Batch needs ${batchSize} slots but only ${concurrency.availableSlots} available`);
      console.log(`   Waiting 30 seconds for calls to complete...`);
      
      // Wait 30 seconds and try again
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Re-check after waiting
      const newConcurrency = await retellService.getConcurrency();
      console.log(`🔄 After waiting: ${newConcurrency.currentConcurrency}/${newConcurrency.concurrencyLimit} active, ${newConcurrency.availableSlots} slots available`);
      
      if (newConcurrency.availableSlots < batchSize) {
        console.log(`❌ Still not enough slots. Pausing campaign.`);
        if (campaignId) {
          await storage.updateCampaignStatus(campaignId, 'paused');
          await storage.updateCampaign(campaignId, { isRunning: false });
        }
        throw new Error(`Concurrency limit reached: ${newConcurrency.currentConcurrency}/${newConcurrency.concurrencyLimit} calls active. Please wait for calls to complete or upgrade your plan.`);
      }
    }
    
    console.log(`✅ Concurrency check passed: ${concurrency.currentConcurrency}/${concurrency.concurrencyLimit} active, ${concurrency.availableSlots} slots available`);

    console.log(`\n🚀 Starting batch ${batchIndex + 1}/${batches.length} (${batch.length} calls)`);

    // Launch all calls in this batch simultaneously
    const results = await Promise.allSettled(
      batch.map(item => processor(item))
    );

    // Collect call IDs from successful creations
    const callIds: string[] = [];
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value?.callId) {
        callIds.push(result.value.callId);
      }
    });

    console.log(`✅ Batch ${batchIndex + 1} launched: ${callIds.length} calls created`);

    // Wait for ALL calls in this batch to complete before moving to next batch
    if (callIds.length > 0) {
      await waitUntilCallsComplete(callIds, campaignId);
    }

    console.log(`✓ Batch ${batchIndex + 1}/${batches.length} complete\n`);
    
    // Update current batch in DB after completing this batch
    if (campaignId) {
      await storage.updateCampaign(campaignId, {
        currentBatch: batchIndex + 1
      });
    }
  }

  console.log(`🎉 All ${batches.length} batches processed!`);
  
  // Mark campaign as not running when done
  if (campaignId) {
    await storage.updateCampaign(campaignId, { isRunning: false });
  }
}

// Wait for specific call IDs to reach terminal status (completed, failed, etc)
async function waitUntilCallsComplete(callIds: string[], campaignId?: string): Promise<void> {
  const maxWaitTime = 15 * 60 * 1000; // 15 minutes max per batch
  const maxCallTime = 10 * 60 * 1000; // 10 minutes max per individual call (enough for real conversations)
  const pollInterval = 5000; // Check every 5 seconds
  const startTime = Date.now();

  while (true) {
    // Check if campaign is paused
    if (campaignId && pausedCampaigns.has(campaignId)) {
      console.log(`⏸️  Campaign ${campaignId} paused during wait. Stopping.`);
      return;
    }

    // Check if we've exceeded max wait time
    if (Date.now() - startTime > maxWaitTime) {
      console.log(`⏰ Timeout waiting for calls to complete. Moving to next batch.`);
      return;
    }

    // Check status of all calls in this batch
    const calls = await Promise.all(
      callIds.map(id => storage.getCall(id).catch(() => null))
    );

    const now = Date.now();
    let forcedFailures = 0;

    // Check each call for timeout
    for (const call of calls) {
      if (!call) continue;
      
      // Skip if already ended or failed
      if (call.callStatus === 'ended' || call.callStatus === 'failed') {
        continue;
      }

      // Check if call has been running too long (stuck, not progressing)
      const callStarted = call.startTimestamp ? new Date(call.startTimestamp).getTime() : null;
      if (callStarted && (now - callStarted) > maxCallTime) {
        console.log(`⚠️  Call ${call.id} timeout after 10 minutes - marking as failed`);
        
        try {
          // Update call status to failed
          await storage.updateCall(call.id, {
            callStatus: 'failed',
            endTimestamp: new Date(),
            disconnectionReason: 'timeout',
          });

          // Update campaign stats
          if (campaignId) {
            const campaign = await storage.getCampaign(campaignId);
            if (campaign) {
              await storage.incrementCampaignFailed(campaignId);
            }
          }

          forcedFailures++;
        } catch (error) {
          console.error(`Error marking call ${call.id} as failed:`, error);
        }
      }
    }

    if (forcedFailures > 0) {
      console.log(`🔧 Auto-failed ${forcedFailures} stuck call(s)`);
    }

    // Re-check how many are still in progress after forced failures
    const updatedCalls = await Promise.all(
      callIds.map(id => storage.getCall(id).catch(() => null))
    );

    const inProgress = updatedCalls.filter(call => 
      call && call.callStatus !== 'ended' && call.callStatus !== 'failed'
    ).length;

    if (inProgress === 0) {
      console.log(`✓ All ${callIds.length} calls completed`);
      return;
    }

    console.log(`⏳ Waiting for ${inProgress}/${callIds.length} calls to complete...`);
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

// Resume all running campaigns on server startup (fire-and-forget, non-blocking)
export async function resumeRunningCampaigns(): Promise<void> {
  try {
    console.log('🔍 Checking for running campaigns to resume...');
    
    // Find all campaigns that were running when server stopped
    const runningCampaigns = await storage.getRunningCampaigns();
    
    if (runningCampaigns.length === 0) {
      console.log('✅ No campaigns to resume');
      return;
    }

    console.log(`🔄 Found ${runningCampaigns.length} campaign(s) to resume`);
    
    // Resume each campaign in background (fire-and-forget to avoid blocking server startup)
    for (const campaign of runningCampaigns) {
      console.log(`🚀 Resuming campaign ${campaign.id} (${campaign.name})`);
      // Don't await - let it run in background
      resumeCampaign(campaign.id).catch(error => {
        console.error(`Failed to resume campaign ${campaign.id}:`, error);
      });
    }
  } catch (error) {
    console.error('❌ Error resuming campaigns:', error);
  }
}

// Resume a campaign from where it left off (after server restart)
export async function resumeCampaign(campaignId: string): Promise<void> {
  try {
    console.log(`🔄 Resuming campaign ${campaignId}...`);
    
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      console.error(`Campaign ${campaignId} not found`);
      return;
    }

    // Get all phone numbers from the list (excluding already contacted)
    const phoneNumbers = await storage.getPhoneNumbersByList(campaign.listId, true);
    
    if (phoneNumbers.length === 0) {
      console.log(`No more phone numbers to call for campaign ${campaignId}`);
      await storage.updateCampaign(campaignId, { 
        status: 'completed',
        isRunning: false 
      });
      return;
    }

    console.log(`📞 Found ${phoneNumbers.length} remaining numbers for campaign ${campaignId}`);
    console.log(`📦 Resuming from batch ${campaign.currentBatch || 0} of ${campaign.totalBatches || 0}`);

    const userId = campaign.userId;

    // Resume processing from the current batch
    processConcurrently(
      phoneNumbers, 
      campaign.concurrencyLimit || 20, 
      async (phoneNumber): Promise<{ callId: string } | null> => {
        try {
          // Create call in Retell AI
          const fromNum = campaign.fromNumber || process.env.DEFAULT_FROM_NUMBER || '+18046689791';
          const retellCall = await retellService.createPhoneCall({
            from_number: fromNum,
            to_number: phoneNumber.phoneNumber,
            override_agent_id: campaign.agentId,
            metadata: {
              campaignId: campaign.id,
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
            campaignId: campaign.id,
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
          
          return { callId: retellCall.call_id };
        } catch (error) {
          console.error("Error creating call:", error);
          return null;
        }
      },
      campaignId,
      userId,
      campaign.currentBatch || 0
    ).catch(async (error) => {
      console.error(`❌ Fatal error in campaign ${campaignId} resume:`, error);
      // Mark campaign as failed on fatal errors (including concurrency limit)
      try {
        await storage.updateCampaignStatus(campaignId, 'failed');
        await storage.updateCampaign(campaignId, { isRunning: false });
      } catch (updateError) {
        console.error('Failed to update campaign status:', updateError);
      }
    });
  } catch (error) {
    console.error(`Error resuming campaign ${campaignId}:`, error);
  }
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

  // Get current Retell concurrency status
  app.get("/api/retell/concurrency", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const concurrency = await retellService.getConcurrency();
      res.json(concurrency);
    } catch (error: any) {
      console.error("Error getting concurrency:", error);
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

  // STEP 1: Upload CSV and save all numbers immediately
  app.post("/api/process-leads", isAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const file = req.file;
      const skipClassification = req.body.skipClassification === 'true';

      if (!file) {
        return res.status(400).send("No file uploaded");
      }

      console.log("📤 Uploading leads file:", file.originalname);
      if (skipClassification) {
        console.log("⚡ Skip classification enabled - list will be ready to use immediately");
      }

      // Parse CSV
      const contacts: Array<{
        phone: string;
        firstName: string;
        lastName: string;
        email: string;
        fullName: string;
      }> = [];
      
      const stream = Readable.from(file.buffer);

      await new Promise<void>((resolve, reject) => {
        stream
          .pipe(csvParser())
          .on('data', (row: any) => {
            // Normalize column names
            const normalizedRow: any = {};
            Object.keys(row).forEach(key => {
              normalizedRow[key.toLowerCase().trim()] = row[key];
            });
            
            // Extract fields - trying multiple column name variations
            const phone = normalizedRow['teléfono'] || 
                         normalizedRow['telefono'] || 
                         normalizedRow['phone'] || 
                         normalizedRow['phonenumber'] || '';
            
            const firstName = normalizedRow['nombre'] || 
                             normalizedRow['firstname'] || 
                             normalizedRow['first name'] || 
                             normalizedRow['name'] || '';
            
            const lastName = normalizedRow['apellido'] || 
                            normalizedRow['lastname'] || 
                            normalizedRow['last name'] || '';
            
            const email = normalizedRow['email'] || 
                         normalizedRow['correo'] || '';
            
            // If no firstName/lastName, try to split name
            let fullName = '';
            if (firstName && lastName) {
              fullName = `${firstName} ${lastName}`.trim();
            } else if (firstName) {
              fullName = firstName.trim();
            }

            if (phone && fullName) {
              contacts.push({
                phone: phone.toString().replace(/\D/g, ''),
                firstName,
                lastName,
                email,
                fullName
              });
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });

      console.log(`✅ Parsed ${contacts.length} contacts from CSV`);

      if (contacts.length === 0) {
        return res.status(400).send("No valid contacts found in CSV");
      }

      // Create a single list with all contacts
      const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      
      const phoneList = await storage.createPhoneList(userId, {
        name: `${file.originalname.replace('.csv', '')} - ${today}`,
        description: skipClassification 
          ? `Uploaded from ${file.originalname} - Ready to use`
          : `Uploaded from ${file.originalname} - Ready for AI classification`,
        classification: null,
        tags: skipClassification ? ['Ready'] : ['Pending-Classification'],
        totalNumbers: contacts.length,
      });

      // Save all contacts to the list with +1 prefix using batch insert
      console.log(`💾 Saving ${contacts.length} contacts to database using batch insert...`);
      
      const phoneNumbersToInsert = contacts.map(contact => ({
        listId: phoneList.id,
        phoneNumber: contact.phone.startsWith('+') ? contact.phone : `+1${contact.phone}`,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
      }));
      
      await storage.createPhoneNumbersBatch(phoneNumbersToInsert);

      console.log(`✅ Saved ${contacts.length} contacts in batches. List ID: ${phoneList.id}`);

      res.json({
        success: true,
        listId: phoneList.id,
        listName: phoneList.name,
        totalContacts: contacts.length,
        message: "Contacts uploaded successfully. Ready for classification."
      });

    } catch (error: any) {
      console.error("❌ Error uploading leads:", error);
      res.status(500).send(error.message || "Failed to upload leads");
    }
  });

  // STEP 2: Classify an existing list with AI
  app.post("/api/classify-list/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;

      // Prevent concurrent classifications of the same list
      const existingProgress = classificationProgress.get(id);
      if (existingProgress && existingProgress.status === 'processing') {
        return res.status(409).json({ 
          message: "Classification already in progress for this list",
          progress: existingProgress 
        });
      }

      // Get the phone list
      const phoneList = await storage.getPhoneList(id);
      if (!phoneList) {
        return res.status(404).json({ message: "Phone list not found" });
      }

      // Get all phone numbers from this list
      const phoneNumbers = await storage.getPhoneNumbersByList(id);
      if (phoneNumbers.length === 0) {
        return res.status(400).json({ message: "No phone numbers in this list" });
      }

      console.log(`🤖 Starting AI classification for ${phoneNumbers.length} contacts...`);

      // Initialize progress tracking
      const progressId = id;
      classificationProgress.set(progressId, {
        status: 'processing',
        totalBatches: 0,
        completedBatches: 0,
        totalNames: phoneNumbers.length,
        processedNames: 0,
        hispanicCount: 0,
        nonHispanicCount: 0,
        currentBatch: 0,
      });

      // Start async classification (don't await, let it run in background)
      classifyListAsync(userId, id, phoneNumbers, phoneList.name || 'List').catch(error => {
        console.error('❌ Classification error:', error);
        const progress = classificationProgress.get(progressId);
        if (progress) {
          progress.status = 'error';
          progress.errorMessage = error.message;
        }
      });

      res.json({
        success: true,
        message: "Classification started",
        progressId: progressId,
      });

    } catch (error: any) {
      console.error("❌ Error starting classification:", error);
      res.status(500).send(error.message || "Failed to start classification");
    }
  });

  // Download phone list as CSV
  app.get("/api/phone-lists/:id/download", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;

      // Get the phone list
      const phoneList = await storage.getPhoneList(id);
      if (!phoneList) {
        return res.status(404).json({ message: "Phone list not found" });
      }

      // Security: Verify list belongs to authenticated user
      if (phoneList.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Get all phone numbers from this list
      const phoneNumbers = await storage.getPhoneNumbersByList(id);
      if (phoneNumbers.length === 0) {
        return res.status(400).json({ message: "No contacts in this list" });
      }

      // Generate CSV content
      const csvHeaders = ['First Name', 'Last Name', 'Phone Number', 'Email'];
      const csvRows = phoneNumbers.map(contact => [
        contact.firstName || '',
        contact.lastName || '',
        contact.phoneNumber || '',
        contact.email || ''
      ]);

      // Combine headers and rows
      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => {
          // Escape fields that contain commas or quotes
          if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
          }
          return field;
        }).join(','))
      ].join('\n');

      // Set headers for file download
      const fileName = `${phoneList.name.replace(/[^a-z0-9]/gi, '_')}_contacts.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csvContent);

    } catch (error: any) {
      console.error("❌ Error downloading phone list:", error);
      res.status(500).send(error.message || "Failed to download phone list");
    }
  });

  // Get classification progress
  app.get("/api/classify-progress/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const progress = classificationProgress.get(id);

      if (!progress) {
        return res.status(404).json({ message: "No classification in progress for this list" });
      }

      res.json(progress);
    } catch (error: any) {
      console.error("❌ Error getting progress:", error);
      res.status(500).send(error.message || "Failed to get progress");
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

      // If startImmediately is true, start the campaign using Batch Calling API
      if (startImmediately) {
        const phoneNumbers = await storage.getPhoneNumbersByList(listId, true); // Exclude contacted numbers
        
        if (phoneNumbers.length === 0) {
          return res.status(400).json({ message: "No phone numbers in list or all already contacted" });
        }

        console.log(`🚀 Creating Retell batch call for campaign ${campaign.id} with ${phoneNumbers.length} numbers...`);

        // Prepare batch call tasks
        const fromNum = campaign.fromNumber || process.env.DEFAULT_FROM_NUMBER || '+18046689791';
        const tasks = phoneNumbers.map(phoneNumber => {
          // Ensure E.164 format
          const toNumber = phoneNumber.phoneNumber.startsWith('+') 
            ? phoneNumber.phoneNumber 
            : `+1${phoneNumber.phoneNumber.replace(/[^0-9]/g, '')}`;
          
          return {
            to_number: toNumber,
            override_agent_id: agentId,
            retell_llm_dynamic_variables: {
              campaign_id: campaign.id,
              list_id: listId,
              phone_number_id: phoneNumber.id,
              customer_name: phoneNumber.firstName ? `${phoneNumber.firstName} ${phoneNumber.lastName || ''}`.trim() : undefined,
            },
            metadata: {
              userId,
              campaignId: campaign.id,
              listId: listId,
              phoneNumberId: phoneNumber.id,
              agentId,
            },
          };
        });

        try {
          // Create batch call via Retell API
          const batchCall = await retellService.createBatchCall({
            from_number: fromNum,
            tasks,
            name: campaignName,
          });

          console.log(`✅ Batch call created: ${batchCall.batch_call_id} with ${batchCall.total_task_count} tasks`);

          // Update campaign with batch info
          // NOTE: We don't create Call records here - Retell webhooks will create them with real call_id
          await storage.updateCampaignStatus(campaign.id, 'active');
          await storage.updateCampaignStats(campaign.id, {
            totalCalls: phoneNumbers.length,
            startedAt: new Date(),
            retellBatchId: batchCall.batch_call_id,
            batchStats: {
              batch_call_id: batchCall.batch_call_id,
              total_task_count: batchCall.total_task_count,
              scheduled_timestamp: batchCall.scheduled_timestamp,
              phone_numbers: phoneNumbers.map(p => p.id), // Track which numbers are in this batch
            },
          });

          console.log(`✅ Campaign ${campaign.id} started with Retell Batch Calling. Webhooks will populate call records.`);
        } catch (batchError: any) {
          console.error(`❌ Failed to create batch call:`, batchError);
          await storage.updateCampaignStatus(campaign.id, 'failed');
          return res.status(500).json({ message: `Failed to start batch call: ${batchError.message}` });
        }
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

      if (campaign.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (campaign.status !== 'draft' && campaign.status !== 'paused') {
        return res.status(400).json({ message: "Campaign must be in draft or paused status to start" });
      }

      // Prevent duplicate batch creation
      if (campaign.retellBatchId) {
        return res.status(400).json({ 
          message: "Campaign already has an active batch call. Use pause/resume or create a new campaign.",
          batchId: campaign.retellBatchId 
        });
      }

      // Get phone numbers from the list (exclude already contacted)
      const phoneNumbers = await storage.getPhoneNumbersByList(campaign.listId, true);
      
      if (phoneNumbers.length === 0) {
        return res.status(400).json({ message: "No phone numbers in list or all already contacted" });
      }

      console.log(`🚀 Creating Retell batch call for campaign ${id} with ${phoneNumbers.length} numbers...`);

      // Prepare batch call tasks
      const fromNum = campaign.fromNumber || process.env.DEFAULT_FROM_NUMBER || '+18046689791';
      const tasks = phoneNumbers.map(phoneNumber => {
        // Ensure E.164 format
        const toNumber = phoneNumber.phoneNumber.startsWith('+') 
          ? phoneNumber.phoneNumber 
          : `+1${phoneNumber.phoneNumber.replace(/[^0-9]/g, '')}`;
        
        return {
          to_number: toNumber,
          override_agent_id: campaign.agentId,
          retell_llm_dynamic_variables: {
            campaign_id: id,
            list_id: campaign.listId,
            phone_number_id: phoneNumber.id,
            customer_name: phoneNumber.firstName ? `${phoneNumber.firstName} ${phoneNumber.lastName || ''}`.trim() : undefined,
          },
          metadata: {
            userId,
            campaignId: id,
            listId: campaign.listId,
            phoneNumberId: phoneNumber.id,
            agentId: campaign.agentId,
          },
        };
      });

      try {
        // Create batch call via Retell API
        const batchCall = await retellService.createBatchCall({
          from_number: fromNum,
          tasks,
          name: campaign.name,
        });

        console.log(`✅ Batch call created: ${batchCall.batch_call_id} with ${batchCall.total_task_count} tasks`);

        // Update campaign with batch info
        // NOTE: We don't create Call records here - Retell webhooks will create them with real call_id
        await storage.updateCampaignStatus(id, 'active');
        await storage.updateCampaignStats(id, {
          totalCalls: phoneNumbers.length,
          startedAt: new Date(),
          retellBatchId: batchCall.batch_call_id,
          batchStats: {
            batch_call_id: batchCall.batch_call_id,
            total_task_count: batchCall.total_task_count,
            scheduled_timestamp: batchCall.scheduled_timestamp,
            phone_numbers: phoneNumbers.map(p => p.id), // Track which numbers are in this batch
          },
        });

        console.log(`✅ Campaign ${id} started with Retell Batch Calling. Webhooks will populate call records.`);
        
        const updatedCampaign = await storage.getCampaign(id);
        res.json({ message: "Campaign started successfully", campaign: updatedCampaign });
      } catch (batchError: any) {
        console.error(`❌ Failed to create batch call:`, batchError);
        await storage.updateCampaignStatus(id, 'failed');
        return res.status(500).json({ message: `Failed to start batch call: ${batchError.message}` });
      }
    } catch (error: any) {
      console.error("Error starting campaign:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Pause a campaign
  // NOTE: With Retell Batch Calling API, pause is not currently supported
  app.post("/api/campaigns/:id/pause", isAuthenticated, async (req: Request, res: Response) => {
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

      if (campaign.retellBatchId) {
        // This is a batch campaign, pause not supported yet
        return res.status(501).json({ 
          message: "Pause is not available for batch campaigns. Retell AI will complete all scheduled calls automatically.",
          note: "To prevent future campaigns, delete the campaign or create a new one. Active batch calls will complete."
        });
      }

      // Legacy campaign (non-batch) - should not exist but handle gracefully
      return res.status(400).json({ message: "Campaign type not supported" });
    } catch (error: any) {
      console.error("Error pausing campaign:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Resume a paused campaign
  // NOTE: With Batch Calling API, resume is not currently supported
  app.post("/api/campaigns/:id/resume", isAuthenticated, async (req: Request, res: Response) => {
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

      if (campaign.retellBatchId) {
        // This is a batch campaign, resume not applicable
        return res.status(501).json({ 
          message: "Resume is not needed for batch campaigns. Retell AI handles call scheduling automatically.",
          note: "Batch calls run continuously until all numbers are called."
        });
      }

      // Legacy campaign (non-batch) - should not exist but handle gracefully
      return res.status(400).json({ message: "Campaign type not supported" });
    } catch (error: any) {
      console.error("Error resuming campaign:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Stop/cancel a campaign completely
  // NOTE: Batch Calling API doesn't support cancel yet
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

      if (campaign.retellBatchId) {
        // This is a batch campaign, cancel not supported yet
        return res.status(501).json({ 
          message: "Cancel is not currently available for batch campaigns. The batch call will complete automatically.",
          note: "All scheduled calls will be attempted. You can delete the campaign record for tracking purposes, but calls will continue.",
          batchId: campaign.retellBatchId
        });
      }

      // Legacy campaign (non-batch) - should not exist but handle gracefully
      return res.status(400).json({ message: "Campaign type not supported" });
    } catch (error: any) {
      console.error("Error stopping campaign:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Retry failed calls in a campaign
  app.post("/api/campaigns/:id/retry-failed", isAuthenticated, async (req: Request, res: Response) => {
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

      // Get all calls that can be retried (using the canRetry flag set by webhook)
      const allCalls = await storage.getCallsByCampaign(id);
      const retriableCalls = allCalls.filter(call => call.canRetry === true);

      if (retriableCalls.length === 0) {
        return res.status(400).json({ message: "No failed calls to retry" });
      }

      console.log(`🔄 Retrying ${retriableCalls.length} failed calls for campaign ${id}`);

      // Mark old failed calls as retried (set canRetry = false so they don't get counted again)
      for (const call of retriableCalls) {
        await storage.updateCall(call.id, { canRetry: false });
      }

      // Decrement failed count since we're retrying these calls
      await storage.updateCampaignStats(id, {
        failedCalls: Math.max(0, (campaign.failedCalls || 0) - retriableCalls.length),
      });

      // Get phone numbers for retriable calls
      const phoneNumberMap = new Map();
      for (const call of retriableCalls) {
        // Extract phone number from toNumber
        phoneNumberMap.set(call.toNumber, call);
      }

      // Get phone list numbers
      const phoneNumbers = await storage.getPhoneNumbersByList(campaign.listId);
      const numbersToRetry = phoneNumbers.filter(pn => {
        const formatted = pn.phoneNumber.startsWith('+') 
          ? pn.phoneNumber 
          : `+1${pn.phoneNumber.replace(/[^0-9]/g, '')}`;
        return phoneNumberMap.has(formatted);
      });

      // Start retrying in background
      processConcurrently(numbersToRetry, 20, async (phoneNumber): Promise<{ callId: string } | null> => {
        try {
          const fromNum = campaign.fromNumber || process.env.DEFAULT_FROM_NUMBER || '+18046689791';
          const retellCall = await retellService.createPhoneCall({
            from_number: fromNum,
            to_number: phoneNumber.phoneNumber,
            override_agent_id: campaign.agentId,
            metadata: {
              campaignId: id,
              listId: campaign.listId,
              phoneNumberId: phoneNumber.id,
              retry: true,
            },
          });

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

          console.log(`✅ Retry call created for ${toNumber}`);
          return { callId: retellCall.call_id };
        } catch (error) {
          console.error("Error retrying call:", error);
          return null;
        }
      }, id, userId).catch(async (error) => {
        console.error(`❌ Error in retry process for campaign ${id}:`, error);
      });

      res.json({ message: `Retrying ${retriableCalls.length} failed calls`, retriedCount: retriableCalls.length });
    } catch (error: any) {
      console.error("Error retrying failed calls:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Process queued calls for a campaign (respecting concurrency limits)
  app.post("/api/campaigns/:id/process-queue", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      const { globalMaxConcurrent = 20 } = req.body;

      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check both global and campaign-specific limits
      const globalInProgressCount = await storage.getInProgressCallsCount(userId);
      const campaignInProgressCount = await storage.getInProgressCallsCountByCampaign(id);
      
      const campaignLimit = campaign.concurrencyLimit || 20;
      const globalAvailable = Math.max(0, globalMaxConcurrent - globalInProgressCount);
      const campaignAvailable = Math.max(0, campaignLimit - campaignInProgressCount);
      const availableSlots = Math.min(globalAvailable, campaignAvailable);

      if (availableSlots === 0) {
        return res.json({ 
          message: "No available slots for new calls", 
          globalInProgressCount,
          campaignInProgressCount,
          globalMaxConcurrent,
          campaignLimit,
          processed: 0 
        });
      }

      // Get queued calls
      const queuedCalls = await storage.getQueuedCalls(id);
      const callsToProcess = queuedCalls.slice(0, availableSlots);

      let processedCount = 0;
      let errorCount = 0;

      // Process calls
      for (const call of callsToProcess) {
        try {
          const phoneNumber = call.toNumber;
          const fromNum = campaign.fromNumber || process.env.DEFAULT_FROM_NUMBER || '+18046689791';
          
          // Create call in Retell AI
          const retellCall = await retellService.createPhoneCall({
            from_number: fromNum,
            to_number: phoneNumber,
            override_agent_id: campaign.agentId,
            metadata: {
              campaignId: id,
              listId: campaign.listId,
              callId: call.id,
            },
          });

          // Update call with Retell info and increment attempts
          await storage.updateCall(call.id, {
            callStatus: retellCall.call_status || 'registered',
            startTimestamp: retellCall.start_timestamp ? new Date(retellCall.start_timestamp) : null,
            callAttempts: (call.callAttempts || 0) + 1,
            lastAttemptAt: new Date(),
            canRetry: false, // Will be set by webhook based on outcome
          });

          await storage.incrementCampaignInProgress(id);
          processedCount++;
        } catch (error) {
          console.error("Error processing queued call:", error);
          await storage.updateCall(call.id, {
            callStatus: 'failed',
            canRetry: true,
            callAttempts: (call.callAttempts || 0) + 1,
            lastAttemptAt: new Date(),
          });
          errorCount++;
        }
      }

      res.json({
        message: `Processed ${processedCount} queued calls`,
        processed: processedCount,
        errors: errorCount,
        globalInProgressCount: globalInProgressCount + processedCount,
        campaignInProgressCount: campaignInProgressCount + processedCount,
        globalMaxConcurrent,
        campaignLimit,
        remainingQueued: queuedCalls.length - callsToProcess.length,
      });
    } catch (error: any) {
      console.error("Error processing queue:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Retry failed calls for a campaign
  app.post("/api/campaigns/:id/retry-failed", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      const { maxRetries = 3, globalMaxConcurrent = 20 } = req.body;

      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check both global and campaign-specific limits
      const globalInProgressCount = await storage.getInProgressCallsCount(userId);
      const campaignInProgressCount = await storage.getInProgressCallsCountByCampaign(id);
      
      const campaignLimit = campaign.concurrencyLimit || 20;
      const globalAvailable = Math.max(0, globalMaxConcurrent - globalInProgressCount);
      const campaignAvailable = Math.max(0, campaignLimit - campaignInProgressCount);
      const availableSlots = Math.min(globalAvailable, campaignAvailable);

      if (availableSlots === 0) {
        return res.json({ 
          message: "No available slots for retries", 
          globalInProgressCount,
          campaignInProgressCount,
          globalMaxConcurrent,
          campaignLimit,
          retried: 0 
        });
      }

      // Get retriable calls (filtered by maxRetries)
      const retriableCalls = await storage.getRetriableCalls(id);
      const callsToRetry = retriableCalls
        .filter(call => (call.callAttempts || 0) < maxRetries)
        .slice(0, availableSlots);

      let retriedCount = 0;
      let errorCount = 0;

      // Retry calls
      for (const call of callsToRetry) {
        try {
          const phoneNumber = call.toNumber;
          const fromNum = campaign.fromNumber || process.env.DEFAULT_FROM_NUMBER || '+18046689791';
          
          // Create call in Retell AI
          const retellCall = await retellService.createPhoneCall({
            from_number: fromNum,
            to_number: phoneNumber,
            override_agent_id: campaign.agentId,
            metadata: {
              campaignId: id,
              listId: campaign.listId,
              callId: call.id,
              isRetry: true,
            },
          });

          // Update call with Retell info and increment attempts
          await storage.updateCall(call.id, {
            callStatus: retellCall.call_status || 'registered',
            startTimestamp: retellCall.start_timestamp ? new Date(retellCall.start_timestamp) : null,
            callAttempts: (call.callAttempts || 0) + 1,
            lastAttemptAt: new Date(),
            canRetry: false, // Will be set by webhook based on outcome
          });

          await storage.incrementCampaignInProgress(id);
          retriedCount++;
        } catch (error) {
          console.error("Error retrying call:", error);
          // Still increment attempts even on error
          await storage.updateCall(call.id, {
            callStatus: 'failed',
            callAttempts: (call.callAttempts || 0) + 1,
            lastAttemptAt: new Date(),
            canRetry: (call.callAttempts || 0) + 1 < maxRetries, // Only allow retry if under limit
          });
          errorCount++;
        }
      }

      res.json({
        message: `Retried ${retriedCount} failed calls`,
        retried: retriedCount,
        errors: errorCount,
        globalInProgressCount: globalInProgressCount + retriedCount,
        campaignInProgressCount: campaignInProgressCount + retriedCount,
        globalMaxConcurrent,
        campaignLimit,
        remainingRetriable: retriableCalls.filter(c => (c.callAttempts || 0) < maxRetries).length - callsToRetry.length,
      });
    } catch (error: any) {
      console.error("Error retrying failed calls:", error);
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
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const search = req.query.search as string || '';

      const result = await storage.listCalls(userId, { limit, offset, search });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/calls/stats/appointments", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { calls } = await storage.listCalls(userId, { limit: 10000 }); // Get all calls for stats
      
      const appointmentCount = calls.filter((call: any) => {
        const analysis = call.aiAnalysis;
        return analysis?.appointmentScheduled === true;
      }).length;
      
      res.json({ count: appointmentCount });
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

  // Re-verify appointment with Cal.com
  app.post("/api/calls/:id/reverify-calcom", isAuthenticated, async (req: Request, res: Response) => {
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
      
      // Get current AI analysis
      const currentAnalysis = call.aiAnalysis as any;
      if (!currentAnalysis?.appointmentScheduled) {
        return res.status(400).json({ message: "No appointment detected in this call" });
      }
      
      // Get user settings for Cal.com credentials
      const user = await storage.getUser(userId);
      if (!user?.calcomApiKey || !user?.calcomEventTypeId) {
        return res.status(400).json({ message: "Cal.com credentials not configured" });
      }
      
      // Verify with Cal.com
      const calcomService = createCalcomService(user.calcomApiKey, user.calcomEventTypeId);
      const verification = await calcomService.verifyAppointment(
        call.toNumber,
        currentAnalysis.appointmentDetails,
        call.startTimestamp || call.createdAt || undefined
      );
      
      // Update the analysis with Cal.com verification
      const updatedAnalysis = {
        ...currentAnalysis,
        calcomVerification: {
          verified: verification.verified,
          bookingId: verification.booking?.id,
          bookingUid: verification.booking?.uid,
          bookingStart: verification.booking?.start,
          bookingEnd: verification.booking?.end,
          message: verification.message,
          checkedAt: new Date().toISOString(),
        },
        // Update customer name if Cal.com has it
        customerName: verification.booking?.attendees?.[0]?.name || currentAnalysis.customerName,
      };
      
      // Store the updated analysis
      await storage.updateCall(id, {
        aiAnalysis: updatedAnalysis as any,
      });
      
      res.json({
        message: "Cal.com verification completed",
        verification: updatedAnalysis.calcomVerification
      });
    } catch (error: any) {
      console.error('Error re-verifying with Cal.com:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get all Cal.com bookings
  app.get("/api/calcom/bookings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user?.calcomApiKey || !user?.calcomEventTypeId) {
        return res.status(400).json({ 
          message: 'Cal.com credentials not configured. Please add your Cal.com API key and Event Type ID in Settings.' 
        });
      }

      const calcomService = createCalcomService(user.calcomApiKey, user.calcomEventTypeId);
      
      // Get upcoming bookings
      const bookings = await calcomService.getBookings({ 
        status: 'upcoming',
      });

      res.json(bookings);
    } catch (error: any) {
      console.error('Error fetching Cal.com bookings:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch Cal.com bookings' });
    }
  });

  // Auto-verify all appointments with Cal.com
  app.post("/api/calls/auto-verify-appointments", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      
      // Get user's Cal.com credentials
      const user = await storage.getUser(userId);
      if (!user?.calcomApiKey || !user?.calcomEventTypeId) {
        return res.status(400).json({ message: "Cal.com credentials not configured" });
      }
      
      // Get all calls with appointments that don't have Cal.com verification yet
      const { calls: allCalls } = await storage.listCalls(userId, { limit: 10000 }); // Get all for verification
      const callsToVerify = allCalls.filter((call: any) => {
        const analysis = call.aiAnalysis;
        return analysis?.appointmentScheduled === true && !analysis?.calcomVerification;
      });
      
      if (callsToVerify.length === 0) {
        return res.json({ 
          message: "No appointments to verify",
          verified: 0,
          total: 0
        });
      }
      
      // Verify each call with Cal.com
      const calcomService = createCalcomService(user.calcomApiKey, user.calcomEventTypeId);
      let verified = 0;
      let errors = 0;
      
      for (const call of callsToVerify) {
        try {
          const currentAnalysis = call.aiAnalysis as any;
          
          const verification = await calcomService.verifyAppointment(
            call.toNumber,
            currentAnalysis.appointmentDetails,
            call.startTimestamp || call.createdAt || undefined
          );
          
          // Update the analysis with Cal.com verification
          const updatedAnalysis = {
            ...currentAnalysis,
            calcomVerification: {
              verified: verification.verified,
              bookingId: verification.booking?.id,
              bookingUid: verification.booking?.uid,
              bookingStart: verification.booking?.start,
              bookingEnd: verification.booking?.end,
              message: verification.message,
              checkedAt: new Date().toISOString(),
            },
            // Update customer name if Cal.com has it
            customerName: verification.booking?.attendees?.[0]?.name || currentAnalysis.customerName,
          };
          
          await storage.updateCall(call.id, {
            aiAnalysis: updatedAnalysis as any,
          });
          
          verified++;
        } catch (error: any) {
          console.error(`Error verifying call ${call.id}:`, error);
          errors++;
        }
      }
      
      res.json({
        message: `Verified ${verified} appointments with Cal.com`,
        verified,
        errors,
        total: callsToVerify.length
      });
    } catch (error: any) {
      console.error('Error auto-verifying appointments:', error);
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
      
      // CRITICAL FIX: Ensure call record exists BEFORE logging webhook event
      // This prevents foreign key constraint violations when webhooks arrive out of order
      if (event.call?.call_id) {
        let call = await storage.getCall(event.call.call_id);
        
        // If call doesn't exist and we have metadata, create it now
        if (!call && event.call.metadata) {
          const metadata = event.call.metadata;
          await storage.createCall({
            id: event.call.call_id,
            userId: metadata.userId,
            campaignId: metadata.campaignId,
            agentId: metadata.agentId,
            fromNumber: event.call.from_number || '',
            toNumber: event.call.to_number || '',
            callStatus: 'registered',
            startTimestamp: event.call.start_timestamp ? new Date(event.call.start_timestamp) : null,
            endTimestamp: null,
            durationMs: null,
            disconnectionReason: null,
            metadata: {
              listId: metadata.listId,
              phoneNumberId: metadata.phoneNumberId,
              isBatchCall: true,
            },
          });
          
          // Also create call log record
          await storage.createCallLog({
            id: randomUUID(),
            callId: event.call.call_id,
            transcript: null,
            recordingUrl: null,
            callSummary: null,
            callSuccessful: null,
            userSentiment: null,
            inVoicemail: null,
          });
          
          console.log(`📝 Created call record from webhook (${event.event}) for call ${event.call.call_id}`);
        } else if (!call && !event.call.metadata) {
          // Webhook for a call we don't track (probably from old campaign or manual call)
          // Return success but don't process it
          console.log(`⚠️  Ignoring webhook for unknown call ${event.call.call_id} (no metadata)`);
          return res.status(200).json({ received: true, ignored: true });
        }
      }
      
      // Now log the webhook event (call record is guaranteed to exist)
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
            // Update call status to in_progress
            await storage.updateCallStatus(
              event.call.call_id,
              'in_progress',
              event.call.start_timestamp ? new Date(event.call.start_timestamp) : undefined
            );
          }
          break;

        case 'call_ended':
          if (event.call) {
            const disconnectionReason = event.call.disconnection_reason;
            
            // Determine if call can be retried based on disconnection reason
            const retryableReasons = ['dial_no_answer', 'dial_failed', 'dial_busy'];
            const canRetry = disconnectionReason && retryableReasons.includes(disconnectionReason);
            
            // Determine if call was successful (connected and completed)
            const successfulReasons = ['user_hangup', 'agent_hangup'];
            const callSucceeded = disconnectionReason && successfulReasons.includes(disconnectionReason);
            
            await storage.updateCallStatus(
              event.call.call_id,
              event.call.call_status || 'completed',
              event.call.end_timestamp ? new Date(event.call.end_timestamp) : undefined,
              event.call.duration_ms,
              disconnectionReason,
              canRetry
            );

            // Update campaign stats when call ends
            const call = await storage.getCall(event.call.call_id);
            if (call?.campaignId) {
              await storage.handleCallEnded(call.campaignId, callSucceeded);
              
              // CRITICAL FIX: Always mark phone number as contacted after ANY call attempt
              // This prevents duplicate calls to the same number regardless of outcome
              // (voicemail, no answer, hangup, etc. all count as "contacted")
              await storage.markPhoneNumberContacted(call.toNumber);
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
                    analysis.noAppointmentReason = noAppointmentReason;
                    
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
