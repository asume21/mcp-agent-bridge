#!/usr/bin/env node
/**
 * MCP Agent Bridge Server
 * 
 * Enables communication between AI agents (Cascade, Codex, etc.)
 * Provides tools for messaging, task management, and shared context.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Types
interface AgentMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  read: boolean;
}

interface AgentTask {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  createdBy: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
  updatedAt: string;
  context?: Record<string, unknown>;
}

interface SharedContext {
  currentBranch: string;
  activeFiles: string[];
  recentChanges: string[];
  notes: string;
  lastUpdated: string;
}

// In-memory storage
const messages: AgentMessage[] = [];
const tasks: AgentTask[] = [];
let sharedContext: SharedContext = {
  currentBranch: "",
  activeFiles: [],
  recentChanges: [],
  notes: "",
  lastUpdated: new Date().toISOString(),
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Create MCP Server
const server = new Server(
  { name: "agent-bridge", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_message",
      description: "Send a message to another AI agent",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Your agent name (cascade, codex)" },
          to: { type: "string", description: "Target agent (cascade, codex, all)" },
          content: { type: "string", description: "Message content" },
        },
        required: ["from", "to", "content"],
      },
    },
    {
      name: "get_messages",
      description: "Get messages sent to you",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Your agent name" },
          unreadOnly: { type: "boolean", default: false },
        },
        required: ["agent"],
      },
    },
    {
      name: "mark_messages_read",
      description: "Mark messages as read",
      inputSchema: {
        type: "object",
        properties: {
          messageIds: { type: "array", items: { type: "string" } },
        },
        required: ["messageIds"],
      },
    },
    {
      name: "create_task",
      description: "Create a task for another agent",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          assignedTo: { type: "string" },
          createdBy: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          context: { type: "object" },
        },
        required: ["title", "description", "assignedTo", "createdBy"],
      },
    },
    {
      name: "get_tasks",
      description: "Get tasks assigned to or created by you",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string" },
          filter: { type: "string", enum: ["assigned", "created", "all"] },
          status: { type: "string", enum: ["pending", "in_progress", "completed", "blocked", "all"] },
        },
        required: ["agent"],
      },
    },
    {
      name: "update_task",
      description: "Update a task status",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          status: { type: "string", enum: ["pending", "in_progress", "completed", "blocked"] },
          notes: { type: "string" },
        },
        required: ["taskId"],
      },
    },
    {
      name: "update_context",
      description: "Update shared context",
      inputSchema: {
        type: "object",
        properties: {
          currentBranch: { type: "string" },
          activeFiles: { type: "array", items: { type: "string" } },
          recentChanges: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
        },
      },
    },
    {
      name: "get_context",
      description: "Get shared context",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "announce_presence",
      description: "Announce you are online",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string" },
          status: { type: "string" },
          workingOn: { type: "array", items: { type: "string" } },
        },
        required: ["agent", "status"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "send_message": {
      const message: AgentMessage = {
        id: generateId(),
        from: args.from as string,
        to: args.to as string,
        content: args.content as string,
        timestamp: new Date().toISOString(),
        read: false,
      };
      messages.push(message);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, messageId: message.id }) }] };
    }

    case "get_messages": {
      const agent = args.agent as string;
      let filtered = messages.filter((m) => m.to === agent || m.to === "all");
      if (args.unreadOnly) filtered = filtered.filter((m) => !m.read);
      return { content: [{ type: "text", text: JSON.stringify({ count: filtered.length, messages: filtered }) }] };
    }

    case "mark_messages_read": {
      const ids = args.messageIds as string[];
      let marked = 0;
      for (const msg of messages) {
        if (ids.includes(msg.id)) { msg.read = true; marked++; }
      }
      return { content: [{ type: "text", text: JSON.stringify({ success: true, markedRead: marked }) }] };
    }

    case "create_task": {
      const task: AgentTask = {
        id: generateId(),
        title: args.title as string,
        description: args.description as string,
        assignedTo: args.assignedTo as string,
        createdBy: args.createdBy as string,
        status: "pending",
        priority: (args.priority as AgentTask["priority"]) || "medium",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        context: args.context as Record<string, unknown>,
      };
      tasks.push(task);
      messages.push({
        id: generateId(),
        from: task.createdBy,
        to: task.assignedTo,
        content: `📋 New task: "${task.title}" (${task.priority})`,
        timestamp: new Date().toISOString(),
        read: false,
      });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, taskId: task.id }) }] };
    }

    case "get_tasks": {
      const agent = args.agent as string;
      const filter = (args.filter as string) || "assigned";
      const status = (args.status as string) || "all";
      let filtered = tasks;
      if (filter === "assigned") filtered = filtered.filter((t) => t.assignedTo === agent);
      else if (filter === "created") filtered = filtered.filter((t) => t.createdBy === agent);
      if (status !== "all") filtered = filtered.filter((t) => t.status === status);
      return { content: [{ type: "text", text: JSON.stringify({ count: filtered.length, tasks: filtered }) }] };
    }

    case "update_task": {
      const task = tasks.find((t) => t.id === args.taskId);
      if (!task) return { content: [{ type: "text", text: JSON.stringify({ error: "Task not found" }) }] };
      if (args.status) task.status = args.status as AgentTask["status"];
      task.updatedAt = new Date().toISOString();
      if (args.status === "completed") {
        messages.push({
          id: generateId(),
          from: task.assignedTo,
          to: task.createdBy,
          content: `✅ Completed: "${task.title}"${args.notes ? ` - ${args.notes}` : ""}`,
          timestamp: new Date().toISOString(),
          read: false,
        });
      }
      return { content: [{ type: "text", text: JSON.stringify({ success: true, task }) }] };
    }

    case "update_context": {
      if (args.currentBranch) sharedContext.currentBranch = args.currentBranch as string;
      if (args.activeFiles) sharedContext.activeFiles = args.activeFiles as string[];
      if (args.recentChanges) sharedContext.recentChanges = args.recentChanges as string[];
      if (args.notes) sharedContext.notes = args.notes as string;
      sharedContext.lastUpdated = new Date().toISOString();
      return { content: [{ type: "text", text: JSON.stringify({ success: true, context: sharedContext }) }] };
    }

    case "get_context": {
      return { content: [{ type: "text", text: JSON.stringify(sharedContext) }] };
    }

    case "announce_presence": {
      messages.push({
        id: generateId(),
        from: args.agent as string,
        to: "all",
        content: `🟢 ${args.agent} online: ${args.status}`,
        timestamp: new Date().toISOString(),
        read: false,
      });
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }

    default:
      return { content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
  }
});

// Resources
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: "agent-bridge://messages", name: "Messages", mimeType: "application/json" },
    { uri: "agent-bridge://tasks", name: "Tasks", mimeType: "application/json" },
    { uri: "agent-bridge://context", name: "Context", mimeType: "application/json" },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const data = uri === "agent-bridge://messages" ? messages 
             : uri === "agent-bridge://tasks" ? tasks 
             : uri === "agent-bridge://context" ? sharedContext 
             : null;
  if (!data) throw new Error(`Unknown resource: ${uri}`);
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🌉 Agent Bridge MCP Server running");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
