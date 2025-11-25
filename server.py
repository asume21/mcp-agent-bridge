#!/usr/bin/env python3
"""
MCP Agent Bridge Server
Enables communication between AI agents (Cascade, Codex, etc.)
"""

import json
import sys
from datetime import datetime
from typing import Any
from uuid import uuid4

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, Resource

# In-memory storage
messages: list[dict] = []
tasks: list[dict] = []
shared_context: dict = {
    "currentBranch": "",
    "activeFiles": [],
    "recentChanges": [],
    "notes": "",
    "lastUpdated": datetime.now().isoformat()
}

def generate_id() -> str:
    return f"{int(datetime.now().timestamp() * 1000)}-{uuid4().hex[:9]}"

# Create server
server = Server("agent-bridge")

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="send_message",
            description="Send a message to another AI agent",
            inputSchema={
                "type": "object",
                "properties": {
                    "from": {"type": "string", "description": "Your agent name (cascade, codex)"},
                    "to": {"type": "string", "description": "Target agent (cascade, codex, all)"},
                    "content": {"type": "string", "description": "Message content"}
                },
                "required": ["from", "to", "content"]
            }
        ),
        Tool(
            name="get_messages",
            description="Get messages sent to you",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent": {"type": "string", "description": "Your agent name"},
                    "unreadOnly": {"type": "boolean", "default": False}
                },
                "required": ["agent"]
            }
        ),
        Tool(
            name="mark_messages_read",
            description="Mark messages as read",
            inputSchema={
                "type": "object",
                "properties": {
                    "messageIds": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["messageIds"]
            }
        ),
        Tool(
            name="create_task",
            description="Create a task for another agent",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "assignedTo": {"type": "string"},
                    "createdBy": {"type": "string"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                    "context": {"type": "object"}
                },
                "required": ["title", "description", "assignedTo", "createdBy"]
            }
        ),
        Tool(
            name="get_tasks",
            description="Get tasks assigned to or created by you",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent": {"type": "string"},
                    "filter": {"type": "string", "enum": ["assigned", "created", "all"]},
                    "status": {"type": "string", "enum": ["pending", "in_progress", "completed", "blocked", "all"]}
                },
                "required": ["agent"]
            }
        ),
        Tool(
            name="update_task",
            description="Update a task status",
            inputSchema={
                "type": "object",
                "properties": {
                    "taskId": {"type": "string"},
                    "status": {"type": "string", "enum": ["pending", "in_progress", "completed", "blocked"]},
                    "notes": {"type": "string"}
                },
                "required": ["taskId"]
            }
        ),
        Tool(
            name="update_context",
            description="Update shared context",
            inputSchema={
                "type": "object",
                "properties": {
                    "currentBranch": {"type": "string"},
                    "activeFiles": {"type": "array", "items": {"type": "string"}},
                    "recentChanges": {"type": "array", "items": {"type": "string"}},
                    "notes": {"type": "string"}
                }
            }
        ),
        Tool(
            name="get_context",
            description="Get shared context",
            inputSchema={"type": "object", "properties": {}}
        ),
        Tool(
            name="announce_presence",
            description="Announce you are online",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent": {"type": "string"},
                    "status": {"type": "string"},
                    "workingOn": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["agent", "status"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    global shared_context
    
    if name == "send_message":
        message = {
            "id": generate_id(),
            "from": arguments["from"],
            "to": arguments["to"],
            "content": arguments["content"],
            "timestamp": datetime.now().isoformat(),
            "read": False
        }
        messages.append(message)
        return [TextContent(type="text", text=json.dumps({"success": True, "messageId": message["id"]}))]
    
    elif name == "get_messages":
        agent = arguments["agent"]
        unread_only = arguments.get("unreadOnly", False)
        filtered = [m for m in messages if m["to"] == agent or m["to"] == "all"]
        if unread_only:
            filtered = [m for m in filtered if not m["read"]]
        return [TextContent(type="text", text=json.dumps({"count": len(filtered), "messages": filtered}))]
    
    elif name == "mark_messages_read":
        ids = arguments["messageIds"]
        marked = 0
        for msg in messages:
            if msg["id"] in ids:
                msg["read"] = True
                marked += 1
        return [TextContent(type="text", text=json.dumps({"success": True, "markedRead": marked}))]
    
    elif name == "create_task":
        task = {
            "id": generate_id(),
            "title": arguments["title"],
            "description": arguments["description"],
            "assignedTo": arguments["assignedTo"],
            "createdBy": arguments["createdBy"],
            "status": "pending",
            "priority": arguments.get("priority", "medium"),
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
            "context": arguments.get("context", {})
        }
        tasks.append(task)
        # Notify assignee
        messages.append({
            "id": generate_id(),
            "from": task["createdBy"],
            "to": task["assignedTo"],
            "content": f"📋 New task: \"{task['title']}\" ({task['priority']})",
            "timestamp": datetime.now().isoformat(),
            "read": False
        })
        return [TextContent(type="text", text=json.dumps({"success": True, "taskId": task["id"]}))]
    
    elif name == "get_tasks":
        agent = arguments["agent"]
        filter_type = arguments.get("filter", "assigned")
        status_filter = arguments.get("status", "all")
        
        filtered = tasks
        if filter_type == "assigned":
            filtered = [t for t in filtered if t["assignedTo"] == agent]
        elif filter_type == "created":
            filtered = [t for t in filtered if t["createdBy"] == agent]
        if status_filter != "all":
            filtered = [t for t in filtered if t["status"] == status_filter]
        
        return [TextContent(type="text", text=json.dumps({"count": len(filtered), "tasks": filtered}))]
    
    elif name == "update_task":
        task_id = arguments["taskId"]
        task = next((t for t in tasks if t["id"] == task_id), None)
        if not task:
            return [TextContent(type="text", text=json.dumps({"error": "Task not found"}))]
        
        if "status" in arguments:
            task["status"] = arguments["status"]
        task["updatedAt"] = datetime.now().isoformat()
        
        if arguments.get("status") == "completed":
            notes = arguments.get("notes", "")
            messages.append({
                "id": generate_id(),
                "from": task["assignedTo"],
                "to": task["createdBy"],
                "content": f"✅ Completed: \"{task['title']}\"{f' - {notes}' if notes else ''}",
                "timestamp": datetime.now().isoformat(),
                "read": False
            })
        
        return [TextContent(type="text", text=json.dumps({"success": True, "task": task}))]
    
    elif name == "update_context":
        if "currentBranch" in arguments:
            shared_context["currentBranch"] = arguments["currentBranch"]
        if "activeFiles" in arguments:
            shared_context["activeFiles"] = arguments["activeFiles"]
        if "recentChanges" in arguments:
            shared_context["recentChanges"] = arguments["recentChanges"]
        if "notes" in arguments:
            shared_context["notes"] = arguments["notes"]
        shared_context["lastUpdated"] = datetime.now().isoformat()
        return [TextContent(type="text", text=json.dumps({"success": True, "context": shared_context}))]
    
    elif name == "get_context":
        return [TextContent(type="text", text=json.dumps(shared_context))]
    
    elif name == "announce_presence":
        messages.append({
            "id": generate_id(),
            "from": arguments["agent"],
            "to": "all",
            "content": f"🟢 {arguments['agent']} online: {arguments['status']}",
            "timestamp": datetime.now().isoformat(),
            "read": False
        })
        return [TextContent(type="text", text=json.dumps({"success": True}))]
    
    return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]

@server.list_resources()
async def list_resources() -> list[Resource]:
    return [
        Resource(uri="agent-bridge://messages", name="Messages", mimeType="application/json"),
        Resource(uri="agent-bridge://tasks", name="Tasks", mimeType="application/json"),
        Resource(uri="agent-bridge://context", name="Context", mimeType="application/json")
    ]

@server.read_resource()
async def read_resource(uri: str) -> str:
    if uri == "agent-bridge://messages":
        return json.dumps(messages, indent=2)
    elif uri == "agent-bridge://tasks":
        return json.dumps(tasks, indent=2)
    elif uri == "agent-bridge://context":
        return json.dumps(shared_context, indent=2)
    raise ValueError(f"Unknown resource: {uri}")

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())

if __name__ == "__main__":
    import asyncio
    print("🌉 Agent Bridge MCP Server starting...", file=sys.stderr)
    asyncio.run(main())
