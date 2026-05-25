import type {
  DelegatedPlatformInstallRequest,
  DevGenieManagedWriter,
  FullFileWriteRequest,
  JsonMergeRequest,
  KatanaPlatformManagedWriter,
  LastRunWriteRequest,
  LayeredWriteRequest,
  LockQueryRequest,
  ManagedRegionSnapshot,
  ManagedRegionWriteRequest,
  ManagedTargetLock,
  ManagedWriteOutcome,
  ManagedWriter,
  ManagedWriterRequest,
} from "../ports.js";

import {
  DevGenieManagedWriterAdapter,
  type DevGenieManagedWriterOptions,
} from "./dev-genie-writer.js";
import {
  KatanaPlatformWriterAdapter,
  type KatanaPlatformWriterOptions,
} from "./katana-platform.js";

export interface NodeManagedWriterAdapterOptions {
  readonly devGenie?: DevGenieManagedWriterOptions;
  readonly katana?: KatanaPlatformWriterOptions;
  readonly devGenieWriter?: DevGenieManagedWriter;
  readonly katanaWriter?: KatanaPlatformManagedWriter;
}

export class NodeManagedWriterAdapter implements ManagedWriter {
  private readonly devGenieWriter: DevGenieManagedWriter;
  private readonly katanaWriter: KatanaPlatformManagedWriter;

  constructor(options: NodeManagedWriterAdapterOptions = {}) {
    this.devGenieWriter = options.devGenieWriter ?? new DevGenieManagedWriterAdapter(options.devGenie);
    this.katanaWriter = options.katanaWriter ?? new KatanaPlatformWriterAdapter(options.katana);
  }

  readManagedRegion(request: ManagedWriterRequest): Promise<ManagedRegionSnapshot> {
    return this.devGenieWriter.readManagedRegion(request);
  }

  findLock(request: LockQueryRequest): Promise<ManagedTargetLock | null> {
    return this.devGenieWriter.findLock(request);
  }

  writeManagedRegion(request: ManagedRegionWriteRequest): Promise<ManagedWriteOutcome> {
    return this.devGenieWriter.writeManagedRegion(request);
  }

  writeLayered(request: LayeredWriteRequest): Promise<ManagedWriteOutcome> {
    return this.devGenieWriter.writeLayered(request);
  }

  mergeJson(request: JsonMergeRequest): Promise<ManagedWriteOutcome> {
    return this.devGenieWriter.mergeJson(request);
  }

  writeFullFile(request: FullFileWriteRequest): Promise<ManagedWriteOutcome> {
    return this.devGenieWriter.writeFullFile(request);
  }

  recordLastRun(request: LastRunWriteRequest): Promise<ManagedWriteOutcome> {
    return this.devGenieWriter.recordLastRun(request);
  }

  delegatePlatformInstall(request: DelegatedPlatformInstallRequest): Promise<ManagedWriteOutcome> {
    return this.katanaWriter.delegatePlatformInstall(request);
  }
}
