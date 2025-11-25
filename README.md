# MCP Agent Bridge

An MCP server enabling AI agent-to-agent communication (Cascade ↔ Codex).

## Features

- **Messaging** - Send/receive messages between agents
- **Tasks** - Create and assign tasks between agents  
- **Shared Context** - Maintain shared state across agents
- **Presence** - Announce when online

## Setup

```bash
npm install
npm run build
```

## Configure in Windsurf

Add to your MCP settings:

```json
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["d:/mcp-servers/agent-bridge/dist/index.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `send_message` | Send message to another agent |
| `get_messages` | Get your messages |
| `create_task` | Create task for another agent |
| `get_tasks` | Get your tasks |
| `update_task` | Update task status |
| `get_context` | Get shared context |
| `update_context` | Update shared context |
| `announce_presence` | Announce you're online |

## Agent Names

- `cascade` - Windsurf Chat AI
- `codex` - Inline IDE AI
- `all` - Broadcast to all

## Example

```
// Cascade creates task for Codex
Tool: create_task
Args: {
  title: "Fix header alignment",
  description: "Button misaligned on mobile",
  assignedTo: "codex",
  createdBy: "cascade",
  priority: "high"
}
```
