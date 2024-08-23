import { AdapterNotFoundError } from '../errors.js'
import type {
  Adapters,
  BasicLogger,
  CreateSchedulerConfig,
  Job,
  JobDefinition,
  JobManagerConfig,
  QueueNames,
  ScheduleJobOptions,
  WorkerConfig,
} from '../types.js'

import { Scheduler } from './Scheduler.js'
import type { WorkerOptions } from './Worker.js'
import { Worker } from './Worker.js'

export interface CreateWorkerArgs {
  index: number
  workoff: WorkerOptions['workoff']
  clear: WorkerOptions['clear']
  processName: string
}

export class JobManager<
  TAdapters extends Adapters,
  TQueues extends QueueNames,
  TLogger extends BasicLogger,
> {
  adapters: TAdapters
  queues: TQueues
  logger: TLogger
  workers: WorkerConfig<TAdapters, TQueues>[]

  constructor(
    config: JobManagerConfig<
      TAdapters,
      // This ensures that TQueues is never a string[]. It should be an array
      // of string literals (constructed by using `as const`)
      TQueues extends string[] ? never : TQueues,
      TLogger
    >,
  ) {
    this.adapters = config.adapters
    this.queues = config.queues
    this.logger = config.logger
    this.workers = config.workers
  }

  createScheduler(schedulerConfig: CreateSchedulerConfig<TAdapters>) {
    const scheduler = new Scheduler({
      adapter: this.adapters[schedulerConfig.adapter],
      logger: this.logger,
    })

    return <T extends Job<TQueues, any[]>>(
      job: T,
      jobArgs?: Parameters<T['perform']>,
      jobOptions?: ScheduleJobOptions,
    ) => {
      return scheduler.schedule({ job, jobArgs, jobOptions })
    }
  }

  createJob<TArgs extends unknown[]>(
    jobDefinition: JobDefinition<TQueues, TArgs>,
  ): Job<TQueues, TArgs> {
    // The cast is necessary because the JobDefinition type lacks the `name` and
    // `path` properties that are required by the Job type. These properties are
    // added to the job at build time by a plugin in the build process.
    return jobDefinition as Job<TQueues, TArgs>
  }

  createWorker({ index, workoff, clear, processName }: CreateWorkerArgs) {
    const config = this.workers[index]
    const adapter = this.adapters[config.adapter]
    if (!adapter) {
      throw new AdapterNotFoundError(config.adapter.toString())
    }

    return new Worker({
      adapter: this.adapters[config.adapter],
      logger: config.logger || this.logger,
      maxAttempts: config.maxAttempts,
      maxRuntime: config.maxRuntime,
      sleepDelay: config.sleepDelay,
      deleteFailedJobs: config.deleteFailedJobs,
      processName,
      queues: [config.queue].flat(),
      workoff,
      clear,
    })
  }
}