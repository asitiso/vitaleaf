"use client";

/* eslint-disable @next/next/no-img-element -- local preview blobs and Firebase URLs are not next/image-compatible. */

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { deleteProductImage, uploadProductImage, validateImageFile, type UploadTaskController } from "../../../lib/firebase/product-media";
import type { ProductMedia } from "../../../lib/products/types";

export type MediaUpload = (args: {
  productId: string;
  file: File;
  alt: string;
  order: number;
  onProgress(percent: number): void;
}) => UploadTaskController;

export type MediaDelete = (args: { productId: string; storagePath: string }) => Promise<void>;

type QueueStatus = "uploading" | "failed" | "complete";
type QueueItem = {
  id: number;
  file: File;
  alt: string;
  rank: number;
  previewUrl: string | null;
  progress: number;
  status: QueueStatus;
  error: string;
  media: ProductMedia | null;
  controller: UploadTaskController | null;
};

type DeleteTarget = { key: string; media: ProductMedia };

const itemKey = (item: ProductMedia): string => item.storagePath ?? `url:${item.url}`;
const ordinal = (index: number): string => index === 0 ? "첫 번째" : index === 1 ? "두 번째" : `${index + 1}번째`;
const defaultAlt = (file: File): string => file.name.replace(/\.[^.]+$/, "").trim() || "상품 이미지";
const messageFor = (error: unknown): string => error instanceof Error && error.message.trim()
  ? error.message
  : "이미지 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const reindex = (items: ProductMedia[]): ProductMedia[] => items.map((item, order) => ({ ...item, order }));

const makePreviewUrl = (file: File): string | null => {
  try {
    return typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
  } catch {
    return null;
  }
};

const revokePreviewUrl = (url: string | null): void => {
  if (!url || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  URL.revokeObjectURL(url);
};

export function MediaStep({
  productId,
  media,
  onChange,
  upload = uploadProductImage,
  deleteImage = deleteProductImage,
  onUploadingChange,
}: {
  productId: string;
  media: ProductMedia[];
  onChange(next: ProductMedia[]): void;
  upload?: MediaUpload;
  deleteImage?: MediaDelete;
  onUploadingChange?(uploading: boolean): void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<{ key: string; message: string } | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const mediaRef = useRef(media);
  const uploadCallbackRef = useRef(onUploadingChange);
  const nextId = useRef(0);
  const dragKey = useRef<string | null>(null);

  mediaRef.current = media;
  uploadCallbackRef.current = onUploadingChange;

  const replaceQueue = (next: QueueItem[]) => {
    queueRef.current = next;
    setQueue(next);
  };

  const mergedMedia = (items: QueueItem[], source = mediaRef.current): ProductMedia[] => {
    const complete = items
      .filter((item) => item.status === "complete" && item.media)
      .sort((first, second) => first.rank - second.rank)
      .map((item) => item.media!);
    const completeKeys = new Set(complete.map(itemKey));
    return reindex([...source.filter((item) => !completeKeys.has(itemKey(item))), ...complete]);
  };

  const emit = (items = queueRef.current, source = mediaRef.current) => {
    const next = mergedMedia(items, source);
    mediaRef.current = next;
    onChange(next);
    return next;
  };

  const beginUpload = (id: number) => {
    const current = queueRef.current.find((item) => item.id === id);
    if (!current) return;
    const validation = validateImageFile(current.file);
    if (!validation.ok) {
      replaceQueue(queueRef.current.map((item) => item.id === id ? {
        ...item,
        status: "failed",
        error: validation.message,
        controller: null,
      } : item));
      return;
    }

    const previewUrl = current.previewUrl ?? makePreviewUrl(current.file);
    const uploadingItem = {
      ...current,
      previewUrl,
      status: "uploading" as const,
      progress: 0,
      error: "",
      media: null,
      controller: null,
    };
    replaceQueue(queueRef.current.map((item) => item.id === id ? uploadingItem : item));

    let controller: UploadTaskController;
    try {
      controller = upload({
        productId,
        file: current.file,
        alt: current.alt,
        order: current.rank,
        onProgress: (progress) => {
          replaceQueue(queueRef.current.map((item) => item.id === id && item.status === "uploading" ? { ...item, progress } : item));
        },
      });
    } catch (error) {
      replaceQueue(queueRef.current.map((item) => item.id === id ? { ...item, status: "failed", error: messageFor(error) } : item));
      return;
    }

    replaceQueue(queueRef.current.map((item) => item.id === id ? { ...item, controller } : item));
    void controller.promise.then((uploaded) => {
      const item = queueRef.current.find((candidate) => candidate.id === id);
      if (!item || item.controller !== controller) return;
      revokePreviewUrl(item.previewUrl);
      const next = queueRef.current.map((candidate) => candidate.id === id ? {
        ...candidate,
        previewUrl: null,
        progress: 100,
        status: "complete" as const,
        media: { ...uploaded, alt: candidate.alt },
        controller: null,
      } : candidate);
      replaceQueue(next);
      emit(next);
    }, (error) => {
      const item = queueRef.current.find((candidate) => candidate.id === id);
      if (!item || item.controller !== controller) return;
      replaceQueue(queueRef.current.map((candidate) => candidate.id === id ? {
        ...candidate,
        status: "failed",
        error: messageFor(error),
        controller: null,
      } : candidate));
    });
  };

  useEffect(() => () => {
    queueRef.current.forEach((item) => {
      item.controller?.cancel();
      revokePreviewUrl(item.previewUrl);
    });
    uploadCallbackRef.current?.(false);
  }, []);

  useEffect(() => {
    onUploadingChange?.(queue.some((item) => item.status === "uploading"));
  }, [onUploadingChange, queue]);

  const displayedMedia = useMemo(() => mergedMedia(queue, media), [media, queue]);

  const addFiles = (files: FileList | File[]) => {
    const nextItems = Array.from(files).map((file) => ({
      id: nextId.current++,
      file,
      alt: defaultAlt(file),
      rank: mediaRef.current.length + queueRef.current.length,
      previewUrl: null,
      progress: 0,
      status: "uploading" as const,
      error: "",
      media: null,
      controller: null,
    }));
    replaceQueue([...queueRef.current, ...nextItems]);
    nextItems.forEach((item) => beginUpload(item.id));
  };

  const updateAlt = (target: ProductMedia, alt: string) => {
    const key = itemKey(target);
    const nextQueue = queueRef.current.map((item) => item.media && itemKey(item.media) === key ? {
      ...item,
      alt,
      media: { ...item.media, alt },
    } : item);
    replaceQueue(nextQueue);
    emit(nextQueue, mediaRef.current.map((item) => itemKey(item) === key ? { ...item, alt } : item));
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= displayedMedia.length) return;
    const next = [...displayedMedia];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    const indexed = reindex(next);
    const ranks = new Map(indexed.map((item) => [itemKey(item), item.order]));
    const nextQueue = queueRef.current.map((item) => item.media ? { ...item, rank: ranks.get(itemKey(item.media)) ?? item.rank } : item);
    replaceQueue(nextQueue);
    emit(nextQueue, indexed.filter((item) => !queueRef.current.some((queued) => queued.media && itemKey(queued.media) === itemKey(item))));
  };

  const requestDelete = (target: ProductMedia) => {
    setDeleteError(null);
    setDeleteTarget({ key: itemKey(target), media: target });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      if (deleteTarget.media.storagePath) {
        await deleteImage({ productId, storagePath: deleteTarget.media.storagePath });
      }
      const removedQueueItems = queueRef.current.filter((item) => item.media && itemKey(item.media) === deleteTarget.key);
      const nextQueue = queueRef.current.filter((item) => !item.media || itemKey(item.media) !== deleteTarget.key);
      removedQueueItems.forEach((item) => revokePreviewUrl(item.previewUrl));
      replaceQueue(nextQueue);
      emit(nextQueue, mediaRef.current.filter((item) => itemKey(item) !== deleteTarget.key));
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError({ key: deleteTarget.key, message: messageFor(error) });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  };

  const moveDraggedTo = (destination: number) => {
    const source = dragKey.current;
    dragKey.current = null;
    if (source === null) return;
    const from = displayedMedia.findIndex((item) => itemKey(item) === source);
    if (from >= 0) move(from, destination);
  };

  return (
    <section className="product-wizard__step-content product-media-step" aria-labelledby="wizard-media-title">
      <h2 id="wizard-media-title">상품 이미지를 준비하세요</h2>
      <p>파일별 진행 상태를 확인하고 대표 이미지와 설명을 관리하세요.</p>
      <div className="product-media-step__drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <label className="admin-secondary-button" htmlFor="product-media-files">상품 이미지 추가</label>
        <input id="product-media-files" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = "";
        }} />
        <p>JPEG, PNG, WebP 파일을 선택하거나 이 영역에 놓으세요. 파일당 10 MiB까지 가능합니다.</p>
      </div>

      {queue.filter((item) => item.status !== "complete").map((item) => (
        <article key={item.id} className="product-media-step__upload" aria-label={`${item.file.name} 업로드 상태`}>
          {item.previewUrl && <img src={item.previewUrl} alt="" />}
          <div><strong>{item.file.name}</strong>{item.status === "uploading" ? <><progress value={item.progress} max="100" /> <span>{item.progress}% 업로드 중</span><button type="button" onClick={() => item.controller?.cancel()}>{item.file.name} 업로드 취소</button></> : <><p role="alert">{item.error}</p><button type="button" onClick={() => beginUpload(item.id)}>{item.file.name} 다시 시도</button></>}</div>
        </article>
      ))}

      <div className="product-media-step__list" aria-label="등록한 상품 이미지">
        {displayedMedia.map((item, index) => {
          const key = itemKey(item);
          const queueItem = queue.find((candidate) => candidate.media && itemKey(candidate.media) === key);
          return (
            <article
              key={key}
              className="product-media-step__item"
              draggable
              onDragStart={() => { dragKey.current = key; }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); moveDraggedTo(index); }}
              onPointerDown={() => { dragKey.current = key; }}
              onPointerUp={() => moveDraggedTo(index)}
            >
              <img src={item.url} alt={item.alt} />
              <div><strong>{index === 0 ? "대표 이미지" : `${ordinal(index)} 이미지`}</strong>{queueItem && <span>업로드 완료</span>}</div>
              <label>대체 텍스트<input aria-label={`${ordinal(index)} 이미지 대체 텍스트`} value={item.alt} onChange={(event) => updateAlt(item, event.target.value)} /></label>
              <div className="product-media-step__item-actions">
                <button type="button" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`${ordinal(index)} 이미지를 왼쪽으로 이동`}>왼쪽으로 이동</button>
                <button type="button" disabled={index === displayedMedia.length - 1} onClick={() => move(index, index + 1)} aria-label={`${ordinal(index)} 이미지를 오른쪽으로 이동`}>오른쪽으로 이동</button>
                {index !== 0 && <button type="button" onClick={() => move(index, 0)}>대표로 설정</button>}
                <button type="button" onClick={() => requestDelete(item)} aria-label={`${ordinal(index)} 이미지 삭제`}>삭제</button>
              </div>
              {deleteError?.key === key && <p role="alert">{deleteError.message} <button type="button" onClick={() => requestDelete(item)} aria-label={`${ordinal(index)} 이미지 삭제 다시 시도`}>삭제 다시 시도</button></p>}
            </article>
          );
        })}
      </div>

      {deleteTarget && <div className="product-media-step__confirm" role="dialog" aria-modal="true" aria-labelledby="product-media-delete-title"><h3 id="product-media-delete-title">이미지를 삭제할까요?</h3><p>삭제한 이미지는 복구할 수 없습니다.</p><button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)}>취소</button><button type="button" disabled={deleting} onClick={() => void confirmDelete()}>삭제 확인</button></div>}
    </section>
  );
}
