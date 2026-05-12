import { createRuntime } from "@pinocchio/core";
import { getEnv } from "@pinocchio/core/config/env";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./registerTools";

export async function main() {
  const runtime = createRuntime(getEnv());
  const server = new McpServer({
    name: "pinocchio",
    version: "0.1.0"
  });
  registerTools(server, runtime.toolRouter);
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
