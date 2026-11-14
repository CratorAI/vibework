/**
 * Tool Icons
 *
 * Icon rendering utilities for tools.
 */

import React from "react";
import {
  Globe,
  FileText,
  Search,
  Terminal,
  Edit,
  FolderOpen,
  MessageSquare,
  ListTodo,
  Link,
  Plug,
  BookOpen,
} from "@/lib/icons";
import { getMcpToolInfo } from "@/utils/toolDisplayUtils";
import { ServiceMark, resolveService } from "@/components/ServiceMark";

/**
 * Get icon component for a tool
 */
export function getToolIcon(name: string, _input?: unknown): React.ReactNode {
  const iconClass = "h-4 w-4 shrink-0";

  switch (name) {
    case "Bash":
      return <Terminal className={iconClass} />;
    case "Read":
      return <FileText className={iconClass} />;
    case "Write":
      return <Edit className={iconClass} />;
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return <Edit className={iconClass} />;
    case "Glob":
      return <FolderOpen className={iconClass} />;
    case "Grep":
      return <Search className={iconClass} />;
    case "Browser":
    case "WebSearch":
      return <Globe className={iconClass} />;
    case "WebFetch":
      return <Link className={iconClass} />;
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
    case "TaskList":
      return <ListTodo className={iconClass} />;
    case "AskUserQuestion":
      return <MessageSquare className={iconClass} />;
    case "Skill":
      return <BookOpen className={iconClass} />;
    default: {
      // Tools from the user's MCP servers: the service's logo when we have it
      const mcp = getMcpToolInfo(name);
      if (mcp) {
        const service = resolveService(mcp.server);
        return service ? <ServiceMark service={service} className="size-3.5" /> : <Plug className={iconClass} />;
      }
      return <FileText className={iconClass} />;
    }
  }
}
