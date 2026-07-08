import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { uploadImage, deleteImage, getImages, pinImage, type ImageFile } from "../../lib/pageApi";
import {
  ModalOverlay,
  ModalContainer,
  TabHeader,
  Tab,
  UploadContainer,
  ImageGridWrapper,
  ImageGrid,
  ImageItem,
  CloseButton,
  LoadingContainer,
  ErrorContainer,
  LoadMoreButton,
  ImageStats,
  ActionButton,
  BottomContainer,
} from "../common/ImageUploadModal.styles";

type Props = {
  onClose: () => void;
  /** Called when the user inserts an image. `assetId` is null when the file
   * has no tracked DB row (legacy / external URL). Caller should persist
   * both into element props for downstream clone/import flows. */
  onSelect: (url: string, assetId: string | null) => void;
};

const SpinnerIcon = ({ size = 24 }: { size?: number }) => (
  <div style={{
    width: size, height: size,
    border: `3px solid ${size > 20 ? "#f3f3f3" : "#fff"}`,
    borderTop: `3px solid ${size > 20 ? "#2196F3" : "transparent"}`,
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: size > 20 ? 8 : 0,
    flexShrink: 0,
  }} />
);

const PAGE_SIZE = 24;

const DELETE_IMAGE_MESSAGE =
  "Delete this image?\n\nThis permanently removes it from your library. " +
  "Any page or element still using this image will show a broken image.";

const ImageUploadModal: React.FC<Props> = ({ onClose, onSelect }) => {
  const [activeTab, setActiveTab] = useState<"upload" | "yourImages">("upload");

  // ── Upload tab state ──
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedImageKey, setUploadedImageKey] = useState<string | null>(null);
  const [uploadedAssetId, setUploadedAssetId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ── Browser tab state ──
  const [userImages, setUserImages] = useState<ImageFile[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Search + pinned favourites (server-backed, shared per workspace) ──
  const [search, setSearch] = useState("");
  const [pinnedImages, setPinnedImages] = useState<ImageFile[]>([]);
  const [pinningKey, setPinningKey] = useState<string | null>(null);

  const isPinned = (key: string) => pinnedImages.some((p) => p.key === key);
  const togglePin = async (image: ImageFile) => {
    if (!image.assetId) return; // only Asset-tracked files can be pinned
    setPinningKey(image.key);
    try {
      const res = await pinImage(image.assetId, !isPinned(image.key));
      if (res.success) await loadImages(false);
      else setError(res.message || "Failed to update pin");
    } finally {
      setPinningKey(null);
    }
  };

  // Add CSS animation
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Initial load + debounced reload whenever the search query changes. Search
  // is server-side (full library via the Asset table), not client-side over the
  // loaded pages.
  useEffect(() => {
    const t = setTimeout(() => { loadImages(false); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadImages = async (loadMore: boolean) => {
    if (loadMore) setIsLoadingMore(true);
    else { setIsLoadingImages(true); setUserImages([]); setNextToken(null); }
    setError(null);

    try {
      const result = await getImages(
        undefined,                                      // no folder filter — flat library
        PAGE_SIZE,
        loadMore ? (nextToken ?? undefined) : undefined,
        search,                                         // server-side search
      );

      if (result.success) {
        setUserImages(prev => loadMore ? [...prev, ...result.files] : result.files);
        setPinnedImages(result.pinned);
        setHasMore(result.has_more);
        setNextToken(result.next_token);
        setTotalCount(result.total_count);
      } else {
        setError(result.error ?? "Failed to load images");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load images");
    } finally {
      setIsLoadingImages(false);
      setIsLoadingMore(false);
    }
  };

  // ── Upload ──
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setIsUploading(true);
    setError(null);
    try {
      const result = await uploadImage(acceptedFiles[0]);   // flat library — no folder
      if (result.success && result.url) {
        setPreview(result.url);
        setUploadedImageKey(result.key);
        setUploadedAssetId(result.assetId);
        await loadImages(false);
      } else {
        setError(result.message || "Upload failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const handleInsertImage = () => {
    if (preview) { onSelect(preview, uploadedAssetId); onClose(); }
  };

  const handleDeleteUploadedImage = async () => {
    if (!uploadedImageKey || !window.confirm(DELETE_IMAGE_MESSAGE)) return;
    setIsUploading(true);
    try {
      const result = await deleteImage(uploadedImageKey);
      if (result.success) {
        setPreview(null); setUploadedImageKey(null); setUploadedAssetId(null);
        await loadImages(false);
      }
      else setError(result.message || "Delete failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setIsUploading(false); }
  };

  const handleDeleteImage = async (image: ImageFile) => {
    if (!window.confirm(DELETE_IMAGE_MESSAGE)) return;
    setDeletingKey(image.key);
    setError(null);
    try {
      const result = await deleteImage(image.key);
      if (result.success) await loadImages(false); // server drops the Asset row → also unpins
      else setError(result.message || "Delete failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeletingKey(null); }
  };

  // Browse mode: pinned favourites first, then the loaded page (minus pins).
  // Search mode: the server already returns matches sorted pinned-first.
  const pinnedKeys = new Set(pinnedImages.map((p) => p.key));
  const displayImages = search.trim()
    ? userImages
    : [...pinnedImages, ...userImages.filter((img) => !pinnedKeys.has(img.key))];

  return (
    <ModalOverlay>
      <ModalContainer>
        <CloseButton onClick={onClose}>✖</CloseButton>

        <TabHeader>
          <Tab $active={activeTab === "upload"} onClick={() => setActiveTab("upload")}>UPLOAD</Tab>
          <Tab $active={activeTab === "yourImages"} onClick={() => setActiveTab("yourImages")}>YOUR IMAGES</Tab>
        </TabHeader>

        {error && <ErrorContainer>{error}</ErrorContainer>}

        {/* ── UPLOAD TAB ── */}
        {activeTab === "upload" && (
          <>
            <UploadContainer {...getRootProps()} style={{ marginTop: 16 }}>
              <input {...getInputProps()} />
              {isUploading ? (
                <><SpinnerIcon /><p style={{ margin: 0, fontSize: 14 }}>Uploading...</p></>
              ) : (
                <>
                  <div style={{ fontSize: 24, marginBottom: 8, color: "#999" }}>📁</div>
                  <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
                    Drag a file or <span style={{ color: "#2196F3", textDecoration: "underline" }}>click to upload</span>
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#999" }}>PNG, JPG, GIF, WebP, SVG — max 10MB</p>
                </>
              )}
            </UploadContainer>

            {preview && (
              <div style={{ marginTop: 16 }}>
                <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8, background: "#f9f9f9", display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={preview} alt="Preview" style={{ width: 60, height: 60, borderRadius: 6, objectFit: "cover" }} />
                  <div style={{ flex: 1, fontSize: 13, color: "#333" }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{uploadedImageKey?.split("/").pop() || "Uploaded Image"}</div>
                    <div style={{ color: "#888", fontSize: 12 }}>Ready to insert</div>
                  </div>
                  <div style={{ color: "#4caf50", fontSize: 18 }}>✓</div>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
                  <ActionButton onClick={handleInsertImage}>Insert</ActionButton>
                  <ActionButton variant="danger" onClick={handleDeleteUploadedImage} disabled={isUploading}>
                    {isUploading ? "Deleting..." : "Delete"}
                  </ActionButton>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── YOUR IMAGES TAB (flat — no folders) ── */}
        {activeTab === "yourImages" && (
          <ImageGridWrapper>
            <div style={{ position: "relative", margin: "12px 0 12px" }}>
              <i className="fas fa-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#aaa", fontSize: 13, pointerEvents: "none" }} />
              <input
                type="text"
                placeholder="Search images by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box", outline: "none" }}
              />
            </div>

            {isLoadingImages ? (
              <LoadingContainer>
                <SpinnerIcon size={36} />
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "#888" }}>Loading images…</p>
              </LoadingContainer>
            ) : (
              <>
                <ImageGrid>
                  {displayImages.length > 0 ? displayImages.map(image => (
                    <div key={image.key} style={{ position: "relative" }}>
                      <ImageItem
                        src={image.url}
                        alt={image.name}
                        onClick={() => { onSelect(image.url, image.assetId ?? null); onClose(); }}
                        style={{ opacity: deletingKey === image.key ? 0.4 : 1 }}
                        title={`${image.name} (${(image.size / 1024).toFixed(1)} KB)`}
                      />
                      {deletingKey === image.key && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.6)", borderRadius: 6 }}>
                          <SpinnerIcon size={20} />
                        </div>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); togglePin(image); }}
                        disabled={!image.assetId || pinningKey === image.key}
                        title={!image.assetId ? "Can't pin a legacy file" : isPinned(image.key) ? "Unpin" : "Pin to top"}
                        style={{ position: "absolute", top: 4, left: 4, width: 20, height: 20, background: isPinned(image.key) ? "rgba(33,150,243,0.9)" : "rgba(0,0,0,0.45)", color: "#fff", border: "none", borderRadius: "50%", fontSize: 10, lineHeight: 1, cursor: image.assetId ? "pointer" : "not-allowed", opacity: image.assetId ? 1 : 0.4, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <i className={pinningKey === image.key ? "fas fa-spinner fa-spin" : "fas fa-thumbtack"} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteImage(image); }}
                        disabled={!!deletingKey}
                        title="Delete"
                        style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, background: "rgba(220,38,38,0.85)", color: "#fff", border: "none", borderRadius: "50%", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        ×
                      </button>
                    </div>
                  )) : (
                    <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", color: "#aaa" }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🖼️</div>
                      <p style={{ margin: 0, fontSize: 14, color: "#888" }}>{search ? "No images match your search" : "No images yet"}</p>
                      {!search && <p style={{ margin: "4px 0 0", fontSize: 12 }}>Upload some images to see them here.</p>}
                    </div>
                  )}
                </ImageGrid>

                <BottomContainer>
                  <ImageStats>
                    {search
                      ? `${displayImages.length} result${displayImages.length !== 1 ? "s" : ""}`
                      : totalCount > 0
                        ? `Showing ${userImages.length} of ${totalCount} image${totalCount !== 1 ? "s" : ""}`
                        : ""}
                  </ImageStats>
                  {hasMore && (
                    <LoadMoreButton onClick={() => loadImages(true)} disabled={isLoadingMore}>
                      {isLoadingMore
                        ? <span style={{ display: "flex", alignItems: "center", gap: 6 }}><SpinnerIcon size={14} /> Loading…</span>
                        : "Load more"}
                    </LoadMoreButton>
                  )}
                </BottomContainer>
              </>
            )}
          </ImageGridWrapper>
        )}
      </ModalContainer>
    </ModalOverlay>
  );
};

export default ImageUploadModal;
