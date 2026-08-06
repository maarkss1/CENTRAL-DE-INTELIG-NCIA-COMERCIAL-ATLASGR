import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { HumanMessage, BaseMessage, AIMessage } from "@langchain/core/messages";
import { logger } from "../../src/lib/logger.js";

// Define the state for the agent
interface AgentState {
  messages: BaseMessage[];
  objective: string;
  status: "idle" | "researching" | "compiling" | "completed";
}

export class AutonomousAgent {
  private llm: ChatOpenAI;
  private graph!: ReturnType<StateGraph<AgentState>['compile']>;

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.2,
    });
    this.setupGraph();
  }

  private setupGraph() {
    // 1. Define nodes
    const planTask = async (state: AgentState) => {
      logger.info({ objective: state.objective }, "Agent: Planning for objective");
      const msg = new AIMessage(`I have analyzed the objective: ${state.objective}. Starting research phase.`);
      return { messages: [msg], status: "researching" };
    };

    const executeResearch = async (state: AgentState) => {
      logger.info("Agent: Executing research phase...");
      // Mocking a tool call or external API fetch here
      const researchResult = new AIMessage("Research completed. Found relevant data points.");
      return { messages: [researchResult], status: "compiling" };
    };

    const compileReport = async (state: AgentState) => {
      logger.info("Agent: Compiling final report...");
      const finalReport = new AIMessage(`Final Report for ${state.objective}: Analysis indicates successful data extraction.`);
      return { messages: [finalReport], status: "completed" };
    };

    // 2. Define the graph
    const workflow = new StateGraph<AgentState>({
      channels: {
        messages: {
          value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
          default: () => [],
        },
        objective: {
          value: (x: string, y: string) => y ?? x,
          default: () => "",
        },
        status: {
          value: (x: string, y: string) => y ?? x,
          default: () => "idle",
        },
      }
    });

    workflow.addNode("plan", planTask);
    workflow.addNode("research", executeResearch);
    workflow.addNode("compile", compileReport);

    workflow.addEdge(START, "plan");
    workflow.addEdge("plan", "research");
    workflow.addEdge("research", "compile");
    workflow.addEdge("compile", END);

    const memory = new MemorySaver();
    this.graph = workflow.compile({ checkpointer: memory });
  }

  /**
   * Starts an autonomous background workflow.
   */
  async startWorkflow(objective: string, threadId: string) {
    const config = { configurable: { thread_id: threadId } };
    
    logger.info({ threadId }, "🚀 Starting Autonomous Agent");
    
    const stream = await this.graph.stream(
      { 
        objective, 
        messages: [new HumanMessage(objective)],
        status: "idle" 
      },
      config
    );

    for await (const value of stream) {
      logger.info({ value }, "Agent State Update");
    }
    
    return await this.graph.getState(config);
  }
}
