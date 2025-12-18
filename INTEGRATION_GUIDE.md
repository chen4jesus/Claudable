# Claudable Integration Guide

## Overview

This guide explains how to integrate Claudable's chat agent capabilities into your existing project. Claudable is built with Next.js and uses Claude Code/Cursor CLI to make code changes to projects through natural language prompts.

## Architecture Overview

Claudable consists of several key components:

1. **Frontend Chat Interface** - React/Next.js UI for user interaction
2. **Backend API Routes** - Next.js API routes that handle chat requests
3. **CLI Integration Layer** - Services that communicate with Claude Code, Cursor CLI, Qwen, etc.
4. **Database Layer** - Prisma + SQLite for storing projects, messages, and sessions
5. **Stream Manager** - Server-Sent Events (SSE) for real-time updates

## Integration Approaches

### Approach 1: Standalone Service (Recommended)

Run Claudable as a separate service that can manage multiple external projects.

#### Steps:

1. **Clone and Setup Claudable**

   ```bash
   git clone https://github.com/opactorai/Claudable.git
   cd Claudable
   npm install
   ```

2. **Configure Environment**
   Create/modify `.env.local`:

   ```env
   # Point to your external project directory
   PROJECTS_DIR=C:/path/to/your/projects

   # API base URL
   NEXT_PUBLIC_API_BASE=http://localhost:3000

   # Database
   DATABASE_URL="file:./data/cc.db"
   ```

3. **Modify Project Service to Support External Projects**

   Edit `lib/services/project.ts` to allow creating projects that point to external directories:

   ```typescript
   export async function createProject(data: {
     name: string;
     repoPath?: string; // Path to your existing project
     initialPrompt?: string;
     preferredCli?: string;
     selectedModel?: string;
   }) {
     // Implementation that supports external paths
   }
   ```

4. **Start Claudable**

   ```bash
   npm run dev
   ```

5. **Create Project Pointing to Your Existing Codebase**

   Via API:

   ```javascript
   const response = await fetch("http://localhost:3000/api/projects", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({
       name: "My Existing Project",
       repoPath: "C:/path/to/your/existing/project",
       preferredCli: "claude",
       selectedModel: "claude-sonnet-4-5",
     }),
   });
   ```

6. **Use the Chat Interface**
   Navigate to `http://localhost:3000/{project_id}/chat` and start making changes!

### Approach 2: Embedded Integration

Integrate Claudable's components directly into your existing Next.js app.

#### Required Components:

1. **Chat Interface** - `components/chat/ChatInput.tsx` and `components/chat/ChatLog.tsx`
2. **API Routes** - Copy from `app/api/chat/[project_id]/`
3. **Services** - Copy from `lib/services/`
4. **Database Schema** - Use Prisma schema from `prisma/schema.prisma`

#### Steps:

1. **Install Dependencies**

   ```bash
   npm install @anthropic-ai/claude-agent-sdk @prisma/client ws zod
   npm install -D prisma
   ```

2. **Copy Core Files**

   ```
   your-project/
   ├── app/api/chat/[project_id]/
   │   ├── act/route.ts          # Main AI execution endpoint
   │   ├── stream/route.ts       # SSE streaming
   │   └── messages/route.ts     # Message history
   ├── lib/
   │   ├── services/
   │   │   ├── cli/
   │   │   │   └── claude.ts     # Claude Code integration
   │   │   ├── message.ts
   │   │   ├── project.ts
   │   │   └── stream.ts
   │   └── constants/
   │       └── cliModels.ts
   └── components/chat/
       ├── ChatInput.tsx
       └── ChatLog.tsx
   ```

3. **Setup Database**

   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Add to Your Page**

   ```tsx
   import ChatInput from "@/components/chat/ChatInput";
   import ChatLog from "@/components/chat/ChatLog";

   export default function MyPage() {
     const projectId = "your-project-id";

     return (
       <div>
         <ChatLog projectId={projectId} />
         <ChatInput
           projectId={projectId}
           onSendMessage={async (message, images) => {
             await fetch(`/api/chat/${projectId}/act`, {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({
                 instruction: message,
                 images: images,
                 cliPreference: "claude",
               }),
             });
           }}
         />
       </div>
     );
   }
   ```

## Key API Endpoints

### 1. Execute AI Command

**POST** `/api/chat/[project_id]/act`

Sends a prompt to the AI agent to make changes to your project.

```javascript
await fetch("/api/chat/{project_id}/act", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    instruction: "Add a new login page with email/password fields",
    images: [
      {
        name: "mockup.png",
        path: "/absolute/path/to/image.png",
        url: "/api/assets/project-id/image.png",
      },
    ],
    cliPreference: "claude", // or 'cursor', 'codex', 'qwen', 'glm'
    selectedModel: "claude-sonnet-4-5",
    isInitialPrompt: false,
    conversationId: "conversation-id",
    requestId: "unique-request-id",
  }),
});
```

### 2. Stream Updates

**GET** `/api/chat/[project_id]/stream`

SSE endpoint for real-time updates.

```javascript
const eventSource = new EventSource("/api/chat/{project_id}/stream");

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "message":
      // New message from AI
      console.log("Message:", data.data);
      break;
    case "status":
      // Status update
      console.log("Status:", data.data);
      break;
    case "connected":
      console.log("Connected to stream");
      break;
  }
};
```

### 3. Get Messages

**GET** `/api/chat/[project_id]/messages`

Retrieve conversation history.

```javascript
const response = await fetch("/api/chat/{project_id}/messages");
const messages = await response.json();
```

## CLI Integration Details

### How It Works

1. User sends a prompt through the chat interface
2. Frontend calls `/api/chat/[project_id]/act`
3. Backend creates a user message in the database
4. Backend spawns the appropriate CLI (Claude Code, Cursor, etc.) as a child process
5. CLI makes changes to the project files
6. Real-time updates stream back via SSE
7. AI responses are saved to the database

### Supported CLI Agents

- **Claude Code** (`lib/services/cli/claude.ts`)
- **Cursor CLI** (`lib/services/cli/cursor.ts`)
- **Codex CLI** (`lib/services/cli/codex.ts`)
- **Qwen Code** (`lib/services/cli/qwen.ts`)
- **GLM-4.6** (`lib/services/cli/glm.ts`)

Each CLI service implements two main functions:

- `initializeNextJsProject()` - For first-time project setup
- `applyChanges()` - For making changes to existing projects

## Configuration

### Environment Variables

```env
# Projects directory (where code changes are made)
PROJECTS_DIR=./data/projects

# Database
DATABASE_URL="file:./data/cc.db"

# API Base
NEXT_PUBLIC_API_BASE=http://localhost:3000

# CLI Preferences (optional)
DEFAULT_CLI=claude
CLAUDE_DEFAULT_MODEL=claude-sonnet-4-5
```

### Database Schema

Key tables:

- `Project` - Stores project metadata
- `Message` - Chat messages and AI responses
- `UserRequest` - Tracks user prompts and their status

## Example: Full Integration Flow

```typescript
// 1. Create a project pointing to your existing codebase
const createProject = async () => {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "My Web App",
      repoPath: "/absolute/path/to/my-web-app",
      preferredCli: "claude",
      selectedModel: "claude-sonnet-4-5",
    }),
  });

  const { id } = await response.json();
  return id;
};

// 2. Setup SSE stream for real-time updates
const setupStream = (projectId: string) => {
  const eventSource = new EventSource(`/api/chat/${projectId}/stream`);

  eventSource.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    console.log("Update:", data);
  });

  return eventSource;
};

// 3. Send a prompt to make changes
const sendPrompt = async (projectId: string, prompt: string) => {
  await fetch(`/api/chat/${projectId}/act`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instruction: prompt,
      cliPreference: "claude",
      selectedModel: "claude-sonnet-4-5",
      isInitialPrompt: false,
    }),
  });
};

// Usage
const projectId = await createProject();
const stream = setupStream(projectId);
await sendPrompt(projectId, "Add a dark mode toggle to the navbar");
```

## Custom UI Integration

If you want to build your own chat UI instead of using Claudable's components:

```tsx
"use client";
import { useState, useEffect } from "react";

export default function CustomChat({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  // Setup SSE
  useEffect(() => {
    const eventSource = new EventSource(`/api/chat/${projectId}/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message") {
        setMessages((prev) => [...prev, data.data]);
      }
    };

    return () => eventSource.close();
  }, [projectId]);

  const sendMessage = async () => {
    await fetch(`/api/chat/${projectId}/act`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: input,
        cliPreference: "claude",
      }),
    });

    setInput("");
  };

  return (
    <div>
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i}>{msg.content}</div>
        ))}
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
      />
    </div>
  );
}
```

## Security Considerations

1. **File System Access**: Claudable CLIs have access to your file system. Only allow trusted users.
2. **API Authentication**: Add authentication to API routes in production.
3. **CORS**: Configure CORS if running Claudable separately from your main app.
4. **Environment Variables**: Never expose API keys or sensitive data.

## Troubleshooting

### CLI Not Found

Ensure the CLI is installed and in your PATH:

```bash
claude --version
cursor-agent --version
```

### Permission Errors

Make sure Claudable has write permissions to your project directory.

### SSE Connection Issues

Check that your server supports long-running connections and SSE.

## Next Steps

1. Review the example projects in the `data/projects` directory
2. Examine `app/api/chat/[project_id]/act/route.ts` for the main execution logic
3. Study `lib/services/cli/claude.ts` to understand CLI integration
4. Customize the frontend components to match your design system

## Resources

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code/setup)
- [Cursor CLI Documentation](https://cursor.com/en/cli)
- [Claudable GitHub](https://github.com/opactorai/Claudable)
- [Claudable Discord Community](https://discord.gg/NJNbafHNQC)
