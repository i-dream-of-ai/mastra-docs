import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { LangfuseExporter } from '@mastra/observability-langfuse';
import { DefaultConsoleExporter } from '@mastra/core/ai-tracing';

import { chefAgent, chefAgentResponses, dynamicAgent, evalAgent } from './agents/index';
import { myMcpServer, myMcpServerTwo } from './mcp/server';
import { myWorkflow } from './workflows';

const storage = new LibSQLStore({
  url: 'file:./mastra.db',
});

export const mastra = new Mastra({
  agents: { chefAgent, chefAgentResponses, dynamicAgent, evalAgent },
  logger: new PinoLogger({ name: 'Chef', level: 'debug' }),
  storage,
  mcpServers: {
    myMcpServer,
    myMcpServerTwo,
  },
  workflows: { myWorkflow },
  bundler: {
    sourcemap: true,
  },
  serverMiddleware: [
    {
      handler: (c, next) => {
        console.log('Middleware called');
        return next();
      },
    },
  ],
  aiTracing: {
    instances: {
      langfuse_and_console: {
        serviceName: 'chef-agent',
        exporters: [
          new LangfuseExporter({
            publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
            secretKey: process.env.LANGFUSE_SECRET_KEY || '',
            baseUrl: process.env.LANGFUSE_BASE_URL,
            realtime: true,
          }),
          new DefaultConsoleExporter(),
        ],
      },
    },
  },
  // telemetry: {
  //   enabled: false,
  // }
});
