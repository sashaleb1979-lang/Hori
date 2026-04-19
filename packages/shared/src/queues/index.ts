import { Queue, Worker, type JobsOptions, type Processor } from "bullmq";
import { QUEUE_NAMES } from "../constants";
import { getBullConnection } from "../redis";

export function createQueue<T>(name: string, redisUrl: string, prefix: string, defaultJobOptions?: JobsOptions) {
  return new Queue<T>(name, {
    connection: getBullConnection(redisUrl),
    prefix,
    defaultJobOptions
  });
}

export function createWorker<T>(
  name: string,
  redisUrl: string,
  prefix: string,
  processor: Processor<T>,
  concurrency = 1
) {
  return new Worker<T>(name, processor, {
    connection: getBullConnection(redisUrl),
    prefix,
    concurrency
  });
}

export function createAppQueues(redisUrl: string, prefix: string) {
  return {
    summary: createQueue(QUEUE_NAMES.summary, redisUrl, prefix, { removeOnComplete: 50, removeOnFail: 100 }),
    profile: createQueue(QUEUE_NAMES.profile, redisUrl, prefix, { removeOnComplete: 50, removeOnFail: 100 }),
    embedding: createQueue(QUEUE_NAMES.embedding, redisUrl, prefix, { removeOnComplete: 100, removeOnFail: 100 }),
    topic: createQueue(QUEUE_NAMES.topic, redisUrl, prefix, { removeOnComplete: 100, removeOnFail: 100 }),
    memoryFormation: createQueue(QUEUE_NAMES.memoryFormation, redisUrl, prefix, { removeOnComplete: 20, removeOnFail: 50 }),
    cleanup: createQueue(QUEUE_NAMES.cleanup, redisUrl, prefix, { removeOnComplete: 20, removeOnFail: 50 }),
    searchCache: createQueue(QUEUE_NAMES.searchCache, redisUrl, prefix, { removeOnComplete: 20, removeOnFail: 20 }),
    conversationAnalysis: createQueue(QUEUE_NAMES.conversationAnalysis, redisUrl, prefix, { removeOnComplete: 50, removeOnFail: 50 }),
    prefix
  };
}
