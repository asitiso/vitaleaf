import { createHmac, randomBytes } from "node:crypto";

import {
  InquiryAccessError,
  issueUploadReceipt,
  verifyUploadReceipt,
  type InquirySubject,
  type InquiryUploadReceipt,
} from "../inquiries/access";
import { InquiryUploadError, detectImageType, validateUploadRequest } from "../inquiries/uploads";
import type { InquiryAttachment, InquiryImageContentType } from "../inquiries/types";
import { getAdminStorageBucket } from "./admin";

const SIGNED_URL_LIFETIME_MS = 5 * 60_000;
const MAX_ATTACHMENTS = 3;
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{8,64}$/u;
const FINAL_OBJECT_PATH = /^inquiries\/[A-Za-z0-9_-]{8,64}\/[A-Za-z0-9_-]{8,64}$/u;

type StorageBucket = ReturnType<typeof getAdminStorageBucket>;

type StorageDependencies = {
  getBucket?: () => StorageBucket;
};

type UploadUrlDependencies = StorageDependencies & {
  randomSegment?: () => string;
};

type CreateUploadUrlInput = {
  subject: InquirySubject;
  contentType: InquiryImageContentType;
  declaredSize: number;
  now: Date;
  secret: string;
};

type FinalizeUploadInput = {
  subject: InquirySubject;
  receipts: string[];
  inquiryId: string;
  now: Date;
  secret: string;
};

const getBucket = (dependencies: StorageDependencies): StorageBucket => (
  dependencies.getBucket ?? getAdminStorageBucket
)();

const requireClock = (now: Date): number => {
  const milliseconds = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isSafeInteger(milliseconds)) throw new InquiryUploadError();
  return milliseconds;
};

const requireSafeSegment = (value: string): string => {
  if (!SAFE_SEGMENT.test(value)) throw new InquiryUploadError();
  return value;
};

const requireHttpsUrl = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("Invalid signed Storage URL.");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Invalid signed Storage URL.");
  }
  return value;
};

const subjectHash = (subject: InquirySubject, secret: string): string => createHmac("sha256", secret)
  .update(subject.kind === "member" ? `member\0${subject.uid}` : `guest\0${subject.orderNumber}`)
  .digest("base64url");

export const createInquiryUploadUrl = async (
  input: CreateUploadUrlInput,
  dependencies: UploadUrlDependencies = {},
): Promise<{ uploadUrl: string; receipt: string; expiresAt: Date }> => {
  const { contentType, size } = validateUploadRequest({
    contentType: input.contentType,
    size: input.declaredSize,
  });
  const issuedAt = requireClock(input.now);
  const uploadId = requireSafeSegment(
    (dependencies.randomSegment ?? (() => randomBytes(18).toString("base64url")))(),
  );
  const objectPath = `inquiryPending/${subjectHash(input.subject, input.secret)}/${uploadId}`;
  const expiresAt = new Date(issuedAt + SIGNED_URL_LIFETIME_MS);
  const receipt = issueUploadReceipt(
    input.subject,
    objectPath,
    contentType,
    size,
    input.now,
    input.secret,
  );
  const [signedUrl] = await getBucket(dependencies).file(objectPath).getSignedUrl({
    version: "v4",
    action: "write",
    contentType,
    expires: expiresAt,
  });
  return {
    uploadUrl: requireHttpsUrl(signedUrl),
    receipt,
    expiresAt,
  };
};

const verifyReceipts = (input: FinalizeUploadInput): InquiryUploadReceipt[] => {
  if (
    !Array.isArray(input.receipts)
    || input.receipts.length > MAX_ATTACHMENTS
    || new Set(input.receipts).size !== input.receipts.length
    || !SAFE_SEGMENT.test(input.inquiryId)
  ) {
    throw new InquiryUploadError();
  }
  let verified: InquiryUploadReceipt[];
  try {
    verified = input.receipts.map((receipt) => verifyUploadReceipt(
      receipt,
      input.subject,
      input.now,
      input.secret,
    ));
  } catch (error) {
    if (error instanceof InquiryAccessError) throw new InquiryUploadError();
    throw error;
  }
  if (new Set(verified.map((receipt) => receipt.objectPath)).size !== verified.length) {
    throw new InquiryUploadError();
  }
  return verified;
};

const metadataSize = (value: unknown): number => {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) throw new InquiryUploadError();
  const size = Number(value);
  if (!Number.isSafeInteger(size)) throw new InquiryUploadError();
  return size;
};

const metadataGeneration = (value: unknown): string => {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/u.test(value)) {
    throw new InquiryUploadError();
  }
  return value;
};

const signatureLength = (contentType: InquiryImageContentType): number => {
  if (contentType === "image/jpeg") return 3;
  if (contentType === "image/png") return 8;
  return 12;
};

const missingObject = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === 404 || code === "404" || code === "not-found";
};

const deleteFile = async (file: ReturnType<StorageBucket["file"]>): Promise<void> => {
  try {
    await file.delete();
  } catch (error) {
    if (!missingObject(error)) throw error;
  }
};

const extensionFor = (contentType: InquiryImageContentType): "jpg" | "png" | "webp" => {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return "webp";
};

export const deleteInquiryObjects = async (
  storagePaths: readonly string[],
  dependencies: StorageDependencies = {},
): Promise<void> => {
  if (storagePaths.some((path) => !FINAL_OBJECT_PATH.test(path))) {
    throw new InquiryUploadError();
  }
  const uniquePaths = [...new Set(storagePaths)];
  if (uniquePaths.length === 0) return;
  const bucket = getBucket(dependencies);
  const results = await Promise.allSettled(uniquePaths.map((path) => deleteFile(bucket.file(path))));
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
};

export const finalizeInquiryUploads = async (
  input: FinalizeUploadInput,
  dependencies: StorageDependencies = {},
): Promise<InquiryAttachment[]> => {
  requireClock(input.now);
  const receipts = verifyReceipts(input);
  if (receipts.length === 0) return [];
  const bucket = getBucket(dependencies);
  const finalizedPaths: string[] = [];
  const attachments: InquiryAttachment[] = [];

  try {
    for (const [index, receipt] of receipts.entries()) {
      const metadataFile = bucket.file(receipt.objectPath);
      let pendingFile: ReturnType<StorageBucket["file"]> | null = null;
      try {
        const [metadata] = await metadataFile.getMetadata();
        const generation = metadataGeneration(metadata.generation);
        pendingFile = bucket.file(receipt.objectPath, { generation });
        const actualSize = metadataSize(metadata.size);
        if (actualSize !== receipt.declaredSize || metadata.contentType !== receipt.contentType) {
          throw new InquiryUploadError();
        }
        const requiredBytes = signatureLength(receipt.contentType);
        const [signature] = await pendingFile.download({ start: 0, end: requiredBytes - 1 });
        const detectedType = detectImageType(signature);
        if (detectedType !== receipt.contentType) {
          throw new InquiryUploadError();
        }

        const uploadId = requireSafeSegment(receipt.objectPath.split("/").at(-1) ?? "");
        const finalPath = `inquiries/${input.inquiryId}/${uploadId}`;
        finalizedPaths.push(finalPath);
        await pendingFile.move(finalPath);
        attachments.push({
          id: uploadId,
          storagePath: finalPath,
          originalName: `첨부 이미지 ${index + 1}.${extensionFor(detectedType)}`,
          contentType: detectedType,
          size: actualSize,
        });
      } catch (error) {
        if (pendingFile) await deleteFile(pendingFile);
        throw error;
      }
    }
    return attachments;
  } catch (error) {
    await deleteInquiryObjects(finalizedPaths, { getBucket: () => bucket });
    throw error;
  }
};

export const createInquiryAttachmentReadUrls = async (
  attachments: readonly InquiryAttachment[],
  now: Date,
  dependencies: StorageDependencies = {},
): Promise<string[]> => {
  const issuedAt = requireClock(now);
  if (attachments.some((attachment) => !FINAL_OBJECT_PATH.test(attachment.storagePath))) {
    throw new InquiryUploadError();
  }
  if (attachments.length === 0) return [];
  const expires = new Date(issuedAt + SIGNED_URL_LIFETIME_MS);
  const bucket = getBucket(dependencies);
  return Promise.all(attachments.map(async (attachment) => {
    const [signedUrl] = await bucket.file(attachment.storagePath).getSignedUrl({
      version: "v4",
      action: "read",
      expires,
    });
    return requireHttpsUrl(signedUrl);
  }));
};
