import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerEnv } from '@/lib/env';

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const env = getServerEnv();
  const config: any = {
    region: env.awsRegion,
  };
  if (env.s3AccessKeyId && env.s3SecretAccessKey) {
    config.credentials = {
      accessKeyId: env.s3AccessKeyId,
      secretAccessKey: env.s3SecretAccessKey,
    };
  }
  s3Client = new S3Client(config);
  return s3Client;
}

export interface PresignedUploadOptions {
  bucket: string;
  key: string;
  contentType: string;
  contentLength?: number;
  expiresIn?: number;
}

export async function getPresignedPutUrl(options: PresignedUploadOptions): Promise<string> {
  const { bucket, key, contentType, contentLength, expiresIn = 300 } = options;
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ...(contentLength ? { ContentLength: contentLength } : {}),
  });
  return getSignedUrl(client, command, { expiresIn });
}

export function buildObjectUrl(bucket: string, key: string, region: string): string {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
