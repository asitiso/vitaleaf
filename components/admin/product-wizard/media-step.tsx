"use client";

/* eslint-disable @next/next/no-img-element -- local preview blobs and Firebase URLs are not next/image-compatible. */

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

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
  attempt: number;
};

type DeleteTarget = { key: string; media: ProductMedia };

const itemKey = (item: ProductMedia): string => item.storagePath ?? `url:${item.url}`;
const pendingKey = (id: number): string => `pending:${id}`;
const ordinal = (index: number): string => index === 0 ? "첫 번째" : index === 1 ? "두 번째" : `${index + 1}번째`;
const defaultAlt = (file: File): string => file.name.replace(/\.[^.]+$/, "").trim() || "상품 이미지";
const messageFor = (error: unknown): string => error instanceof Error && error.message.trim()
  ? error.message
  : "이미지 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const reindex = (items: ProductMedia[]): ProductMedia[] => items.map((item, order) => ({ ...item, order }));
const mediaSignature = (items: ProductMedia[]): string => items.map((item) => `${itemKey(item)}:${item.url}:${item.order}:${item.alt}`).join("|");

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
  sessionId = null,
  media,
  onChange,
  upload = uploadProductImage,
  deleteImage = deleteProductImage,
  onUploadingChange,
}: {
  productId: string;
  sessionId?: string | null;
  media: ProductMedia[];
  onChange(next: ProductMedia[]): void;
  upload?: MediaUpload;
  deleteImage?: MediaDelete;
  onUploadingChange?(uploading: boolean): void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [renderMedia, setRenderMedia] = useState(media);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<{ key: string; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const queueRef = useRef<QueueItem[]>([]);
  const mediaRef = useRef(media);
  const onChangeRef = useRef(onChange);
  const uploadCallbackRef = useRef(onUploadingChange);
  const nextId = useRef(0);
  const dragKey = useRef<string | null>(null);
  const ranksRef = useRef(new Map<string, number>());
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const identity = `${productId}:${sessionId ?? "null"}`;
  const productIdRef = useRef(productId);
  const identityRef = useRef(identity);
  const resetIdentityRef = useRef(identity);
  const revokedUrlsRef = useRef(new Set<string>());
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const deleteConfirmRef = useRef<HTMLButtonElement>(null);
  const pendingEmissionSignaturesRef = useRef<string[]>([]);
  const focusRequestRef = useRef<string | null>(null);

  if (identityRef.current !== identity) {
    productIdRef.current = productId;
    identityRef.current = identity;
    generationRef.current += 1;
  }
  onChangeRef.current = onChange;
  uploadCallbackRef.current = onUploadingChange;
  media.forEach((item) => {
    if (!ranksRef.current.has(itemKey(item))) ranksRef.current.set(itemKey(item), item.order);
  });

  const replaceQueue = (next: QueueItem[]) => {
    queueRef.current = next;
    setQueue(next);
  };

  const revokeOwnedPreview = (url: string | null) => {
    if (!url || revokedUrlsRef.current.has(url)) return;
    revokedUrlsRef.current.add(url);
    revokePreviewUrl(url);
  };

  const mergedMedia = (items: QueueItem[], source = mediaRef.current): ProductMedia[] => {
    const complete = items
      .filter((item) => item.status === "complete" && item.media)
      .map((item) => ({ item: item.media!, rank: ranksRef.current.get(itemKey(item.media!)) ?? item.rank }));
    const completeKeys = new Set(complete.map((entry) => itemKey(entry.item)));
    return reindex([
      ...source.filter((item) => !completeKeys.has(itemKey(item))).map((item) => ({ item, rank: ranksRef.current.get(itemKey(item)) ?? item.order })),
      ...complete,
    ].sort((first, second) => first.rank - second.rank).map((entry) => entry.item));
  };

  const orderedKeys = (source = mediaRef.current): string[] => {
    const completeKeys = new Set(queueRef.current.filter((item) => item.media).map((item) => itemKey(item.media!)));
    return [
      ...source.filter((item) => !completeKeys.has(itemKey(item))).map((item) => itemKey(item)),
      ...queueRef.current.map((item) => item.media ? itemKey(item.media) : pendingKey(item.id)),
    ].sort((first, second) => (ranksRef.current.get(first) ?? 0) - (ranksRef.current.get(second) ?? 0));
  };

  const emit = (items = queueRef.current, source = mediaRef.current) => {
    const next = mergedMedia(items, source);
    mediaRef.current = next;
    setRenderMedia(next);
    pendingEmissionSignaturesRef.current.push(mediaSignature(next));
    onChangeRef.current(next);
    return next;
  };

  const beginUpload = (id: number) => {
    const generation = generationRef.current;
    const uploadProductId = productIdRef.current;
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
    const attempt = current.attempt + 1;
    const uploadingItem = {
      ...current,
      attempt,
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
        productId: uploadProductId,
        file: current.file,
        alt: current.alt,
        order: current.rank,
        onProgress: (progress) => {
          if (!mountedRef.current || generation !== generationRef.current) return;
          replaceQueue(queueRef.current.map((item) => item.id === id && item.status === "uploading" && item.attempt === attempt ? { ...item, progress } : item));
        },
      });
    } catch (error) {
      replaceQueue(queueRef.current.map((item) => item.id === id ? { ...item, status: "failed", error: messageFor(error) } : item));
      return;
    }

    replaceQueue(queueRef.current.map((item) => item.id === id ? { ...item, controller } : item));
    void controller.promise.then((uploaded) => {
      const item = queueRef.current.find((candidate) => candidate.id === id);
      if (!mountedRef.current || generation !== generationRef.current || !item || item.controller !== controller || item.attempt !== attempt) return;
      revokeOwnedPreview(item.previewUrl);
      const rank = ranksRef.current.get(pendingKey(id)) ?? item.rank;
      ranksRef.current.delete(pendingKey(id));
      ranksRef.current.set(itemKey(uploaded), rank);
      const next = queueRef.current.map((candidate) => candidate.id === id ? {
        ...candidate,
        previewUrl: null,
        progress: 100,
        status: "complete" as const,
        rank,
        media: { ...uploaded, alt: candidate.alt },
        controller: null,
      } : candidate);
      replaceQueue(next);
      emit(next);
    }, (error) => {
      const item = queueRef.current.find((candidate) => candidate.id === id);
      if (!mountedRef.current || generation !== generationRef.current || !item || item.controller !== controller || item.attempt !== attempt) return;
      replaceQueue(queueRef.current.map((candidate) => candidate.id === id ? {
        ...candidate,
        status: "failed",
        error: messageFor(error),
        controller: null,
      } : candidate));
    });
  };

  useEffect(() => {
    if (resetIdentityRef.current === identity) return;
    resetIdentityRef.current = identity;
    generationRef.current += 1;
    queueRef.current.forEach((item) => {
      item.controller?.cancel();
      revokeOwnedPreview(item.previewUrl);
    });
    ranksRef.current.clear();
    replaceQueue([]);
    setDeleteTarget(null);
    setDeleteError(null);
    setDeleting(false);
  }, [identity]);

  useEffect(() => {
    const signature = mediaSignature(media);
    const acknowledgement = pendingEmissionSignaturesRef.current.indexOf(signature);
    if (acknowledgement >= 0) {
      pendingEmissionSignaturesRef.current.splice(acknowledgement, 1);
      if (signature === mediaSignature(mediaRef.current)) {
        mediaRef.current = media;
        setRenderMedia(media);
      }
      return;
    }
    mediaRef.current = media;
    setRenderMedia(media);
    media.forEach((item, rank) => ranksRef.current.set(itemKey(item), rank));
    const byKey = new Map(media.map((item) => [itemKey(item), item]));
    const next = queueRef.current.flatMap((item) => {
      if (item.media && !byKey.has(itemKey(item.media))) return [];
      if (!item.media || !byKey.has(itemKey(item.media))) return [item];
      return [{
      ...item,
      media: byKey.get(itemKey(item.media))!,
      alt: byKey.get(itemKey(item.media))!.alt,
      }];
    });
    replaceQueue(next);
  }, [media]);

  useEffect(() => {
    const key = focusRequestRef.current;
    if (!key) return;
    const target = key.startsWith("retry:")
      ? document.querySelector<HTMLElement>(`[data-media-retry-key="${key.slice(6)}"]`)
      : Array.from(document.querySelectorAll<HTMLElement>("[data-media-key]")).find((item) => item.dataset.mediaKey === key && !(item as HTMLButtonElement).disabled)
      ?? document.getElementById("product-media-files");
    target?.focus();
    focusRequestRef.current = null;
  }, [queue, media, deleteError]);

  useEffect(() => {
    if (!deleteTarget) return;
    deleteCancelRef.current?.focus();
  }, [deleteTarget]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      queueRef.current.forEach((item) => {
        item.controller?.cancel();
        revokeOwnedPreview(item.previewUrl);
      });
      uploadCallbackRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    onUploadingChange?.(queue.some((item) => item.status === "uploading"));
  }, [onUploadingChange, queue]);

  const displayedMedia = useMemo(() => mergedMedia(queue, renderMedia), [queue, renderMedia]);

  const addFiles = (files: FileList | File[]) => {
    const firstRank = Math.max(-1, ...Array.from(ranksRef.current.values())) + 1;
    const nextItems = Array.from(files).map((file, index) => ({
      id: nextId.current++,
      file,
      alt: defaultAlt(file),
      rank: firstRank + index,
      previewUrl: null,
      progress: 0,
      status: "uploading" as const,
      error: "",
      media: null,
      controller: null,
      attempt: 0,
    }));
    nextItems.forEach((item) => ranksRef.current.set(pendingKey(item.id), item.rank));
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
    const movingKey = itemKey(displayedMedia[from]!);
    const destinationKey = itemKey(displayedMedia[to]!);
    const visibleKeys = new Set(displayedMedia.map(itemKey));
    const groups: string[][] = [];
    orderedKeys().forEach((key) => {
      if (visibleKeys.has(key) || groups.length === 0) groups.push([key]);
      else groups[groups.length - 1]!.push(key);
    });
    const sourceIndex = groups.findIndex((group) => group.includes(movingKey));
    const destinationIndex = groups.findIndex((group) => group.includes(destinationKey));
    const [sourceGroup] = groups.splice(sourceIndex, 1);
    const adjustedDestination = destinationIndex - (sourceIndex < destinationIndex ? 1 : 0);
    groups.splice(adjustedDestination + (from < to ? 1 : 0), 0, sourceGroup!);
    const keys = groups.flat();
    keys.forEach((key, rank) => ranksRef.current.set(key, rank));
    const nextQueue = queueRef.current.map((item) => ({ ...item, rank: ranksRef.current.get(item.media ? itemKey(item.media) : pendingKey(item.id)) ?? item.rank }));
    replaceQueue(nextQueue);
    emit(nextQueue);
    setAnnouncement(`${ordinal(to)} 이미지로 이동했습니다.`);
    focusRequestRef.current = movingKey;
  };

  const requestDelete = (target: ProductMedia) => {
    deleteTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDeleteError(null);
    setDeleteTarget({ key: itemKey(target), media: target });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    const generation = generationRef.current;
    const deleteProductId = productIdRef.current;
    setDeleting(true);
    try {
      if (deleteTarget.media.storagePath) {
        await deleteImage({ productId: deleteProductId, storagePath: deleteTarget.media.storagePath });
      }
      if (!mountedRef.current || generation !== generationRef.current) return;
      const removedQueueItems = queueRef.current.filter((item) => item.media && itemKey(item.media) === deleteTarget.key);
      const nextQueue = queueRef.current.filter((item) => !item.media || itemKey(item.media) !== deleteTarget.key);
      removedQueueItems.forEach((item) => revokeOwnedPreview(item.previewUrl));
      replaceQueue(nextQueue);
      emit(nextQueue, mediaRef.current.filter((item) => itemKey(item) !== deleteTarget.key));
      setDeleteTarget(null);
      focusRequestRef.current = itemKey(mergedMedia(nextQueue)[Math.min(mergedMedia(nextQueue).length - 1, 0)] ?? deleteTarget.media);
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      setDeleteError({ key: deleteTarget.key, message: messageFor(error) });
      setDeleteTarget(null);
      focusRequestRef.current = `retry:${deleteTarget.key}`;
    } finally {
      if (mountedRef.current && generation === generationRef.current) setDeleting(false);
    }
  };

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    deleteTriggerRef.current?.focus();
  };

  const handleDeleteDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !deleting) {
      event.preventDefault();
      closeDeleteDialog();
    }
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === deleteCancelRef.current) {
      event.preventDefault();
      deleteConfirmRef.current?.focus();
    } else if (!event.shiftKey && document.activeElement === deleteConfirmRef.current) {
      event.preventDefault();
      deleteCancelRef.current?.focus();
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  };

  const moveDraggedTo = (destination: number, draggedKey = dragKey.current) => {
    const source = draggedKey;
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
          <div><strong>{item.file.name}</strong>{item.status === "uploading" ? <><progress aria-label={`${item.file.name} 업로드 진행률`} value={item.progress} max="100" /> <span role="status">{item.progress}% 업로드 중</span><button type="button" onClick={() => item.controller?.cancel()}>{item.file.name} 업로드 취소</button></> : <><p role="alert">{item.error}</p><button type="button" onClick={() => beginUpload(item.id)}>{item.file.name} 다시 시도</button></>}</div>
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
              onDragStart={(event) => { dragKey.current = key; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", key); }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); moveDraggedTo(index, event.dataTransfer.getData("text/plain") || dragKey.current); }}
              onDragEnd={() => { dragKey.current = null; }}
              onPointerDown={() => { dragKey.current = key; }}
              onPointerUp={() => { moveDraggedTo(index); dragKey.current = null; }}
            >
              <img src={item.url} alt={item.alt} />
              <div><strong>{index === 0 ? "대표 이미지" : `${ordinal(index)} 이미지`}</strong>{queueItem && <span>업로드 완료</span>}</div>
              <label>대체 텍스트<input aria-label={`${ordinal(index)} 이미지 대체 텍스트`} value={item.alt} onChange={(event) => updateAlt(item, event.target.value)} /></label>
              <div className="product-media-step__item-actions">
                <button data-media-key={key} type="button" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`${ordinal(index)} 이미지를 왼쪽으로 이동`}>왼쪽으로 이동</button>
                <button data-media-key={key} type="button" disabled={index === displayedMedia.length - 1} onClick={() => move(index, index + 1)} aria-label={`${ordinal(index)} 이미지를 오른쪽으로 이동`}>오른쪽으로 이동</button>
                {index !== 0 && <button data-media-key={key} type="button" onClick={() => move(index, 0)} aria-label={`${ordinal(index)} 이미지를 대표로 설정`}>대표로 설정</button>}
                <button data-media-key={key} type="button" onClick={() => requestDelete(item)} aria-label={`${ordinal(index)} 이미지 삭제`}>삭제</button>
              </div>
              {deleteError?.key === key && <p role="alert">{deleteError.message} <button data-media-retry-key={key} type="button" onClick={() => requestDelete(item)} aria-label={`${ordinal(index)} 이미지 삭제 다시 시도`}>삭제 다시 시도</button></p>}
            </article>
          );
        })}
      </div>

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {deleteTarget && <div className="product-media-step__confirm" role="dialog" aria-modal="true" aria-labelledby="product-media-delete-title"><h3 id="product-media-delete-title">이미지를 삭제할까요?</h3><p>삭제한 이미지는 복구할 수 없습니다.</p><button ref={deleteCancelRef} type="button" disabled={deleting} onClick={closeDeleteDialog} onKeyDown={handleDeleteDialogKeyDown}>취소</button><button ref={deleteConfirmRef} type="button" disabled={deleting} onClick={() => void confirmDelete()} onKeyDown={handleDeleteDialogKeyDown}>삭제 확인</button></div>}
    </section>
  );
}
