/**
 * AI Tracing Registry for Mastra
 *
 * Provides a global registry for AI tracing instances.
 */

import type { MastraAITracing } from './base';
import { SamplingStrategyType } from './types';

// ============================================================================
// Global AI Tracing Registry
// ============================================================================

/**
 * Global registry for AI Tracing instances.
 */
class AITracingRegistry {
  private instances = new Map<string, MastraAITracing>();

  /**
   * Register a tracing instance
   */
  register(name: string, instance: MastraAITracing): void {
    if (this.instances.has(name)) {
      throw new Error(`AI Tracing instance '${name}' already registered`);
    }

    this.instances.set(name, instance);
  }

  /**
   * Get a tracing instance by name
   */
  get(name: string): MastraAITracing | undefined {
    return this.instances.get(name);
  }

  /**
   * Unregister a tracing instance
   */
  unregister(name: string): boolean {
    return this.instances.delete(name);
  }

  /**
   * Shutdown all instances and clear the registry
   */
  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.instances.values()).map(instance => instance.shutdown());

    await Promise.allSettled(shutdownPromises);
    this.instances.clear();
  }

  /**
   * Clear all instances without shutdown
   */
  clear(): void {
    this.instances.clear();
  }

  /**
   * Get all registered instances
   */
  getAll(): ReadonlyMap<string, MastraAITracing> {
    return new Map(this.instances);
  }
}

const aiTracingRegistry = new AITracingRegistry();

// ============================================================================
// Registry Management Functions
// ============================================================================

/**
 * Register an AI tracing instance globally
 */
export function registerAITracing(name: string, instance: MastraAITracing): void {
  aiTracingRegistry.register(name, instance);
}

/**
 * Get an AI tracing instance from the registry
 */
export function getAITracing(name: string): MastraAITracing | undefined {
  return aiTracingRegistry.get(name);
}

/**
 * Unregister an AI tracing instance
 */
export function unregisterAITracing(name: string): boolean {
  return aiTracingRegistry.unregister(name);
}

/**
 * Shutdown all AI tracing instances and clear the registry
 */
export async function shutdownAITracingRegistry(): Promise<void> {
  await aiTracingRegistry.shutdown();
}

/**
 * Clear all AI tracing instances without shutdown
 */
export function clearAITracingRegistry(): void {
  aiTracingRegistry.clear();
}

/**
 * Get all registered AI tracing instances
 */
export function getAllAITracing(): ReadonlyMap<string, MastraAITracing> {
  return aiTracingRegistry.getAll();
}

/**
 * Check if AI tracing is available and enabled
 */
export function hasAITracing(name: string): boolean {
  const tracing = getAITracing(name);
  if (!tracing) return false;

  const config = tracing.getConfig();
  const sampling = config.sampling;

  // Check if sampling allows tracing
  return sampling.type !== SamplingStrategyType.NEVER;
}
