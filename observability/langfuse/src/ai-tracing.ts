/**
 * Langfuse Exporter for Mastra AI Tracing
 *
 * This exporter sends tracing data to Langfuse for AI observability.
 * Root spans start traces in Langfuse.
 * LLM_GENERATION spans become Langfuse generations, all others become spans.
 */

import { Langfuse } from 'langfuse';
import type { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';
import type { AITracingExporter, AITracingEvent, AnyAISpan, LLMGenerationMetadata } from '@mastra/core/ai-tracing';
import { AISpanType } from '@mastra/core/ai-tracing';

export interface LangfuseExporterConfig {
  /** Langfuse API key */
  publicKey: string;
  /** Langfuse secret key */
  secretKey: string;
  /** Langfuse host URL (defaults to cloud) */
  baseUrl?: string;
  /** Enable realtime mode - flushes after each event for immediate visibility */
  realtime?: boolean;
  /** Additional options for Langfuse client */
  options?: {
    debug?: boolean;
    flushAt?: number;
    flushInterval?: number;
    requestTimeout?: number;
  };
}

export class LangfuseExporter implements AITracingExporter {
  name = 'langfuse';
  private client: Langfuse;
  private realtime: boolean;
  private traceMap = new Map<string, {
    trace: LangfuseTraceClient;  // Langfuse trace object
    spans: Map<string, LangfuseSpanClient | LangfuseGenerationClient>;  // Maps span.id to Langfuse span/generation
  }>();

  constructor(config: LangfuseExporterConfig) {
    this.realtime = config.realtime ?? false;
    this.client = new Langfuse({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
      ...config.options,
    });
    console.log("created langfuse client: %s", this.client);
  }

  async exportEvent(event: AITracingEvent): Promise<void> {
    switch (event.type) {
      case 'span_started':
        await this.handleSpanStarted(event.span);
        break;
      case 'span_updated':
        await this.handleSpanUpdated(event.span);
        break;
      case 'span_ended':
        await this.handleSpanEnded(event.span);
        break;
    }

    // Flush immediately in realtime mode for instant visibility
    if (this.realtime) {
      await this.client.flushAsync();
    }
  }

  private async handleSpanStarted(span: AnyAISpan): Promise<void> {
    if (span.isRootSpan) {
      const trace = this.client.trace({
        id: span.trace.id,
        name: span.name,
        userId: span.metadata.attributes?.userId,
        sessionId: span.metadata.attributes?.sessionId,
        tags: span.metadata.tags,
        input: span.input,
        metadata: this.sanitizeMetadata(span.metadata.attributes),
      });
      this.traceMap.set(span.trace.id, {
        trace,
        spans: new Map(),
      });
    }

    // Create appropriate Langfuse object based on span type
    if (span.type === AISpanType.LLM_GENERATION) {
      await this.createLangfuseGeneration(span);
    } else {
      await this.createLangfuseSpan(span);
    }
  }

  private async handleSpanUpdated(span: AnyAISpan): Promise<void> {
    const traceData = this.traceMap.get(span.trace.id);
    if (!traceData) return;

    const langfuseObject = traceData.spans.get(span.id);
    if (!langfuseObject) return;

    // Update the Langfuse object with new metadata
    const updateData = this.buildUpdateData(span);
    langfuseObject.update(updateData);
  }

  private async handleSpanEnded(span: AnyAISpan): Promise<void> {
    const traceData = this.traceMap.get(span.trace.id);
    if (!traceData) return;

    const langfuseObject = traceData.spans.get(span.id);
    if (!langfuseObject) return;

    // End the Langfuse object
    const endData = this.buildEndData(span);
    langfuseObject.end(endData);

    if (span.isRootSpan) {
      traceData.trace.update({output: span.output})
      this.traceMap.delete(span.trace.id);
    }
  }

  private async createLangfuseGeneration(span: AnyAISpan): Promise<void> {
    const traceData = this.traceMap.get(span.trace.id);
    if (!traceData) return;

    const metadata = span.metadata as LLMGenerationMetadata;

    const parent = span.parent && traceData.spans.has(span.parent.id)
      ? traceData.spans.get(span.parent.id)!
      : traceData.trace;

    const generation = parent.generation({
      id: span.id,
      name: span.name,
      model: metadata.model,
      modelParameters: metadata.parameters
        ? {
            temperature: metadata.parameters.temperature,
            maxTokens: metadata.parameters.maxTokens,
            topP: metadata.parameters.topP,
            frequencyPenalty: metadata.parameters.frequencyPenalty,
            presencePenalty: metadata.parameters.presencePenalty,
            stop: metadata.parameters.stop,
          }
        : undefined,
      input: span.input,
      output: span.output,
      usage: metadata.usage
        ? {
            promptTokens: metadata.usage.promptTokens,
            completionTokens: metadata.usage.completionTokens,
            totalTokens: metadata.usage.totalTokens,
          }
        : undefined,
      metadata: {
        provider: metadata.provider,
        resultType: metadata.resultType,
        streaming: metadata.streaming,
        ...this.sanitizeMetadata(metadata.attributes),
      },
      tags: metadata.tags,
    });

    traceData.spans.set(span.id, generation);
  }

  private async createLangfuseSpan(span: AnyAISpan): Promise<void> {
    const traceData = this.traceMap.get(span.trace.id);
    if (!traceData) return;

    const parent = span.parent && traceData.spans.has(span.parent.id)
      ? traceData.spans.get(span.parent.id)!
      : traceData.trace;

    const langfuseSpan = parent.span({
      id: span.id,
      name: span.name,
      input: span.input,
      output: span.output,

      metadata: {
        spanType: span.type,
        ...this.sanitizeMetadata(span.metadata.attributes),
        ...this.extractTypeSpecificMetadata(span),
      },
      tags: span.metadata.tags,
    });

    traceData.spans.set(span.id, langfuseSpan);
  }

  private buildUpdateData(span: AnyAISpan): any {
    const baseData: any = {
      metadata: {
        spanType: span.type,
        ...this.sanitizeMetadata(span.metadata.attributes),
        ...this.extractTypeSpecificMetadata(span),
      },
      tags: span.metadata.tags,
    };

    // Add type-specific update data
    if (span.type === AISpanType.LLM_GENERATION) {
      const metadata = span.metadata as LLMGenerationMetadata;
      return {
        ...baseData,
        input: span.input,
        output: span.output,
        usage: metadata.usage
          ? {
              promptTokens: metadata.usage.promptTokens,
              completionTokens: metadata.usage.completionTokens,
              totalTokens: metadata.usage.totalTokens,
            }
          : undefined,
      };
    }

    return {
      ...baseData,
      input: span.input,
      output: span.output,
    };
  }

  private buildEndData(span: AnyAISpan): any {
    const baseData = {
      endTime: span.endTime,
      output: span.output,
      metadata: {
        spanType: span.type,
        ...this.sanitizeMetadata(span.metadata.attributes),
        ...this.extractTypeSpecificMetadata(span),
      },
      tags: span.metadata.tags,
    };

    // Add error information if present
    if (span.errorInfo) {
      return {
        ...baseData,
        level: 'ERROR',
        statusMessage: span.errorInfo.message,
      };
    }

    return {
      ...baseData,
      level: 'DEFAULT',
    };
  }

  private extractTypeSpecificMetadata(span: AnyAISpan): Record<string, any> {
    const metadata = span.metadata as any;
    const result: Record<string, any> = {};

    // Add type-specific metadata
    switch (span.type) {
      case AISpanType.AGENT_RUN:
        result.agentId = metadata.agentId;
        result.availableTools = metadata.availableTools;
        result.maxSteps = metadata.maxSteps;
        result.currentStep = metadata.currentStep;
        break;
      case AISpanType.TOOL_CALL:
        result.toolId = metadata.toolId;
        result.toolType = metadata.toolType;
        result.success = metadata.success;
        break;
      case AISpanType.MCP_TOOL_CALL:
        result.toolName = metadata.toolId; // Map toolId to toolName for Langfuse
        result.mcpServer = metadata.mcpServer;
        result.serverVersion = metadata.serverVersion;
        result.success = metadata.success;
        break;
      case AISpanType.WORKFLOW_RUN:
        result.workflowId = metadata.workflowId;
        result.status = metadata.status;
        break;
      case AISpanType.WORKFLOW_STEP:
        result.stepId = metadata.stepId;
        result.status = metadata.status;
        break;
    }

    return result;
  }

  private sanitizeMetadata(metadata: Record<string, any> | undefined): Record<string, any> {
    if (!metadata) return {};

    // Remove sensitive fields and ensure values are serializable
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (this.isSerializable(value)) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private isSerializable(value: any): boolean {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    await this.client.shutdownAsync();
    this.traceMap.clear();
  }
}
