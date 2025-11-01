import { db } from "./db";
import { eq, desc, and, sql, count } from "drizzle-orm";
import {
  users,
  type User,
  type UpsertUser,
  agents,
  type Agent,
  type InsertAgent,
  phoneLists,
  type PhoneList,
  type InsertPhoneList,
  phoneNumbers,
  type PhoneNumber,
  type InsertPhoneNumber,
  campaigns,
  type Campaign,
  type InsertCampaign,
  calls,
  type Call,
  type InsertCall,
  callLogs,
  type CallLog,
  type InsertCallLog,
  webhookEvents,
  type WebhookEvent,
  type InsertWebhookEvent,
} from "@shared/schema";

export interface IStorage {
  // User operations - Local Auth
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserWithPassword(email: string): Promise<any | undefined>;
  createUser(email: string, password: string, firstName?: string, lastName?: string): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserSettings(id: string, settings: { defaultAgentId?: string; calcomApiKey?: string; calcomEventTypeId?: string }): Promise<User | undefined>;

  // Agent operations
  createAgent(userId: string, agent: InsertAgent & { id?: string }): Promise<Agent>;
  getAgent(id: string): Promise<Agent | undefined>;
  listAgents(userId: string): Promise<Agent[]>;
  deleteAgent(id: string): Promise<void>;

  // Phone List operations
  createPhoneList(userId: string, list: InsertPhoneList): Promise<PhoneList>;
  getPhoneList(id: string): Promise<PhoneList | undefined>;
  listPhoneLists(userId: string): Promise<PhoneList[]>;
  updatePhoneList(id: string, totalNumbers: number): Promise<void>;
  updatePhoneListDetails(id: string, data: Partial<InsertPhoneList>): Promise<PhoneList | undefined>;
  deletePhoneList(id: string): Promise<void>;

  // Phone Number operations
  createPhoneNumbers(numbers: InsertPhoneNumber[]): Promise<void>;
  createPhoneNumber(number: InsertPhoneNumber): Promise<PhoneNumber>;
  getPhoneNumber(id: string): Promise<PhoneNumber | undefined>;
  getPhoneNumbersByList(listId: string): Promise<PhoneNumber[]>;
  updatePhoneNumber(id: string, data: Partial<Omit<InsertPhoneNumber, 'listId'>>): Promise<PhoneNumber | undefined>;
  deletePhoneNumber(id: string): Promise<void>;

  // Campaign operations
  createCampaign(userId: string, campaign: InsertCampaign): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  listCampaigns(userId: string): Promise<Campaign[]>;
  updateCampaignStatus(id: string, status: string): Promise<void>;
  updateCampaignStats(id: string, stats: {
    totalCalls?: number;
    completedCalls?: number;
    failedCalls?: number;
    inProgressCalls?: number;
    startedAt?: Date;
    completedAt?: Date;
  }): Promise<void>;
  incrementCampaignInProgress(id: string): Promise<void>;
  incrementCampaignFailed(id: string): Promise<void>;
  handleCallEnded(campaignId: string, callSuccessful: boolean): Promise<void>;
  deleteCampaign(id: string): Promise<void>;
  stopCampaign(id: string): Promise<void>;

  // Call operations
  createCall(call: InsertCall): Promise<Call>;
  getCall(id: string): Promise<Call | undefined>;
  listCalls(userId: string): Promise<Call[]>;
  getActiveCalls(userId: string): Promise<Call[]>;
  updateCallStatus(id: string, status: string, endTimestamp?: Date, durationMs?: number, disconnectionReason?: string): Promise<void>;
  updateCall(id: string, data: Partial<Omit<Call, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<void>;

  // Call Log operations
  createCallLog(log: InsertCallLog): Promise<void>;
  getCallLog(callId: string): Promise<CallLog | undefined>;
  updateCallLog(callId: string, data: Partial<InsertCallLog>): Promise<void>;

  // Webhook Event operations
  createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent>;
  markWebhookProcessed(id: string): Promise<void>;

  // Analytics and Stats
  getDashboardStats(userId: string): Promise<any>;
  getAnalytics(userId: string): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
      defaultAgentId: users.defaultAgentId,
      calcomApiKey: users.calcomApiKey,
      calcomEventTypeId: users.calcomEventTypeId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    }).from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
      defaultAgentId: users.defaultAgentId,
      calcomApiKey: users.calcomApiKey,
      calcomEventTypeId: users.calcomEventTypeId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    }).from(users).where(eq(users.email, email));
    return user;
  }

  async getUserWithPassword(email: string): Promise<any | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(email: string, password: string, firstName?: string, lastName?: string): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email,
        password,
        firstName: firstName || null,
        lastName: lastName || null,
      })
      .returning();
    
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      defaultAgentId: user.defaultAgentId,
      calcomApiKey: user.calcomApiKey,
      calcomEventTypeId: user.calcomEventTypeId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      defaultAgentId: user.defaultAgentId,
      calcomApiKey: user.calcomApiKey,
      calcomEventTypeId: user.calcomEventTypeId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async updateUserSettings(id: string, settings: { defaultAgentId?: string; calcomApiKey?: string; calcomEventTypeId?: string }): Promise<User | undefined> {
    const updateData: any = {
      updatedAt: new Date(),
    };
    
    if (settings.defaultAgentId !== undefined) {
      updateData.defaultAgentId = settings.defaultAgentId || null;
    }
    if (settings.calcomApiKey !== undefined) {
      updateData.calcomApiKey = settings.calcomApiKey || null;
    }
    if (settings.calcomEventTypeId !== undefined) {
      updateData.calcomEventTypeId = settings.calcomEventTypeId || null;
    }
    
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    if (!user) {
      return undefined;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      defaultAgentId: user.defaultAgentId,
      calcomApiKey: user.calcomApiKey,
      calcomEventTypeId: user.calcomEventTypeId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // Agent operations
  async createAgent(userId: string, agentData: InsertAgent & { id?: string }): Promise<Agent> {
    const [agent] = await db
      .insert(agents)
      .values({ ...agentData, userId } as any)
      .returning();
    return agent;
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent;
  }

  async listAgents(userId: string): Promise<Agent[]> {
    return await db
      .select()
      .from(agents)
      .where(eq(agents.userId, userId))
      .orderBy(desc(agents.createdAt));
  }

  async deleteAgent(id: string): Promise<void> {
    await db.delete(agents).where(eq(agents.id, id));
  }

  // Phone List operations
  async createPhoneList(userId: string, listData: InsertPhoneList): Promise<PhoneList> {
    const [list] = await db
      .insert(phoneLists)
      .values({ ...listData, userId })
      .returning();
    return list;
  }

  async getPhoneList(id: string): Promise<PhoneList | undefined> {
    const [list] = await db.select().from(phoneLists).where(eq(phoneLists.id, id));
    return list;
  }

  async listPhoneLists(userId: string): Promise<PhoneList[]> {
    return await db
      .select()
      .from(phoneLists)
      .where(eq(phoneLists.userId, userId))
      .orderBy(desc(phoneLists.createdAt));
  }

  async updatePhoneList(id: string, totalNumbers: number): Promise<void> {
    await db
      .update(phoneLists)
      .set({ totalNumbers, updatedAt: new Date() })
      .where(eq(phoneLists.id, id));
  }

  async updatePhoneListDetails(id: string, data: Partial<InsertPhoneList>): Promise<PhoneList | undefined> {
    const [list] = await db
      .update(phoneLists)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(phoneLists.id, id))
      .returning();
    return list;
  }

  async deletePhoneList(id: string): Promise<void> {
    await db.delete(phoneLists).where(eq(phoneLists.id, id));
  }

  // Phone Number operations
  async createPhoneNumbers(numbers: InsertPhoneNumber[]): Promise<void> {
    if (numbers.length > 0) {
      await db.insert(phoneNumbers).values(numbers);
    }
  }

  async createPhoneNumber(number: InsertPhoneNumber): Promise<PhoneNumber> {
    const [phoneNumber] = await db
      .insert(phoneNumbers)
      .values(number)
      .returning();
    return phoneNumber;
  }

  async getPhoneNumber(id: string): Promise<PhoneNumber | undefined> {
    const [number] = await db.select().from(phoneNumbers).where(eq(phoneNumbers.id, id));
    return number;
  }

  async getPhoneNumbersByList(listId: string): Promise<PhoneNumber[]> {
    return await db
      .select()
      .from(phoneNumbers)
      .where(eq(phoneNumbers.listId, listId))
      .orderBy(desc(phoneNumbers.createdAt));
  }

  async updatePhoneNumber(id: string, data: Partial<Omit<InsertPhoneNumber, 'listId'>>): Promise<PhoneNumber | undefined> {
    const [number] = await db
      .update(phoneNumbers)
      .set(data)
      .where(eq(phoneNumbers.id, id))
      .returning();
    return number;
  }

  async deletePhoneNumber(id: string): Promise<void> {
    await db.delete(phoneNumbers).where(eq(phoneNumbers.id, id));
  }

  // Campaign operations
  async createCampaign(userId: string, campaignData: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db
      .insert(campaigns)
      .values({ ...campaignData, userId })
      .returning();
    return campaign;
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign;
  }

  async listCampaigns(userId: string): Promise<Campaign[]> {
    return await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.userId, userId))
      .orderBy(desc(campaigns.createdAt));
  }

  async updateCampaignStatus(id: string, status: string): Promise<void> {
    const updateData: any = { status, updatedAt: new Date() };
    
    if (status === 'active') {
      updateData.startedAt = new Date();
    } else if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    await db
      .update(campaigns)
      .set(updateData)
      .where(eq(campaigns.id, id));
  }

  async updateCampaignStats(id: string, stats: {
    totalCalls?: number;
    completedCalls?: number;
    failedCalls?: number;
    inProgressCalls?: number;
    startedAt?: Date;
    completedAt?: Date;
  }): Promise<void> {
    await db
      .update(campaigns)
      .set({ ...stats, updatedAt: new Date() })
      .where(eq(campaigns.id, id));
  }

  async incrementCampaignInProgress(id: string): Promise<void> {
    await db
      .update(campaigns)
      .set({
        inProgressCalls: sql`COALESCE(${campaigns.inProgressCalls}, 0) + 1`,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id));
  }

  async incrementCampaignFailed(id: string): Promise<void> {
    await db
      .update(campaigns)
      .set({
        failedCalls: sql`COALESCE(${campaigns.failedCalls}, 0) + 1`,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id));
  }

  async handleCallEnded(campaignId: string, callSuccessful: boolean): Promise<void> {
    // Atomically update campaign stats and mark as completed if all calls are done
    // This is done in a single UPDATE statement to avoid race conditions
    await db
      .update(campaigns)
      .set({
        inProgressCalls: sql`GREATEST(COALESCE(${campaigns.inProgressCalls}, 0) - 1, 0)`,
        completedCalls: callSuccessful 
          ? sql`COALESCE(${campaigns.completedCalls}, 0) + 1`
          : campaigns.completedCalls,
        failedCalls: !callSuccessful 
          ? sql`COALESCE(${campaigns.failedCalls}, 0) + 1`
          : campaigns.failedCalls,
        status: sql`CASE 
          WHEN ${campaigns.status} = 'active' AND (GREATEST(COALESCE(${campaigns.inProgressCalls}, 0) - 1, 0)) = 0 
          THEN 'completed' 
          ELSE ${campaigns.status} 
        END`,
        completedAt: sql`CASE 
          WHEN ${campaigns.status} = 'active' AND (GREATEST(COALESCE(${campaigns.inProgressCalls}, 0) - 1, 0)) = 0 
          THEN NOW() 
          ELSE ${campaigns.completedAt} 
        END`,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
  }

  async deleteCampaign(id: string): Promise<void> {
    await db.delete(campaigns).where(eq(campaigns.id, id));
  }

  async stopCampaign(id: string): Promise<void> {
    await db
      .update(campaigns)
      .set({ 
        status: 'paused',
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id));
  }

  // Call operations
  async createCall(callData: InsertCall): Promise<Call> {
    const [call] = await db
      .insert(calls)
      .values(callData)
      .returning();
    return call;
  }

  async getCall(id: string): Promise<Call | undefined> {
    const [call] = await db.select().from(calls).where(eq(calls.id, id));
    return call;
  }

  async listCalls(userId: string): Promise<Call[]> {
    return await db
      .select()
      .from(calls)
      .where(eq(calls.userId, userId))
      .orderBy(desc(calls.createdAt))
      .limit(100);
  }

  async getActiveCalls(userId: string): Promise<Call[]> {
    return await db
      .select()
      .from(calls)
      .where(
        and(
          eq(calls.userId, userId),
          sql`${calls.callStatus} IN ('registered', 'ongoing', 'in_progress', 'queued')`
        )
      )
      .orderBy(desc(calls.createdAt));
  }

  async updateCallStatus(
    id: string,
    status: string,
    endTimestamp?: Date,
    durationMs?: number,
    disconnectionReason?: string
  ): Promise<void> {
    const updateData: any = { callStatus: status, updatedAt: new Date() };
    
    if (endTimestamp) updateData.endTimestamp = endTimestamp;
    if (durationMs !== undefined) updateData.durationMs = durationMs;
    if (disconnectionReason) updateData.disconnectionReason = disconnectionReason;

    await db
      .update(calls)
      .set(updateData)
      .where(eq(calls.id, id));
  }

  async updateCall(id: string, data: Partial<Omit<Call, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    await db
      .update(calls)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(calls.id, id));
  }

  // Call Log operations
  async createCallLog(logData: InsertCallLog): Promise<void> {
    await db.insert(callLogs).values(logData);
  }

  async getCallLog(callId: string): Promise<CallLog | undefined> {
    const [log] = await db.select().from(callLogs).where(eq(callLogs.callId, callId));
    return log;
  }

  async updateCallLog(callId: string, data: Partial<InsertCallLog>): Promise<void> {
    await db
      .update(callLogs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(callLogs.callId, callId));
  }

  // Webhook Event operations
  async createWebhookEvent(eventData: InsertWebhookEvent): Promise<WebhookEvent> {
    const [event] = await db
      .insert(webhookEvents)
      .values(eventData)
      .returning();
    return event;
  }

  async markWebhookProcessed(id: string): Promise<void> {
    await db
      .update(webhookEvents)
      .set({ processed: true })
      .where(eq(webhookEvents.id, id));
  }

  // Analytics and Stats
  async getDashboardStats(userId: string): Promise<any> {
    // Get total counts
    const [agentCount] = await db
      .select({ count: count() })
      .from(agents)
      .where(eq(agents.userId, userId));

    const [listCount] = await db
      .select({ count: count() })
      .from(phoneLists)
      .where(eq(phoneLists.userId, userId));

    const [callCount] = await db
      .select({ count: count() })
      .from(calls)
      .where(eq(calls.userId, userId));

    const [activeCampaignCount] = await db
      .select({ count: count() })
      .from(campaigns)
      .where(and(
        eq(campaigns.userId, userId),
        eq(campaigns.status, 'active')
      ));

    // Get calls today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [callsToday] = await db
      .select({ count: count() })
      .from(calls)
      .where(and(
        eq(calls.userId, userId),
        sql`${calls.createdAt} >= ${today}`
      ));

    // Get success rate
    const allCalls = await db
      .select()
      .from(calls)
      .where(eq(calls.userId, userId));

    const completedCalls = allCalls.filter(c => c.callStatus === 'completed').length;
    const successRate = allCalls.length > 0 ? (completedCalls / allCalls.length) * 100 : 0;

    // Get average duration
    const callsWithDuration = allCalls.filter(c => c.durationMs && c.durationMs > 0);
    const avgDuration = callsWithDuration.length > 0
      ? callsWithDuration.reduce((sum, c) => sum + (c.durationMs || 0), 0) / callsWithDuration.length
      : 0;

    // Get total cost from call logs (Retell stores cost in cents, so divide by 100)
    const callLogsData = await db.select().from(callLogs);
    const totalCost = callLogsData.reduce((sum, log) => {
      const cost = (log.callCost as any)?.combined_cost || 0;
      return sum + (cost / 100); // Convert cents to dollars
    }, 0);

    // Get recent calls (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentCalls = await db
      .select()
      .from(calls)
      .where(and(
        eq(calls.userId, userId),
        sql`${calls.createdAt} >= ${sevenDaysAgo}`
      ));

    // Group by day
    const callsByDay: { [key: string]: number } = {};
    recentCalls.forEach(call => {
      if (call.createdAt) {
        const date = new Date(call.createdAt).toISOString().split('T')[0];
        callsByDay[date] = (callsByDay[date] || 0) + 1;
      }
    });

    const recentCallsData = Object.entries(callsByDay).map(([date, calls]) => ({
      date,
      calls,
    }));

    // Call status breakdown
    const statusBreakdown: { [key: string]: number } = {};
    allCalls.forEach(call => {
      statusBreakdown[call.callStatus] = (statusBreakdown[call.callStatus] || 0) + 1;
    });

    const callStatusBreakdown = Object.entries(statusBreakdown).map(([status, count]) => ({
      status,
      count,
    }));

    return {
      totalAgents: agentCount.count,
      totalPhoneLists: listCount.count,
      totalCalls: callCount.count,
      activeCampaigns: activeCampaignCount.count,
      callsToday: callsToday.count,
      successRate,
      avgDuration,
      totalCost,
      recentCalls: recentCallsData,
      callStatusBreakdown,
    };
  }

  async getAnalytics(userId: string): Promise<any> {
    const allCalls = await db
      .select()
      .from(calls)
      .where(eq(calls.userId, userId));

    const allLogs = await db.select().from(callLogs);

    const successfulCalls = allCalls.filter(c => c.callStatus === 'completed').length;
    const failedCalls = allCalls.filter(c => c.callStatus === 'failed').length;

    const callsWithDuration = allCalls.filter(c => c.durationMs && c.durationMs > 0);
    const avgDuration = callsWithDuration.length > 0
      ? callsWithDuration.reduce((sum, c) => sum + (c.durationMs || 0), 0) / callsWithDuration.length
      : 0;

    const totalCost = allLogs.reduce((sum, log) => {
      const cost = (log.callCost as any)?.combined_cost || 0;
      return sum + (cost / 100); // Convert cents to dollars
    }, 0);

    const avgCost = allCalls.length > 0 ? totalCost / allCalls.length : 0;

    // Calls by day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentCalls = allCalls.filter(c => c.createdAt && new Date(c.createdAt) >= thirtyDaysAgo);

    const callsByDay: { [key: string]: { calls: number; successful: number; failed: number } } = {};
    recentCalls.forEach(call => {
      if (call.createdAt) {
        const date = new Date(call.createdAt).toISOString().split('T')[0];
        if (!callsByDay[date]) {
          callsByDay[date] = { calls: 0, successful: 0, failed: 0 };
        }
        callsByDay[date].calls++;
        if (call.callStatus === 'completed') callsByDay[date].successful++;
        if (call.callStatus === 'failed') callsByDay[date].failed++;
      }
    });

    const callsByDayData = Object.entries(callsByDay).map(([date, data]) => ({
      date,
      ...data,
    }));

    // Calls by agent
    const agentsList = await db.select().from(agents).where(eq(agents.userId, userId));
    const callsByAgent = agentsList.map(agent => {
      const agentCalls = allCalls.filter(c => c.agentId === agent.id);
      const agentSuccessful = agentCalls.filter(c => c.callStatus === 'completed').length;
      const successRate = agentCalls.length > 0 ? (agentSuccessful / agentCalls.length) * 100 : 0;
      
      return {
        agentName: agent.name,
        calls: agentCalls.length,
        successRate,
      };
    });

    // Sentiment breakdown
    const sentimentBreakdown: { [key: string]: number } = {};
    allLogs.forEach(log => {
      if (log.userSentiment) {
        sentimentBreakdown[log.userSentiment] = (sentimentBreakdown[log.userSentiment] || 0) + 1;
      }
    });

    const sentimentBreakdownData = Object.entries(sentimentBreakdown).map(([sentiment, count]) => ({
      sentiment,
      count,
    }));

    // Cost by day (Retell stores cost in cents, so divide by 100)
    const costByDay: { [key: string]: number } = {};
    allLogs.forEach(log => {
      const call = allCalls.find(c => c.id === log.callId);
      if (call && call.createdAt) {
        const date = new Date(call.createdAt).toISOString().split('T')[0];
        const cost = (log.callCost as any)?.combined_cost || 0;
        costByDay[date] = (costByDay[date] || 0) + (cost / 100); // Convert cents to dollars
      }
    });

    const costByDayData = Object.entries(costByDay).map(([date, cost]) => ({
      date,
      cost,
    }));

    return {
      totalCalls: allCalls.length,
      successfulCalls,
      failedCalls,
      avgDuration,
      totalCost,
      avgCost,
      callsByDay: callsByDayData,
      callsByAgent,
      sentimentBreakdown: sentimentBreakdownData,
      costByDay: costByDayData,
    };
  }
}

export const storage = new DatabaseStorage();
