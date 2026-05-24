import type { JsonObject, JsonValue } from "protocol";

export type JsonSchema = JsonObject;

export interface StructuredModelInput {
  readonly context: JsonValue;
  readonly rules?: JsonValue;
  readonly request: JsonValue;
}

export interface StructuredModelSchema<T> {
  readonly name: string;
  readonly schema: JsonSchema;
  readonly parse: (value: JsonValue) => T;
}

export interface StructuredModelRequest<T> {
  readonly input: StructuredModelInput;
  readonly output: StructuredModelSchema<T>;
}

export interface StructuredModelCaller {
  call<T>(request: StructuredModelRequest<T>): Promise<T>;
}

export class StructuredModelCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredModelCallError";
  }
}

export class StructuredModelUnavailableError extends StructuredModelCallError {
  constructor(readonly envName: string) {
    super(`Structured model call unavailable. Set ${envName} or inject a modelClient.`);
    this.name = "StructuredModelUnavailableError";
  }
}
