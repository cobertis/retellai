import Retell from 'retell-sdk';

if (!process.env.RETELL_API_KEY) {
  throw new Error('RETELL_API_KEY environment variable is required');
}

export const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

export interface CreateAgentParams {
  agent_name: string;
  voice_id: string;
  language?: string;
  response_engine: {
    type: string;
    llm_id?: string;
  };
  general_prompt?: string;
  responsiveness?: number;
  interruption_sensitivity?: number;
}

export interface CreatePhoneCallParams {
  from_number: string;
  to_number: string;
  override_agent_id?: string;
  metadata?: Record<string, any>;
  retell_llm_dynamic_variables?: Record<string, any>;
}

export interface BatchCallTask {
  to_number: string;
  override_agent_id?: string;
  retell_llm_dynamic_variables?: Record<string, any>;
}

export interface CreateBatchCallParams {
  from_number: string;
  tasks: BatchCallTask[];
  name?: string;
  trigger_timestamp?: number;
}

export interface BatchCallResponse {
  batch_call_id: string;
  name: string;
  from_number: string;
  scheduled_timestamp: number;
  total_task_count: number;
}

export class RetellService {
  async createAgent(params: CreateAgentParams) {
    try {
      const agent = await retellClient.agent.create(params as any);
      return agent;
    } catch (error: any) {
      console.error('Error creating Retell agent:', error);
      throw new Error(error.message || 'Failed to create agent');
    }
  }

  async getAgent(agentId: string) {
    try {
      const agent = await retellClient.agent.retrieve(agentId);
      return agent;
    } catch (error: any) {
      console.error('Error retrieving Retell agent:', error);
      throw new Error(error.message || 'Failed to retrieve agent');
    }
  }

  async listAgents() {
    try {
      const agents = await retellClient.agent.list();
      return agents;
    } catch (error: any) {
      console.error('Error listing Retell agents:', error);
      throw new Error(error.message || 'Failed to list agents');
    }
  }

  async deleteAgent(agentId: string) {
    try {
      await retellClient.agent.delete(agentId);
    } catch (error: any) {
      console.error('Error deleting Retell agent:', error);
      throw new Error(error.message || 'Failed to delete agent');
    }
  }

  async getConcurrency() {
    try {
      const concurrency = await retellClient.concurrency.retrieve();
      return {
        currentConcurrency: concurrency.current_concurrency || 0,
        concurrencyLimit: concurrency.concurrency_limit || 20,
        baseConcurrency: concurrency.base_concurrency || 20,
        purchasedConcurrency: concurrency.purchased_concurrency || 0,
        availableSlots: (concurrency.concurrency_limit || 20) - (concurrency.current_concurrency || 0),
      };
    } catch (error: any) {
      console.error('Error getting Retell concurrency:', error);
      throw new Error(error.message || 'Failed to get concurrency');
    }
  }

  async createPhoneCall(params: CreatePhoneCallParams) {
    try {
      const call = await retellClient.call.createPhoneCall(params as any);
      return call;
    } catch (error: any) {
      console.error('Error creating Retell phone call:', error);
      throw new Error(error.message || 'Failed to create phone call');
    }
  }

  async getCall(callId: string) {
    try {
      const call = await retellClient.call.retrieve(callId);
      return call;
    } catch (error: any) {
      console.error('Error retrieving Retell call:', error);
      throw new Error(error.message || 'Failed to retrieve call');
    }
  }

  async listCalls() {
    try {
      const calls = await retellClient.call.list();
      return calls;
    } catch (error: any) {
      console.error('Error listing Retell calls:', error);
      throw new Error(error.message || 'Failed to list calls');
    }
  }

  // Batch Calling Methods
  async createBatchCall(params: CreateBatchCallParams): Promise<BatchCallResponse> {
    try {
      const batchCall = await retellClient.batchCall.createBatchCall(params as any);
      return batchCall;
    } catch (error: any) {
      console.error('Error creating Retell batch call:', error);
      throw new Error(error.message || 'Failed to create batch call');
    }
  }

  async retrieveBatchCall(batchCallId: string) {
    try {
      const batchCall = await retellClient.batchCall.retrieve(batchCallId);
      return batchCall;
    } catch (error: any) {
      console.error('Error retrieving Retell batch call:', error);
      throw new Error(error.message || 'Failed to retrieve batch call');
    }
  }

  async listBatchCalls() {
    try {
      const batchCalls = await retellClient.batchCall.list();
      return batchCalls;
    } catch (error: any) {
      console.error('Error listing Retell batch calls:', error);
      throw new Error(error.message || 'Failed to list batch calls');
    }
  }
}

export const retellService = new RetellService();
