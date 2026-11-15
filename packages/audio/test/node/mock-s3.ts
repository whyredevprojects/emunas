import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { S3Like } from "../../src/publish/execute.ts";

export interface MockObject {
  size: number;
  etag: string; // quoted, like S3
  metadata?: Record<string, string>;
  contentType?: string;
}

export class MockS3 {
  readonly buckets = new Map<string, Map<string, MockObject>>();
  readonly calls: { name: string; input: Record<string, unknown> }[] = [];
  private etagSeq = 0;

  bucket(name: string): Map<string, MockObject> {
    let b = this.buckets.get(name);
    if (!b) {
      b = new Map();
      this.buckets.set(name, b);
    }
    return b;
  }

  put(bucket: string, key: string, size: number, etag?: string): MockObject {
    const obj: MockObject = { size, etag: etag ?? `"etag-${++this.etagSeq}"` };
    this.bucket(bucket).set(key, obj);
    return obj;
  }

  copies(): { name: string; input: Record<string, unknown> }[] {
    return this.calls.filter((c) => c.name === "CopyObject");
  }

  /** A client view; all clients share the same account-wide storage, like R2. */
  client(): S3Like {
    const send = async (command: unknown): Promise<unknown> => {
      if (command instanceof HeadObjectCommand) {
        const { Bucket, Key } = command.input;
        this.calls.push({ name: "HeadObject", input: { ...command.input } });
        const obj = this.bucket(String(Bucket)).get(String(Key));
        if (!obj) {
          const err = new Error("NotFound") as Error & { $metadata: { httpStatusCode: number } };
          err.name = "NotFound";
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { ContentLength: obj.size, ETag: obj.etag, Metadata: obj.metadata ?? {} };
      }
      if (command instanceof CopyObjectCommand) {
        const input = command.input;
        this.calls.push({ name: "CopyObject", input: { ...input } });
        const src = String(input.CopySource);
        const slash = src.indexOf("/");
        const srcBucket = src.slice(0, slash);
        const srcKey = src
          .slice(slash + 1)
          .split("/")
          .map(decodeURIComponent)
          .join("/");
        const obj = this.bucket(srcBucket).get(srcKey);
        if (!obj) {
          const err = new Error("NoSuchKey");
          err.name = "NoSuchKey";
          throw err;
        }
        if (input.CopySourceIfMatch && input.CopySourceIfMatch !== obj.etag) {
          const err = new Error("PreconditionFailed");
          err.name = "PreconditionFailed";
          throw err;
        }
        // A server-side copy gets a fresh ETag in the destination (as with multipart sources).
        const copy: MockObject = {
          size: obj.size,
          etag: `"copy-${++this.etagSeq}"`,
          metadata: { ...(input.Metadata ?? {}) },
          ...(input.ContentType ? { contentType: input.ContentType } : {}),
        };
        this.bucket(String(input.Bucket)).set(String(input.Key), copy);
        return {};
      }
      if (command instanceof ListObjectsV2Command) {
        this.calls.push({ name: "ListObjectsV2", input: { ...command.input } });
        const keys = [...this.bucket(String(command.input.Bucket)).keys()].sort();
        return { Contents: keys.map((Key) => ({ Key })), IsTruncated: false };
      }
      throw new Error(`MockS3: unexpected command ${String((command as { constructor?: { name?: string } }).constructor?.name)}`);
    };
    return { send } as unknown as S3Like;
  }
}
