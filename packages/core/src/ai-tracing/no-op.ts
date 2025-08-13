/**
 * No Op Implementation for MastraAITracing
 */

import type { MastraAITracing } from './base';
import type { AISpanType, AISpan, AISpanOptions, AISpanTypeMap, AnyAISpan } from './types';

export class NoOpAISpan<TType extends AISpanType = any> implements AISpan<TType> {
  public id: string;
  public name: string;
  public type: TType;
  public metadata: AISpanTypeMap[TType];
  public parent?: AnyAISpan;
  public trace: AnyAISpan;
  public traceId: string;
  public startTime: Date;
  public endTime?: Date;
  public aiTracing: MastraAITracing;
  public input?: any;
  public output?: any;
  public errorInfo?: {
    message: string;
    id?: string;
    domain?: string;
    category?: string;
    details?: Record<string, any>;
  };

  constructor(options: AISpanOptions<TType>, aiTracing: MastraAITracing) {
    this.id = 'no-op';
    this.name = options.name;
    this.type = options.type;
    this.metadata = options.metadata || ({} as AISpanTypeMap[TType]);
    this.parent = options.parent;
    this.trace = options.parent ? options.parent.trace : (this as any);
    this.traceId = 'no-op-trace';
    this.startTime = new Date();
    this.aiTracing = aiTracing;
    this.input = options.input;
  }

  end(_options?: {
    output?: any;
    metadata?: Partial<AISpanTypeMap[TType]>;
  }): void {}
  
  error(_options: {
    error: any;
    endSpan?: boolean;
    metadata?: Partial<AISpanTypeMap[TType]>;
  }): void {}
  
  createChildSpan<TChildType extends AISpanType>(options: {
    type: TChildType;
    name: string;
    input?: any;
    metadata?: AISpanTypeMap[TChildType];
  }): AISpan<TChildType> {
    return new NoOpAISpan<TChildType>({ ...options, parent: this }, this.aiTracing);
  }
  
  update(_options?: {
    input?: any;
    output?: any;
    metadata?: Partial<AISpanTypeMap[TType]>;
  }): void {}
  get isRootSpan(): boolean {
    return !this.parent;
  }
}
