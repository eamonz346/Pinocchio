import type { ToolRouter } from "@pinocchio/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerTools(server: McpServer, router: ToolRouter): void {
  const registerTool = (server as any).registerTool.bind(server);
  for (const tool of router.listModelTools()) {
    registerTool(
      tool.function.name,
      {
        description: tool.function.description,
        inputSchema: tool.function.parameters as any
      },
      async (args: unknown) => {
        const result = await router.executeTool(
          {
            id: `mcp_${Date.now()}`,
            type: "function",
            function: {
              name: tool.function.name,
              arguments: JSON.stringify(args)
            }
          },
          { requestId: "mcp" }
        );
        return { content: [{ type: "text" as const, text: result.content }] };
      }
    );
  }
}
